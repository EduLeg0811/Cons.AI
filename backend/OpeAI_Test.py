
import logging
from dotenv import load_dotenv
from openai import OpenAI

from utils.config import (
    MODEL_LLM, 
    OPENAI_API_KEY, 
    TEMPERATURE, 
    INSTRUCTIONS_LLM_BACKEND,
    OPENAI_ID_ALLWV, 
    OPENAI_ID_ALLCONS
)

MODEL = "gpt-5-nano"

#................................................
# Variáveis de ambiente
#.................................................
load_dotenv()
  

logger = logging.getLogger(__name__)


#................................................
# Controle de sessão
#................................................
_llm_initialized = False
_llm_session_id = None


# Memória simples por conversa (somente em memória / por processo)
_conversation_last_id = {}  # chat_id -> último response.id



# =============================================================================
# Inicializa sessão do LLM (apenas uma vez)
# =============================================================================
def _get_llm_session():
    """
    Retorna o último response.id usado para encadear a conversa (se houver).
    Não dispara chamada à API.
    """
    global _llm_initialized, _llm_session_id
    if not _llm_initialized:
        _llm_initialized = True
    return _llm_session_id



# =============================================================================
# Função principal para gerar resposta do LLM
# =============================================================================
def generate_llm_answer(query, model=MODEL, vector_store_names=OPENAI_ID_ALLWV, temperature=TEMPERATURE, instructions=INSTRUCTIONS_LLM_BACKEND, use_session=True, chat_id="default"):
   
    client = OpenAI(api_key=OPENAI_API_KEY)

    if not query:
        return {"error": "Consulta vazia."}

    # Busca o id real do vector_store
    vector_store_ids = get_vector_store_ids(vector_store_names)

    # Recupera o último response.id dessa conversa
    previous_id = _conversation_last_id.get(chat_id) if use_session else None

    if str(model).startswith("gpt-5"):

        
        llm_str = {
            "model": model,
            "tools": [{
                "type": "file_search",
                "vector_store_ids": vector_store_ids,
                "max_num_results": int(LLM_MAX_RESULTS)
            }],
            "input": query,
            "instructions": instructions,   # reenvie sempre
            "store": True,                   # necessário para encadear
            "text": {"verbosity": "low"},
            "reasoning": {"effort": "minimal"}
        }

    else:

        llm_str = {
            "model": model,
            "tools": [{
                "type": "file_search",
            "vector_store_ids": vector_store_ids,
            "max_num_results": int(LLM_MAX_RESULTS)
        }],
        "input": query,
        "instructions": instructions,   # reenvie sempre
        "store": True,                   # necessário para encadear
        "temperature": float(temperature)
    }


    # adiciona previous_response_id se existir
    if previous_id:
        llm_str["previous_response_id"] = previous_id


    try:

        response = client.responses.create(**llm_str)

        # Atualiza o último id desta conversa
        last_id = getattr(response, "id", None)
        if last_id and use_session:
            _conversation_last_id[chat_id] = last_id


        return format_llm_response(response)

    except Exception as e:
        logger.error(f"Erro ao gerar resposta LLM: {str(e)}")
        return {"error": f"Falha ao gerar resposta: {str(e)}"}





def direct_llm_answer(query, model=MODEL, temperature=TEMPERATURE, instructions=INSTRUCTIONS_LLM_BACKEND, use_session=True, chat_id="default"):

    result = client.responses.create(
        model=model,
        input=query,
        reasoning={ "effort": "low" },
    text={ "verbosity": "low" },
    )

    return result.output_text