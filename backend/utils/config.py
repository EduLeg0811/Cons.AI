import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()
    
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MODEL_LLM="gpt-4.1-nano"
TEMPERATURE=0.0
TOP_K=20

# Vector Store ID - FAISS Local
FAISS_ID_DAC="DAC"
FAISS_ID_LO="LO"
FAISS_ID_QUEST="QUEST"
FAISS_ID_MANUAIS="MANUAIS"
FAISS_ID_ECWV="ECWV"
FAISS_ID_HSRP="HSRP"
FAISS_ID_700EXP="700EXP"
FAISS_ID_PROJ="PROJ"
FAISS_ID_CCG="CCG"
FAISS_ID_DEF_ECWV="DEF_ECWV"

# Vector Store ID - OPENAI
OPENAI_ID_ALLWV="vs_6870595f39dc8191b364854cf46ffc74"
OPENAI_ID_ALLCONS="vs_6870595f39dc8191b364854cf46ffc74"

# ================================================================
# Diretórios base (relativos à pasta backend)
# ================================================================
# => este arquivo está em: .../Simple_v23/backend/config.py
# Portanto, BASE_DIR = .../Simple_v23/backend
# Base directory = .../backend  (2 níveis acima do arquivo utils/config.py)
BASE_DIR = Path(__file__).parent.parent.resolve()

# Pastas relativas a backend/
FILES_SEARCH_DIR = (BASE_DIR / "files").resolve()
FAISS_INDEX_DIR  = (BASE_DIR / "faiss_index").resolve()




#from utils.config import OPENAI_API_KEY, MODEL_LLM, TEMPERATURE, TOP_K, FAISS_INDEX_DIR, FAISS_ID_DAC, FAISS_ID_LO, FAISS_ID_QUEST, FAISS_ID_MANUAIS, FAISS_ID_ECWV, FAISS_ID_HSRP, FAISS_ID_700EXP, FAISS_ID_PROJ, FAISS_ID_CCG, FAISS_ID_DEF_ECWV, OPENAI_ID_ALLWV, OPENAI_ID_ALLCONS






