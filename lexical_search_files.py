import os
import pandas as pd
import streamlit as st
from typing import List, Dict, Any


# ============================================================
# Leitores auxiliares
# ============================================================
def read_excel_file(path: str) -> List[Dict[str, str]]:
    df = pd.read_excel(path, sheet_name=0, dtype=str)
    df = df.fillna("")
    return df.to_dict(orient="records")

def read_text_file(path: str) -> List[Dict[str, Any]]:
    results = []
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f, start=1):
            if line.strip():
                results.append({"paragraph_text": line.strip(), "paragraph_number": i})
    return results


# ============================================================
# Função principal de busca
# ============================================================
def lexical_search_in_files(search_term: str, file_paths: List[str], file_type: str) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []

    for file_path in file_paths:
        book = os.path.splitext(os.path.basename(file_path))[0]

        if file_type == "excel":
            content = read_excel_file(file_path)
            if not content:
                continue

            texto_key = list(content[0].keys())[0]  # sempre primeira coluna
            term = search_term.lower().strip()

            for idx, row in enumerate(content, start=2):  # começa em 2 porque linha 1 = cabeçalho
                texto = str(row.get(texto_key, "")).lower()
                if term in texto:
                    results.append({
                        "book": book,
                        "paragraph": row.get(texto_key, ""),
                        "paragraph_number": idx,
                        "metadata": row
                    })

        elif file_type in ["md", "text"]:
            content = read_text_file(file_path)
            term = search_term.lower().strip()

            for row in content:
                texto = row.get("paragraph_text", "").lower()
                if term in texto:
                    results.append({
                        "book": book,
                        "paragraph": row.get("paragraph_text"),
                        "paragraph_number": row.get("paragraph_number"),
                        "metadata": None
                    })

    return results


# ============================================================
# Streamlit App
# ============================================================
st.title("🔎 Lexical Search em Arquivos")

file_type = st.radio("Tipo de arquivo", ["excel", "md/text"])
search_term = st.text_input("Digite o termo de busca")
uploaded_files = st.file_uploader(
    "Carregue arquivos",
    type=["xlsx", "md", "txt"],
    accept_multiple_files=True
)

if uploaded_files and search_term:
    # Salvar uploads como arquivos temporários
    file_paths = []
    for uf in uploaded_files:
        temp_path = f"temp_{uf.name}"
        with open(temp_path, "wb") as f:
            f.write(uf.getbuffer())
        file_paths.append(temp_path)

    # Rodar busca
    results = lexical_search_in_files(
        search_term,
        file_paths,
        "excel" if file_type == "excel" else "text"
    )

    if results:
        st.success(f"✅ {len(results)} resultado(s) encontrado(s).")

        df_out = pd.DataFrame(results)
        st.subheader("📊 Resultados (tabela)")
        st.dataframe(df_out, use_container_width=True)

        st.subheader("📑 Resultados (JSON)")
        st.json(results)
    else:
        st.warning("Nenhum resultado encontrado.")
