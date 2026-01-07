import json
import logging
import os
import re
import time

from dotenv import load_dotenv
from openai import OpenAI
from openai import APIError, APIConnectionError, RateLimitError, APITimeoutError

from utils.config import (
    DEFAULT_VECTOR_STORE_OPENAI,
    INSTRUCTIONS_LLM_BACKEND,
    LLM_MAX_RESULTS,
    MODEL_LLM,
    OPENAI_API_KEY,
    TEMPERATURE,
    OPENAI_ID_ALLWV,
    OPENAI_ID_EDUNOTES,
    OPENAI_ID_ENGLISH,
    OPENAI_ID_REVISTAS,
    OPENAI_ID_AUTORES,
    OPENAI_ID_MINI,
)

load_dotenv()
logger = logging.getLogger(__name__)

# Memória simples por conversa (somente em memória / por processo)
_conversation_last_id = {}  # chat_id -> último response.id


  

logger = logging.getLogger(__name__)


# =============================================================================
# Função principal para gerar resposta do LLM
# =============================================================================
def generate_llm_answer(
    query,
    model=MODEL_LLM,
    vector_store_names=DEFAULT_VECTOR_STORE_OPENAI,
    temperature=TEMPERATURE,
    instructions=INSTRUCTIONS_LLM_BACKEND,
    use_session=True,
    chat_id="default",
    timeout_s: int = 60,
    max_retries: int = 2,
    # novos parâmetros opcionais para GPT-5 / GPT-5.1
    reasoning_effort: str = "none",   # "none" | "minimal" | "low" | "medium" | "high"
    verbosity: str = "low",          # "low" | "medium" | "high"
):
    client = OpenAI(api_key=OPENAI_API_KEY)

    if not query:
        return {"error": "Consulta vazia."}

    vector_store_ids = get_vector_store_ids(vector_store_names)
    previous_id = _conversation_last_id.get(chat_id) if use_session else None

    # -------------------------------------------------------------------------
    # Monta payload da Responses API
    # -------------------------------------------------------------------------
    model_str = str(model)
   

    # Branch para GPT-5 / GPT-5.1 (não usar temperature, usar reasoning/text)
    if model_str.startswith("gpt-5"):
        llm_str = {
            "model": model,
            "tools": [{
                "type": "file_search",
                "vector_store_ids": vector_store_ids,
                "max_num_results": int(LLM_MAX_RESULTS),
            }],
            "input": query,
            "instructions": instructions,
            "store": True,
            "reasoning": {"effort": reasoning_effort},
            "text": {"verbosity": verbosity},
        }

    # Branch para modelos "clássicos" (gpt-4.1, gpt-4o, etc.) ➜ usam temperature
    else:
        llm_str = {
            "model": model,
            "tools": [{
                "type": "file_search",
                "vector_store_ids": vector_store_ids,
                "max_num_results": int(LLM_MAX_RESULTS),
            }],
            "input": query,
            "instructions": instructions,
            "store": True,
            "temperature": float(temperature),
        }

    # Adiciona ID da resposta anterior se existir (conversa multi-turn)
    if previous_id:
        llm_str["previous_response_id"] = previous_id

    logger.info(f"\n\nPayload para LLM:\n{json.dumps(llm_str, indent=2, ensure_ascii=False)}\n\n")

    # -------------------------------------------------------------------------
    # Chamada com retry + timeout
    # -------------------------------------------------------------------------
    try:
        attempts = 0
        last_exc = None

        while attempts <= max_retries:
            try:
                response = client.with_options(timeout=timeout_s).responses.create(
                    **llm_str
                )

                # Atualiza o último ID da conversa
                last_id = getattr(response, "id", None)
                if last_id and use_session:
                    _conversation_last_id[chat_id] = last_id

                # Formata para o frontend
                formatted_response = format_llm_response(response)
                return formatted_response

            except (RateLimitError, APITimeoutError, APIError, APIConnectionError) as ex:
                last_exc = ex
                if attempts >= max_retries:
                    raise
                backoff = min(2 ** attempts, 8)
                time.sleep(backoff + 0.1 * attempts)
                attempts += 1

            except Exception as ex:
                # Erros inesperados: não faz retry
                raise ex

    except Exception as e:
        logger.error(f"Erro ao gerar resposta LLM: {str(e)}")
        return {"error": f"Falha ao gerar resposta: {str(e)}"}





