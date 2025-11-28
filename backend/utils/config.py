import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()
    
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MODEL_LLM="gpt-4.1-mini"
TEMPERATURE=0.3
TOP_K=10 #SIMILARITY semantic SEARCH
LLM_MAX_RESULTS=20 #INTERNAL
FECTH_K=40 #SIMILARITY semantic SEARCH
MAX_OVERALL_SEARCH_RESULTS = 100

# Vector Store ID - FAISS Local
FAISS_ID_DAC="DAC"
FAISS_ID_LO1="LO1"
FAISS_ID_LO2="LO2"
FAISS_ID_LO3="LO3"
FAISS_ID_LO4="LO4"
FAISS_ID_QUEST="QUEST"
FAISS_ID_MANUAIS="MANUAIS"
FAISS_ID_ECWV="ECWV"
FAISS_ID_HSRP="HSRP"
FAISS_ID_700EXP="700EXP"
FAISS_ID_PROJ="PROJ"
FAISS_ID_CCG="CCG"
FAISS_ID_ECALL_DEF="ECALL_DEF"

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

FILES_SEARCH_DIR = Path(os.getenv("FILES_SEARCH_DIR", BASE_DIR / "files")).resolve()
FAISS_INDEX_DIR  = Path(os.getenv("FAISS_INDEX_DIR",  BASE_DIR / "faiss_index")).resolve()


INSTRUCTIONS_LLM_BACKEND = "Você é um assistente da Conscienciologia no estilo ChatGPT."

#from utils.config import OPENAI_API_KEY, MODEL_LLM, TEMPERATURE, TOP_K, FAISS_INDEX_DIR, FAISS_ID_DAC, FAISS_ID_LO, FAISS_ID_QUEST, FAISS_ID_MANUAIS, FAISS_ID_ECWV, FAISS_ID_HSRP, FAISS_ID_700EXP, FAISS_ID_PROJ, FAISS_ID_CCG, FAISS_ID_DEF_ECWV, OPENAI_ID_ALLWV






