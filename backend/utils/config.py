import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()
    
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MODEL_LLM="gpt-4.1-mini"
TEMPERATURE=0.3
LLM_MAX_RESULTS=3 #INTERNAL
MAX_OUTPUT_TOKENS=500
MAX_OVERALL_SEARCH_RESULTS = 100


# Vector Store ID - OPENAI
OPENAI_ID_ALLWV="vs_6912908250e4819197e23fe725e04fae"
OPENAI_ID_EDUNOTES="vs_68f195fdeda08191815ec795ba1f57ba"
OPENAI_ID_ENGLISH="vs_69260faaec088191bbcf5e3f29b09b71"
OPENAI_ID_REVISTAS = "vs_69289c64b8308191806dcdd5856426d9"
OPENAI_ID_AUTORES = "vs_692894b455188191a900282a80e16a44"
OPENAI_ID_MINI = "vs_692890daa4248191afd3cf04a0c51ad5"
OPENAI_ID_BLOGTERT = "vs_6928989410dc8191bd9a838eb38876b7"

DEFAULT_VECTOR_STORE_OPENAI = [OPENAI_ID_ALLWV]

# ================================================================
# Diretórios base (relativos à pasta backend)
# ================================================================
# => este arquivo está em: .../Simple_v23/backend/config.py
# Portanto, BASE_DIR = .../Simple_v23/backend
# Base directory = .../backend  (2 níveis acima do arquivo utils/config.py)
BASE_DIR = Path(__file__).parent.parent.resolve()

FILES_SEARCH_DIR = Path(os.getenv("FILES_SEARCH_DIR", BASE_DIR / "files" / "Lexical")).resolve()

INSTRUCTIONS_LLM_BACKEND = "Você é um assistente da Conscienciologia no estilo ChatGPT."