# =============================================================================
# Função para obter IDs dos Vector Stores
# =============================================================================
def get_vector_store_ids(vector_store_names):

    # Accept list of IDs or a single label/ID
    def resolve_one(name_or_id):
        if not name_or_id:
            return DEFAULT_VECTOR_STORE_OPENAI
        s = str(name_or_id).strip()
        # If caller already passed an OpenAI Vector Store ID, use as-is
        if s.startswith("vs_"):
            return s
        # Accept known labels
        if s.upper() == "ALLWV":
            return OPENAI_ID_ALLWV
        if s.upper() == "EDUNOTES":
            return OPENAI_ID_EDUNOTES
        if s.upper() == "ENGLISH":
            return OPENAI_ID_ENGLISH
        if s.upper() == "REVISTAS":
            return OPENAI_ID_REVISTAS
        if s.upper() == "AUTORES":
            return OPENAI_ID_AUTORES
        if s.upper() == "MINI":
            return OPENAI_ID_MINI

        # Fallback to default
        return DEFAULT_VECTOR_STORE_OPENAI

    
    # Achata um nível de listas aninhadas: [[id1], [id2]] -> [id1, id2]
    if isinstance(vector_store_names, (list, tuple)):
        flat = []
        for x in vector_store_names:
            if isinstance(x, (list, tuple)):
                flat.extend(y for y in x if y)
            else:
                flat.append(x)
        return [resolve_one(x) for x in flat if x]
    else:
        return [resolve_one(vector_store_names)]


# =============================================================================
# Formata a resposta para o frontend
# =============================================================================
def format_llm_response(response_main):


    formatted_output = {
        "text": "",
        "file_citations": "No citations",
        "total_tokens_used": "N/A",
        "search_type": "ragbot"
    }

    try:
        output_items = getattr(response_main, "output", None)
        if output_items is None and isinstance(response_main, dict):
            output_items = response_main.get("output", None)

        if not output_items:
            if hasattr(response_main, "output_text"):
                formatted_output["text"] = str(getattr(response_main, "output_text", "")).strip()
            elif isinstance(response_main, dict) and "text" in response_main:
                formatted_output["text"] = str(response_main.get("text", "")).strip()
            else:
                formatted_output["text"] = str(response_main).strip() or "Resposta vazia"
            return formatted_output

        def get_attr(item, key, default=None):
            if isinstance(item, dict):
                return item.get(key, default)
            return getattr(item, key, default)

        message_output = next((item for item in output_items if get_attr(item, "type") == "message"), None)
        if message_output:
            content = get_attr(message_output, "content", []) or []
            text_content = next((c for c in content if get_attr(c, "type") == "output_text"), None)
            if text_content:
                raw_text = str(get_attr(text_content, "text", "")).strip()

                # ----------------------------------------------------------------
                # 1. Extrair todas as citações inline do texto (ex:  )
                # ----------------------------------------------------------------
                citation_pattern = r'【[^】]+】'
                inline_citations = re.findall(citation_pattern, raw_text)

                # Remove citações do texto final (para não exibir duplicado ao usuário)
                clean_text = re.sub(citation_pattern, "", raw_text).strip()

                # Junta todas as citações encontradas em uma única string
                if inline_citations:
                    collect_ref = " ".join(inline_citations)
                else:
                    collect_ref = ""

                formatted_output["text"] = clean_text

                # ----------------------------------------------------------------
                # 2. Determinar string final de citações
                # ----------------------------------------------------------------
                if collect_ref:
                    citations_str = collect_ref
                else:
                    citations_str = extract_citations_string(response_main)

                if ("【" in citations_str):
                    clean_citations = re.sub(r'【[^】]+】', '', citations_str).strip()
                    formatted_output["file_citations"] = clean_citations
                else:
                    formatted_output["file_citations"] = citations_str

        usage = getattr(response_main, "usage", None)
        if usage:
            formatted_output["total_tokens_used"] = getattr(usage, "total_tokens", "N/A")


    except Exception as e:
        logger.error(f"Erro ao formatar resposta LLM: {str(e)}")
        formatted_output["text"] = "Erro ao processar resposta."

    return formatted_output





