import os
from pathlib import Path

# ------------------------------------------------------------
# CONFIGURAÇÕES
# ------------------------------------------------------------
FILES_SEARCH_DIR = Path(r"D:\APPS\SIMPLE\Simple_v81\backend\files")

# Lista oficial dos "books" esperados
EXPECTED_BOOKS = [
    "LO", "DAC", "TNP", "DUPLA", "200TEAT",
    "PROEXIS", "700EXP", "TEMAS", "HSR", "HSP", "EC"
]

VALID_EXTENSIONS = {".xlsx", ".md", ".txt"}


# ------------------------------------------------------------
# FUNÇÃO PRINCIPAL
# ------------------------------------------------------------
def check_files():
    if not FILES_SEARCH_DIR.exists():
        print(f"❌ Diretório não encontrado: {FILES_SEARCH_DIR}")
        return

    # Arquivos presentes
    all_files = [p for p in FILES_SEARCH_DIR.iterdir() if p.is_file()]
    valid_files = [p for p in all_files if p.suffix.lower() in VALID_EXTENSIONS]

    # Mapa BOOKNAME → arquivo encontrado
    found_map = {p.stem.upper(): p for p in valid_files}

    print("📁 Diretório verificado:", FILES_SEARCH_DIR)
    print("────────────────────────────────────────────")

    # Livros encontrados
    found_books = []
    missing_books = []
    for book in EXPECTED_BOOKS:
        if book in found_map:
            print(f"✅ {book:<10} → {found_map[book].name}")
            found_books.append(book)
        else:
            print(f"⚠️ {book:<10} → arquivo ausente (.xlsx, .md ou .txt)")
            missing_books.append(book)

    # Arquivos extras (não esperados)
    extras = [p for p in valid_files if p.stem.upper() not in EXPECTED_BOOKS]
    if extras:
        print("\n📄 Arquivos extras (não correspondem a nenhum book esperado):")
        for e in extras:
            print(f"   - {e.name}")

    # Resumo
    print("\n📊 Resumo:")
    print(f"  - Total de livros esperados: {len(EXPECTED_BOOKS)}")
    print(f"  - Encontrados: {len(found_books)}")
    print(f"  - Ausentes:   {len(missing_books)}")

    if missing_books:
        print("\n👉 Sugestão: renomeie ou adicione os arquivos ausentes com nomes exatamente assim:")
        for b in missing_books:
            print(f"   - {b}.xlsx  (ou .md / .txt)")

    print("────────────────────────────────────────────")


if __name__ == "__main__":
    check_files()
