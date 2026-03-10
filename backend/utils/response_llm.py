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
    MAX_OUTPUT_TOKENS,
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

# MemÃƒÂ³ria simples por conversa (somente em memÃƒÂ³ria / por processo)
_conversation_last_id = {}  # chat_id -> ÃƒÂºltimo response.id


  

logger = logging.getLogger(__name__)


def _get_attr(item, key, default=None):
    if isinstance(item, dict):
        return item.get(key, default)
    return getattr(item, key, default)


def _clean_citation_filename(filename: str) -> str:
    if not filename:
        return ""
    name = str(filename).strip()
    name = name.split("/")[-1].split("\\")[-1]
    name = re.sub(r"\.(md|markdown|txt|pdf|docx|xlsx)$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def _strip_inline_citation_tokens(text: str) -> str:
    if not text:
        return ""
    cleaned = str(text)
    # remove classic inline refs: ã€...ã€‘
    cleaned = re.sub(r"\u3010[^\u3011]*\u3011", "", cleaned)
    # remove unresolved internal markers like: Ã®Ë†â‚¬fileciteÃ®Ë†â€šturn0...
    cleaned = re.sub(r"\S*filecite\S*", "", cleaned, flags=re.IGNORECASE)
    # remove common 'turnXfileY' leftovers
    cleaned = re.sub(r"\bturn\d+(?:file\d+)?\b", "", cleaned, flags=re.IGNORECASE)
    # collapse extra whitespace created by removals
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _collect_citations_map(response_main) -> dict:
    """
    Returns:
      dict[str, set[int|str]] mapping clean filename -> citation indices (when available).
    """
    if not isinstance(response_main, dict) and hasattr(response_main, "model_dump"):
        response_dict = response_main.model_dump()
    else:
        response_dict = response_main if isinstance(response_main, dict) else {}

    citations_map = {}

    for output_item in response_dict.get("output", []) or []:
        if _get_attr(output_item, "type") != "message":
            continue
        for content_item in (_get_attr(output_item, "content", []) or []):
            text = str(_get_attr(content_item, "text", "") or "")
            annotations = _get_attr(content_item, "annotations", []) or []

            # Structured citations from annotations (primary source of truth)
            for ann in annotations:
                if _get_attr(ann, "type") != "file_citation":
                    continue
                fc = _get_attr(ann, "file_citation", {}) or {}
                filename = (
                    _get_attr(ann, "filename")
                    or _get_attr(fc, "filename")
                    or _get_attr(fc, "file_name")
                    or ""
                )
                index = _get_attr(ann, "index")
                if index in (None, ""):
                    index = _get_attr(fc, "index")

                clean_name = _clean_citation_filename(filename)
                if not clean_name:
                    continue
                citations_map.setdefault(clean_name, set())
                if index not in (None, ""):
                    citations_map[clean_name].add(index)

            # Legacy inline pattern fallback: ã€...ã€‘
            for match in re.findall(r"\u3010[^\u3011]+\u3011", text):
                idx_match = re.search(r":(\d+)", match)
                file_match = re.search(r"\u2020([^)]+)\)", match)
                if not file_match:
                    continue
                clean_name = _clean_citation_filename(file_match.group(1))
                if not clean_name:
                    continue
                citations_map.setdefault(clean_name, set())
                if idx_match:
                    citations_map[clean_name].add(int(idx_match.group(1)))

    return citations_map


# =============================================================================
# FunÃƒÂ§ÃƒÂ£o principal para gerar resposta do LLM
# =============================================================================
def generate_llm_answer(
    query,
    model=MODEL_LLM,
    vector_store_names=DEFAULT_VECTOR_STORE_OPENAI,
    temperature=TEMPERATURE,
    llm_max_results=LLM_MAX_RESULTS,
    max_output_tokens=MAX_OUTPUT_TOKENS,
    instructions=INSTRUCTIONS_LLM_BACKEND,
    use_session=True,
    chat_id="default",
    timeout_s: int = 60,
    max_retries: int = 2,
    # novos parÃƒÂ¢metros opcionais para GPT-5 / GPT-5.1 / GPT-5.2
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
   

   
    # Branch para GPT-5.2 (temperature, usar reasoning/text)
    if model_str.startswith("gpt-5.2") or model_str.startswith("gpt-5.4"):
        llm_str = {
            "model": model,
            "tools": [{
                "type": "file_search",
                "vector_store_ids": vector_store_ids,
                "max_num_results": int(llm_max_results),
            }],
            "input": query,
            "instructions": instructions,
            "store": True,
            "reasoning": {"effort": "none"},
            "text": {"verbosity": "low"},
            "temperature": float(temperature),
            "max_output_tokens": int(max_output_tokens),
        }

    # Branch para GPT-5 / GPT-5.1 (nÃƒÂ£o usar temperature, usar reasoning/text)
    elif model_str.startswith("gpt-5"):
        llm_str = {
            "model": model,
            "tools": [{
                "type": "file_search",
                "vector_store_ids": vector_store_ids,
                "max_num_results": int(llm_max_results),
            }],
            "input": query,
            "instructions": instructions,
            "store": True,
            "reasoning": {"effort": "low"},
            "text": {"verbosity": "low"},
            "max_output_tokens": int(max_output_tokens),
        }

    # Branch para modelos "clÃƒÂ¡ssicos" (gpt-4.1, gpt-4o, etc.) Ã¢Å¾Å“ usam temperature
    else:
        llm_str = {
            "model": model,
            "tools": [{
                "type": "file_search",
                "vector_store_ids": vector_store_ids,
                "max_num_results": int(llm_max_results),
            }],
            "input": query,
            "instructions": instructions,
            "store": True,
            "temperature": float(temperature),
            "max_output_tokens": int(max_output_tokens),
        }

    # Adiciona ID da resposta anterior se existir (conversa multi-turn)
    if previous_id:
        llm_str["previous_response_id"] = previous_id

    #logger.info(f"\n\nPayload para LLM:\n{json.dumps(llm_str, indent=2, ensure_ascii=False)}\n\n")

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

                # Atualiza o ÃƒÂºltimo ID da conversa
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
                # Erros inesperados: nÃƒÂ£o faz retry
                raise ex

    except Exception as e:
        logger.error(f"Erro ao gerar resposta LLM: {str(e)}")
        return {"error": f"Falha ao gerar resposta: {str(e)}"}





# =============================================================================
# FunÃƒÂ§ÃƒÂ£o para obter IDs dos Vector Stores
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

    
    # Achata um nÃƒÂ­vel de listas aninhadas: [[id1], [id2]] -> [id1, id2]
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
                formatted_output["text"] = _strip_inline_citation_tokens(
                    str(getattr(response_main, "output_text", "")).strip()
                )
            elif isinstance(response_main, dict) and "text" in response_main:
                formatted_output["text"] = _strip_inline_citation_tokens(
                    str(response_main.get("text", "")).strip()
                )
            else:
                formatted_output["text"] = _strip_inline_citation_tokens(
                    str(response_main).strip()
                ) or "Resposta vazia"
            formatted_output["file_citations"] = extract_citations_string(response_main) or "No citations"
            return formatted_output
        message_output = next(
            (item for item in output_items if _get_attr(item, "type") == "message"),
            None,
        )
        if message_output:
            content = _get_attr(message_output, "content", []) or []
            text_content = next(
                (c for c in content if _get_attr(c, "type") == "output_text"),
                None,
            )
            if text_content:
                raw_text = str(_get_attr(text_content, "text", "")).strip()
                formatted_output["text"] = _strip_inline_citation_tokens(raw_text)
                formatted_output["file_citations"] = extract_citations_string(response_main) or "No citations"
        usage = getattr(response_main, "usage", None)
        if usage:
            formatted_output["total_tokens_used"] = getattr(usage, "total_tokens", "N/A")
    except Exception as e:
        logger.error(f"Erro ao formatar resposta LLM: {str(e)}")
        formatted_output["text"] = "Erro ao processar resposta."
    return formatted_output

def extract_citations_string(response_main) -> str:
    """
    Extrai e formata as cita??es de arquivos retornadas pela LLM.
    Aceita tanto objetos Response quanto dicts.
    Exemplo de sa?da: "TNP: 538, 816, 1044; 700EXP: 1307, 1590"
    """
    citations_map = _collect_citations_map(response_main)
    parts = []
    for name in sorted(citations_map.keys()):
        indices = [i for i in citations_map[name] if i not in (None, "")]
        if indices:
            ordered = sorted(indices, key=lambda x: str(x))
            indices_str = ", ".join(str(i) for i in ordered)
            parts.append(f"{name}: {indices_str}")
        else:
            parts.append(name)
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
        is_list_item = re.match(r'^\s*\d+\.\s', current_line) or re.match(r'^\s*[\u2022\-\*]\s', current_line)
        if is_list_item and i + 1 < len(lines):
            next_is_list_item = re.match(r'^\s*\d+\.\s', lines[i + 1]) or re.match(r'^\s*[\u2022\-\*]\s', lines[i + 1])
            if not next_is_list_item and lines[i + 1].strip() and not lines[i + 1].startswith('  '):
                result_lines.append('')
        if not current_line.strip():
            while i + 1 < len(lines) and not lines[i + 1].strip():
                i += 1
        i += 1
    return '\n'.join(result_lines)



# ____________________________________________________________________________
# Reset da memÃƒÂ³ria de uma conversa especÃƒÂ­fica
# ____________________________________________________________________________
def reset_conversation_memory(chat_id: str):
    """Remove o ÃƒÂºltimo response.id associado a um chat_id."""
    try:
        _conversation_last_id.pop(chat_id, None)
        logger.info(f"MemÃƒÂ³ria da conversa resetada: chat_id={chat_id}")
    except Exception as e:
        logger.error(f"Erro ao resetar memÃƒÂ³ria para chat_id={chat_id}: {e}")

#como usar no frontend

