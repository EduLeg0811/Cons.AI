import os

# Mapeamento de substituições
substituicoes = {
    "Ã¢": "â",
    "Ã©": "é",
    "â—": "●",
    "Ã¡": "á",
    "õ": "õ",
    "ç": "ç",
    "Ã£": "ã",
}

# Extensões que serão processadas
extensoes = {".html", ".js", ".css"}

def corrigir_acentos_em_arquivos(base_path="."):
    for root, _, files in os.walk(base_path):
        for file in files:
            _, ext = os.path.splitext(file)
            if ext.lower() in extensoes:
                caminho_arquivo = os.path.join(root, file)
                
                try:
                    with open(caminho_arquivo, "r", encoding="utf-8", errors="ignore") as f:
                        conteudo = f.read()
                    
                    conteudo_corrigido = conteudo
                    for errado, certo in substituicoes.items():
                        conteudo_corrigido = conteudo_corrigido.replace(errado, certo)
                    
                    if conteudo != conteudo_corrigido:
                        with open(caminho_arquivo, "w", encoding="utf-8") as f:
                            f.write(conteudo_corrigido)
                        print(f"Corrigido: {caminho_arquivo}")
                
                except Exception as e:
                    print(f"Erro ao processar {caminho_arquivo}: {e}")

if __name__ == "__main__":
    corrigir_acentos_em_arquivos(".")  # Diretório atual
