# -*- coding: utf-8 -*-
import os
import faiss

# Caminho base onde estão os índices
base_path = r"D:\APPS\SIMPLE\Simple_v65\backend\faiss_index"

print("📂 Diretório base:", base_path)

# Lista todos os subdiretórios
subdirs = [d for d in os.listdir(base_path) if os.path.isdir(os.path.join(base_path, d))]
print("🔍 Subdiretórios encontrados:", subdirs)

for subdir in subdirs:
    print("\n" + "="*80)
    print(f"📁 Verificando índice: {repr(subdir)}")

    # Caminho do índice atual
    index_path = os.path.join(base_path, subdir)
    faiss_file = os.path.join(index_path, "index.faiss")
    pkl_file   = os.path.join(index_path, "index.pkl")

    # 1. Checar existência
    print(" - Existe index.faiss?", os.path.exists(faiss_file))
    print(" - Existe index.pkl?", os.path.exists(pkl_file))

    # 2. Testar leitura com FAISS
    if os.path.exists(faiss_file):
        try:
            index = faiss.read_index(faiss_file)
            print(f" ✅ Index carregado: {subdir}, vetores = {index.ntotal}")
        except Exception as e:
            print(f" ❌ Erro ao abrir {subdir}/index.faiss:")
            print("    ", e)
    else:
        print(" ⚠️ Nenhum arquivo index.faiss encontrado")

    # 3. Checar se nome do diretório tem BOM escondido
    if subdir.startswith("\ufeff"):
        print(" ⚠️ Problema: nome do diretório contém BOM invisível!")
    else:
        print(" ✅ Nome do diretório limpo (sem BOM)")

    # 4. Extra: checar se arquivos dentro têm BOM
    for f in os.listdir(index_path):
        if "\ufeff" in f:
            print(" ⚠️ Arquivo com BOM no nome:", repr(f))
