# app_streamlit.py
import logging
from dotenv import load_dotenv
from openai import OpenAI
import streamlit as st
import json

from utils.config import (
    OPENAI_API_KEY, 
    TEMPERATURE, 
    INSTRUCTIONS_LLM_BACKEND,
    OPENAI_ID_ALLWV, 
    OPENAI_ID_ALLCONS
)

# ======================================================
# Configurações iniciais
# ======================================================
load_dotenv()
logger = logging.getLogger(__name__)

_llm_initialized = False
_llm_session_id = None
_conversation_last_id = {}  # chat_id -> último response.id


# ======================================================
# Funções auxiliares
# ======================================================
def get_vector_store_ids(vector_store_names):
    if isinstance(vector_store_names, str):
        return [vector_store_names]
    return vector_store_names


def format_llm_response(response):
    try:
        return response.output_text
    except Exception:
        return str(response)


def clean_response_dict(resp_obj):
    """Remove campos inúteis do JSON antes de exibir"""
    resp_dict = resp_obj.model_dump()
    # Remove alguns campos irrelevantes
    for k in ["metadata", "usage", "system_fingerprint"]:
        resp_dict.pop(k, None)
    return resp_dict


def generate_llm_answer(
    query, 
    model, 
    vector_store_names=OPENAI_ID_ALLWV, 
    temperature=TEMPERATURE, 
    instructions=INSTRUCTIONS_LLM_BACKEND, 
    use_session=True, 
    chat_id="default"
):
    client = OpenAI(api_key=OPENAI_API_KEY)

    if not query:
        return {"error": "Consulta vazia."}, None

    vector_store_ids = get_vector_store_ids(vector_store_names)
    previous_id = _conversation_last_id.get(chat_id) if use_session else None

    if str(model).startswith("gpt-5"):
        llm_str = {
            "model": model,
            "tools": [{
                "type": "file_search",
                "vector_store_ids": vector_store_ids,
                "max_num_results": 5
            }],
            "input": query,
            "instructions": instructions,
            "store": True
        }
    else:
        llm_str = {
            "model": model,
            "tools": [{
                "type": "file_search",
                "vector_store_ids": vector_store_ids,
                "max_num_results": 5
            }],
            "input": query,
            "instructions": instructions,
            "store": True,
            "temperature": float(temperature)
        }

    if previous_id:
        llm_str["previous_response_id"] = previous_id

    try:
        response = client.responses.create(**llm_str)
        last_id = getattr(response, "id", None)
        if last_id and use_session:
            _conversation_last_id[chat_id] = last_id

        return format_llm_response(response), clean_response_dict(response)
    except Exception as e:
        logger.error(f"Erro ao gerar resposta LLM: {str(e)}")
        return {"error": f"Falha ao gerar resposta: {str(e)}"}, None


# ======================================================
# Interface Streamlit
# ======================================================
st.set_page_config(page_title="Cons-AI", layout="wide")
st.title("🧠 Cons-AI - Interface LLM")

# Seleção do modelo
model_choice = st.selectbox(
    "Escolha o modelo da OpenAI:",
    ["gpt-4.1-nano", "gpt-4.1", "gpt-5-nano", "gpt-5-mini", "gpt-5"],
    index=2  # default = gpt-5-nano
)

# Layout em duas colunas
col_left, col_right = st.columns([2, 1])

with col_left:
    query = st.text_area("Digite sua pergunta:", height=100)
    run_btn = st.button("Enviar")

    if run_btn and query.strip():
        with st.spinner("Gerando resposta..."):
            resposta, raw_json = generate_llm_answer(query, model=model_choice)
            if isinstance(resposta, dict) and "error" in resposta:
                st.error(resposta["error"])
            else:
                st.markdown("### Resposta")
                st.write(resposta)

with col_right:
    st.markdown("### 📦 JSON da Resposta")
    if run_btn and query.strip():
        if raw_json:
            st.json(raw_json)
        else:
            st.info("Nenhum JSON disponível para esta resposta.")