def extract_citations_string(response_main) -> str:
    """
    Extrai e formata as citações de arquivos retornadas pela LLM.
    Aceita tanto objetos Response quanto dicts.
    Exemplo de saída: "TNP: 538, 816, 1044; 700EXP: 1307, 1590"
    """
    # Converte Response para dict se necessário
    if not isinstance(response_main, dict) and hasattr(response_main, "model_dump"):
        response_dict = response_main.model_dump()
    else:
        response_dict = response_main

    citations_map = {}

    # Percorre as saídas
    for output_item in response_dict.get("output", []):
        if output_item.get("type") == "message":
            for content_item in output_item.get("content", []):
                text = content_item.get("text", "")
                annotations = content_item.get("annotations", [])

                # 1. Extrai citações estruturadas
                for ann in annotations:
                    if ann.get("type") == "file_citation":
                        filename = ann.get("filename", "")
                        index = ann.get("index")
                        clean_name = filename.replace(".md", "").strip()
                        if " - " in clean_name:
                            clean_name = clean_name.split(" - ", 1)[1].split(" ", 1)[0]
                        citations_map.setdefault(clean_name, set()).add(index)

                # 2. Extrai citações inline do texto (padrão 【...】)
                inline_matches = re.findall(r'【[^】]+】', text)
                for match in inline_matches:
                    # Exemplo:  
                    idx_match = re.search(r':(\d+)', match)
                    file_match = re.search(r'†([^)]+)\)', match)
                    if idx_match and file_match:
                        index = int(idx_match.group(1))
                        file_raw = file_match.group(1).strip()
                        clean_name = file_raw.replace(".md", "")
                        if " - " in clean_name:
                            clean_name = clean_name.split(" - ", 1)[1].split(" ", 1)[0]
                        citations_map.setdefault(clean_name, set()).add(index)

    # Monta string final ordenada
    parts = []
    for name, indices in sorted(citations_map.items()):
        ordered = sorted(indices)
        indices_str = ", ".join(str(i) for i in ordered)
        parts.append(f"{name}: {indices_str}")

    return "; ".join(parts)

    























# =============================================================================
# Limpa o texto preservando listas
# =============================================================================
def clean_text(text):
    if not text:
        return text

    lines = text.split('\n')
    result_lines = []
    i = 0
    while i < len(lines):
        current_line = lines[i]
        result_lines.append(current_line)
        is_list_item = re.match(r'^\s*\d+\.\s', current_line) or re.match(r'^\s*[•\-\*]\s', current_line)
        if is_list_item and i + 1 < len(lines):
            next_is_list_item = re.match(r'^\s*\d+\.\s', lines[i + 1]) or re.match(r'^\s*[•\-\*]\s', lines[i + 1])
            if not next_is_list_item and lines[i + 1].strip() and not lines[i + 1].startswith('  '):
                result_lines.append('')
        if not current_line.strip():
            while i + 1 < len(lines) and not lines[i + 1].strip():
                i += 1
        i += 1
    return '\n'.join(result_lines)



# ____________________________________________________________________________
# Reset da memória de uma conversa específica
# ____________________________________________________________________________
def reset_conversation_memory(chat_id: str):
    """Remove o último response.id associado a um chat_id."""
    try:
        _conversation_last_id.pop(chat_id, None)
        logger.info(f"Memória da conversa resetada: chat_id={chat_id}")
    except Exception as e:
        logger.error(f"Erro ao resetar memória para chat_id={chat_id}: {e}")

#como usar no frontend
