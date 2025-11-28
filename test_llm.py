# test_llm.py
# Pequena interface Streamlit para testar chamadas à OpenAI Responses API
# usando a mesma lógica básica da função generate_llm_answer.

import os
import time
import json
import re
from typing import Dict, Any, List, Optional

from dotenv import load_dotenv

import streamlit as st
from openai import OpenAI, APIError, APIConnectionError, RateLimitError, APITimeoutError

# --------------------------------------------------------------------
# Configuração básica
# --------------------------------------------------------------------
st.set_page_config(
    page_title="LLM Tester · Cons-AI",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Estilos extras (visual mais “clean” e moderno)
st.markdown(
    """
    <style>
    /* Fonte geral */
    html, body, [class*="css"]  {
        font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    /* Caixa de parâmetros */
    .param-card {
        padding: 1.5rem 1.5rem 1rem 1.5rem;
        border-radius: 1rem;
        background: linear-gradient(145deg, #111827, #020617);
        color: #e5e7eb;
        box-shadow: 0 18px 40px rgba(15,23,42,0.55);
        border: 1px solid rgba(148,163,184,0.3);
    }

    .param-card h2 {
        margin-top: 0;
        margin-bottom: 0.75rem;
        font-size: 1.45rem;
        font-weight: 600;
    }

    .param-subtitle {
        font-size: 0.86rem;
        color: #9ca3af;
        margin-bottom: 1rem;
    }

    .stButton>button {
        width: 100%;
        border-radius: 999px;
        padding: 0.6rem 1.2rem;
        font-weight: 600;
        border: 1px solid transparent;
        background: linear-gradient(135deg, #22c55e, #16a34a);
        color: white;
        box-shadow: 0 8px 24px rgba(34,197,94,0.4);
    }

    .stButton>button:hover {
        border-color: rgba(187,247,208,0.9);
        box-shadow: 0 12px 32px rgba(34,197,94,0.65);
    }

    .stTextInput>div>div>input,
    .stTextArea textarea,
    .stSelectbox>div>div>select {
        border-radius: 0.75rem;
    }

    .payload-card, .response-card {
        padding: 1rem 1rem 0.6rem 1rem;
        border-radius: 0.9rem;
        background-color: #020617;
        border: 1px solid rgba(51,65,85,0.9);
        box-shadow: 0 12px 32px rgba(15,23,42,0.7);
    }

    .payload-card h3, .response-card h3 {
        margin-top: 0;
        font-size: 0.9rem;
        font-weight: 600;
        color: #e5e7eb;
    }

    .response-text {
        padding: 0.75rem 0.9rem;
        border-radius: 0.75rem;
        border: 1px dashed rgba(75,85,99,0.9);
        max-height: 380px;
        overflow-y: auto;
        font-size: 0.9rem;
    }

    .timer-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.25rem 0.8rem;
        border-radius: 999px;
        border: 1px solid rgba(148,163,184,0.7);
        background: radial-gradient(circle at top left, #0f172a, #020617);
        font-size: 0.85rem;
        color: #e5e7eb;
        margin-bottom: 0.5rem;
    }

    .timer-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #22c55e;
        box-shadow: 0 0 0 4px rgba(34,197,94,0.3);
    }

    .info-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.18rem 0.7rem;
        border-radius: 999px;
        border: 1px solid rgba(148,163,184,0.6);
        font-size: 0.78rem;
        color: #9ca3af;
        margin-right: 0.3rem;
        margin-bottom: 0.3rem;
    }

    .info-pill-label {
        font-weight: 600;
        color: #e5e7eb;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

# --------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------
def build_llm_payload(
    model: str,
    query: str,
    vector_store_ids: Optional[List[str]],
    instructions: str,
    temperature: float,
    reasoning_effort: str,
    verbosity: str,
    previous_response_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Replica simplificada da lógica do generate_llm_answer para montar llm_str.
    """
    model_str = str(model)
    tools: List[Dict[str, Any]] = []

    if vector_store_ids:
        tools.append({
            "type": "file_search",
            "vector_store_ids": vector_store_ids,
            "max_num_results": 8,  # valor de teste; ajuste se quiser
        })

    if model_str.startswith("gpt-5"):
        llm_str: Dict[str, Any] = {
            "model": model,
            "input": query,
            "instructions": instructions,
            "store": True,
        }
        if tools:
            llm_str["tools"] = tools
        if reasoning_effort:
            llm_str["reasoning"] = {"effort": reasoning_effort}
        if verbosity:
            llm_str["text"] = {"verbosity": verbosity}
    else:
        llm_str = {
            "model": model,
            "input": query,
            "instructions": instructions,
            "store": True,
            "temperature": float(temperature),
        }
        if tools:
            llm_str["tools"] = tools

    if previous_response_id:
        llm_str["previous_response_id"] = previous_response_id

    return llm_str


def extract_clean_text_from_response(resp_obj: Any) -> str:
    """
    Tenta extrair o texto da resposta de forma amigável.
    1) Usa resp_obj.output_text se existir (versão nova do client)
    2) Fallback para resp_obj.output[...]
    3) Fallback final: str(resp_obj)
    Remove marcadores 【...】 para "limpar" citações inline.
    """
    raw_text: str = ""

    # 1) Novo helper da Responses API
    if hasattr(resp_obj, "output_text"):
        try:
            raw_text = str(resp_obj.output_text).strip()
        except Exception:
            raw_text = ""

    # 2) Fallback manual
    if not raw_text and hasattr(resp_obj, "output"):
        try:
            output_items = resp_obj.output or []
            for item in output_items:
                if getattr(item, "type", None) == "message":
                    content = getattr(item, "content", []) or []
                    for c in content:
                        if getattr(c, "type", None) == "output_text":
                            t = getattr(c, "text", "") or ""
                            raw_text = str(t).strip()
                            break
                if raw_text:
                    break
        except Exception:
            pass

    # 3) Ultimo fallback
    if not raw_text:
        raw_text = str(resp_obj)

    # Limpa citações inline do padrão 【...】
    clean = re.sub(r"【[^】]+】", "", raw_text).strip()
    return clean


def response_to_dict(resp_obj: Any) -> Dict[str, Any]:
    """
    Converte o objeto Response em dict para exibir em JSON.
    Usa model_dump() da nova lib; fallback para str se necessário.
    """
    if hasattr(resp_obj, "model_dump"):
        try:
            return resp_obj.model_dump()
        except Exception:
            pass

    # fallback
    try:
        return json.loads(str(resp_obj))
    except Exception:
        return {"raw": str(resp_obj)}


# --------------------------------------------------------------------
# Layout principal
# --------------------------------------------------------------------
st.title("🔬 Teste de LLM · OpenAI Responses API")

load_dotenv()
api_key = os.getenv("OPENAI_API_KEY", "")
if not api_key:
    st.error("OPENAI_API_KEY não encontrado no ambiente. Defina a variável antes de usar.")
    st.stop()

client = OpenAI(api_key=api_key)

col_left, col_right = st.columns([1.05, 1.25])

# ----------------------------- COLUNA ESQUERDA -----------------------------
with col_left:
    st.markdown('<div class="param-card">', unsafe_allow_html=True)
    st.markdown("### ⚙️ Parâmetros da LLM", unsafe_allow_html=True)
    st.markdown(
        '<div class="param-subtitle">Ajuste os parâmetros, visualize o payload `llm_str` e envie a requisição.</div>',
        unsafe_allow_html=True,
    )

    with st.form("llm_form", clear_on_submit=False):
        model = st.selectbox(
            "Modelo",
            options=[
                "gpt-5.1",
                "gpt-5-nano",
                "gpt-4.1-mini",
                "gpt-4.1-nano",
            ],
            index=0,
            help="Modelos mais recentes recomendados para uso com Responses API.",
        )

        query = st.text_area(
            "Query / Pergunta",
            height=140,
            placeholder="Digite aqui a pergunta ou texto para a LLM…",
        )

        instructions = st.text_area(
            "Instructions (opcional)",
            value="Você é um assistente especializado em Conscienciologia. Responda de forma clara e objetiva.",
            height=90,
        )

        st.markdown("##### Parâmetros específicos", unsafe_allow_html=True)

        if str(model).startswith("gpt-5"):
            reasoning_effort = st.selectbox(
                "reasoning.effort",
                options=["none", "minimal", "low", "medium", "high"],
                index=2,
                help="Nível de esforço de raciocínio (modelos GPT-5.x).",
            )
            verbosity = st.selectbox(
                "text.verbosity",
                options=["low", "medium", "high"],
                index=0,
                help="Tamanho/detalhe da resposta gerada.",
            )
        else:
            reasoning_effort = "none"
            verbosity = "low"
            temperature = st.slider(
                "temperature",
                min_value=0.0,
                max_value=1.0,
                value=0.2,
                step=0.05,
                help="Controla a aleatoriedade (modelos não-GPT-5).",
            )

        timeout_s = st.slider(
            "Timeout (segundos)",
            min_value=5,
            max_value=120,
            value=30,
            step=5,
            help="Tempo máximo de espera em cada requisição à OpenAI.",
        )

        st.markdown("##### Vector Store (file_search opcional)", unsafe_allow_html=True)
        vs_ids_str = st.text_input(
            "Vector store IDs (opcional, separados por vírgula)",
            value="vs_6912908250e4819197e23fe725e04fae",
            help="Exemplo: vs_abc123, vs_def456. Se vazio, não usa file_search.",
        )

        previous_response_id = st.text_input(
            "previous_response_id (opcional)",
            value="",
            help="Para testar conversas multi-turn da Responses API.",
        )

        submitted = st.form_submit_button("Enviar para OpenAI")

    # Monta o payload mesmo antes de enviar (para visualização)
    vector_store_ids = [s.strip() for s in vs_ids_str.split(",") if s.strip()] or None
    temp_for_payload = temperature if not str(model).startswith("gpt-5") else 0.0

    llm_str_preview = build_llm_payload(
        model=model,
        query=query or "",
        vector_store_ids=vector_store_ids,
        instructions=instructions or "",
        temperature=temp_for_payload,
        reasoning_effort=reasoning_effort,
        verbosity=verbosity,
        previous_response_id=previous_response_id or None,
    )

    st.markdown("</div>", unsafe_allow_html=True)  # fecha param-card

    # Card para mostrar o payload llm_str
    st.markdown('<div style="margin-top:1.1rem;" class="payload-card">', unsafe_allow_html=True)
    st.markdown("#### 📦 Payload `llm_str`", unsafe_allow_html=True)
    st.markdown(
        "<span style='font-size:0.85rem;color:#9ca3af;'>Este é o objeto enviado para "
        "<code>client.with_options(timeout=timeout_s).responses.create(**llm_str)</code>.</span>",
        unsafe_allow_html=True,
    )
    st.code(json.dumps(llm_str_preview, indent=2, ensure_ascii=False), language="json")
    st.markdown("</div>", unsafe_allow_html=True)

# ----------------------------- COLUNA DIREITA -----------------------------
with col_right:
    st.markdown('<div class="response-card">', unsafe_allow_html=True)
    st.markdown("### 🧾 Resposta da LLM", unsafe_allow_html=True)

    if submitted:
        if not query.strip():
            st.warning("Informe uma query antes de enviar.")
        else:
            # Executa chamada à OpenAI
            error_msg = None
            response_obj = None
            elapsed = None

            with st.spinner("Consultando OpenAI…"):
                try:
                    # Garante que o payload use o mesmo timeout informado
                    start = time.perf_counter()
                    response_obj = client.with_options(timeout=timeout_s).responses.create(
                        **llm_str_preview
                    )
                    elapsed = time.perf_counter() - start
                except (RateLimitError, APITimeoutError, APIConnectionError, APIError) as ex:
                    error_msg = f"Erro da OpenAI: {ex}"
                except Exception as ex:
                    error_msg = f"Erro inesperado: {ex}"

            if error_msg:
                st.error(error_msg)
            elif response_obj:
                # Timer / meta info
                st.markdown(
                    f"""
                    <div class="timer-pill">
                        <div class="timer-dot"></div>
                        <span><strong>Tempo de resposta:</strong> {elapsed:.2f} s</span>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )

                # Metadados simples
                meta_line = []
                meta_line.append(
                    f"<span class='info-pill'><span class='info-pill-label'>Modelo</span> {model}</span>"
                )
                if str(model).startswith("gpt-5"):
                    meta_line.append(
                        f"<span class='info-pill'><span class='info-pill-label'>Effort</span> {reasoning_effort}</span>"
                    )
                    meta_line.append(
                        f"<span class='info-pill'><span class='info-pill-label'>Verbosity</span> {verbosity}</span>"
                    )
                else:
                    meta_line.append(
                        f"<span class='info-pill'><span class='info-pill-label'>Temperature</span> {temperature:.2f}</span>"
                    )

                st.markdown(" ".join(meta_line), unsafe_allow_html=True)

                # Texto limpo
                clean_text = extract_clean_text_from_response(response_obj)
                st.markdown("#### 📝 Texto de resposta limpo", unsafe_allow_html=True)
                st.markdown(
                    "<div class='response-text'>"
                    + clean_text.replace("\n", "<br/>")
                    + "</div>",
                    unsafe_allow_html=True,
                )

                # JSON bruto
                st.markdown("#### 🧩 JSON completo da resposta", unsafe_allow_html=True)
                resp_dict = response_to_dict(response_obj)
                st.json(resp_dict)
    else:
        st.info("Configure os parâmetros à esquerda e clique em **Enviar para OpenAI** para ver a resposta aqui.")

    st.markdown("</div>", unsafe_allow_html=True)
