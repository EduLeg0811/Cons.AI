import os
import logging
from typing import List, Dict, Any
import pandas as pd
import streamlit as st

# ============================================================
# Leitor de Excel -> lista de dicionários (uma linha = um dict)
# ============================================================
def _read_excel_file(path: str) -> List[Dict[str, str]]:
    df = pd.read_excel(path, sheet_name=0, dtype=str)  # lê tudo como string
    df = df.fillna("")
    data = df.to_dict(orient="records")
    return data

# ============================================================
# Busca lexical: SOMENTE na coluna A
# - Preferimos a coluna chamada "texto" (case-insensitive); se não existir,
#   usamos a PRIMEIRA coluna do arquivo (coluna A).
# - results contém TODOS os campos da linha encontrada (+ nome do arquivo em "book").
# ============================================================
def lexical_search_in_excel_files(search_term: str, source: List[str]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []

    for file_path in source:
        try:
            content = _read_excel_file(file_path)  # lista de dicts (cada linha)
            book = os.path.splitext(os.path.basename(file_path))[0]

            if not content:
                continue

            # Descobrir qual chave corresponde à coluna A:
            # 1) tentar coluna chamada "texto" (qualquer caixa)
            # 2) senão, usar a primeira coluna do arquivo (ordem preservada pelo pandas)
            first_row = content[0]
            col_names_in_order = list(first_row.keys())
            texto_key = next((k for k in col_names_in_order if k.strip().lower() == "texto"),
                             col_names_in_order[0])

            # Percorrer as linhas e buscar SOMENTE em texto_key (coluna A)
            cleanTerm = search_term.strip().lower()
            if not cleanTerm:
                continue

            for row in content:
                cell_val = str(row.get(texto_key, "")).lower()
                if cleanTerm in cell_val:
                    # Incluir TODOS os campos da linha + o nome do arquivo
                    result_entry = {"book": book}
                    result_entry.update(row)
                    results.append(result_entry)

        except Exception as e:
            logging.error(f"Erro ao processar {file_path}: {e}")

    return results

# ============================================================
# App Streamlit
# ============================================================
st.title("🔎 Lexical Search em Arquivos Excel (busca só na coluna A)")

uploaded_files = st.file_uploader(
    "Carregue um ou mais arquivos Excel (.xlsx)",
    type="xlsx",
    accept_multiple_files=True
)
search_term = st.text_input("Digite o termo de busca (será procurado apenas na coluna A / 'texto')")

if uploaded_files and search_term:
    # Salva uploads em arquivos temporários locais
    file_paths = []
    for uf in uploaded_files:
        temp_path = f"temp_{uf.name}"
        with open(temp_path, "wb") as f:
            f.write(uf.getbuffer())
        file_paths.append(temp_path)

    results = lexical_search_in_excel_files(search_term, file_paths)

    if results:
        st.success(f"✅ {len(results)} resultado(s) encontrado(s).")
        df_out = pd.DataFrame(results)

        st.subheader("📊 Resultados (tabela)")
        st.dataframe(df_out, use_container_width=True)

        st.subheader("📑 Resultados como variável dict (lista de dicionários)")
        st.json(results)

        # Download JSON
        import json
        st.download_button(
            "⬇️ Baixar resultados (JSON)",
            data=json.dumps(results, ensure_ascii=False, indent=2),
            file_name="resultados.json",
            mime="application/json"
        )

        # Download Excel
        from io import BytesIO
        bio = BytesIO()
        with pd.ExcelWriter(bio, engine="openpyxl") as writer:
            df_out.to_excel(writer, index=False, sheet_name="Resultados")
        bio.seek(0)

        st.download_button(
            "⬇️ Baixar resultados (XLSX)",
            data=bio.getvalue(),
            file_name="resultados.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )


    else:
        st.warning("Nenhum resultado encontrado.")

    # Limpeza opcional dos arquivos temporários (ao final da execução do app)
    # for p in file_paths:
    #     try:
    #         os.remove(p)
    #     except Exception:
    #         pass
