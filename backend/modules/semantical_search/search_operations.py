"""
Search operations for the RAG application.
"""
import logging
import os
from typing import Any, Dict, List, Optional
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union

from dotenv import load_dotenv
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings

from utils.config import (
    FAISS_ID_700EXP,
    FAISS_ID_CCG,
    FAISS_ID_DAC,
    FAISS_ID_ECALL_DEF,
    FAISS_ID_ECWV,
    FAISS_ID_HSRP,
    FAISS_ID_LO,
    FAISS_ID_MANUAIS,
    FAISS_ID_PROJ,
    FAISS_ID_QUEST,
    MODEL_LLM,
    OPENAI_API_KEY,
    OPENAI_ID_ALLWV,
    TEMPERATURE,
    TOP_K,
)
from utils.response_llm import generate_llm_answer


logger = logging.getLogger(__name__)

# Escolha do modelo de embeddings (força text-embedding-3-large; pode ler do .env se preferir)
EMBED_MODEL = os.getenv("OPENAI_EMBEDDINGS_MODEL", "text-embedding-3-large")
embeddings = OpenAIEmbeddings(api_key=OPENAI_API_KEY, model=EMBED_MODEL)



def _to_float_or_none(val):
    try:
        return float(val)
    except (TypeError, ValueError):
        return None

def _sort_key(val):
    """Converte para float para ordenação; valores inválidos viram +inf (vão para o fim)."""
    try:
        v = float(val)
        # opcional: garantir finito
        return v if v == v and v not in (float("inf"), float("-inf")) else float("inf")
    except (TypeError, ValueError):
        return float("inf")


# _________________________________________________________________________________________

# Simple Search SEMANTICAL
# _________________________________________________________________________________________
def simple_semantical_search(query, source, index_dir):
    


    # ------------------------------------------------------
    # Busca Semântica em FAISS
    # ------------------------------------------------------
    all_results = []
    try:
       

        # Pesquisa em todos os vector stores
        # ****************************************************************************************************************
        vector_store_ids = get_vector_store_id(source)
        for vs_id in vector_store_ids:
            index_path = os.path.abspath(os.path.join(index_dir, vs_id))

            index_file = os.path.join(index_path, "index.faiss")

            if not os.path.exists(index_file):
               continue


            # Carrega o índice FAISS
            #------------------------------------------------------
            vectorstore = FAISS.load_local(
                folder_path=index_path,
                embeddings=embeddings,
                allow_dangerous_deserialization=True
                )

            # k-NN clássico com fetch_k=150
            #------------------------------------------------------
            results_with_scores = vectorstore.similarity_search_with_score(
                query, k=TOP_K, fetch_k=150, score_threshold=None
            )

          
            all_results.extend(results_with_scores)

        # ****************************************************************************************************************

     
        # ------------------------------------------------------
        # Processa resultados
        # ------------------------------------------------------
        processed_results = []
        for doc, score in all_results:
            if hasattr(doc, 'page_content') and hasattr(doc, 'metadata'):
                # 1) score salvo como número ou None (2 difgitos decimais)
                doc.metadata['score'] = round(_to_float_or_none(score), 2)  
                processed_results.append(doc)
                


        # ------------------------------------------------------
        # Caso especial de FAISS do LO (dividido em 2 partes)
        # ------------------------------------------------------
        RENOMEAR = {
            "LO1": "LO",
            "LO2": "LO",
            "LO": "LO",
        }
        for doc in processed_results:   # <<< agora só doc
            src = doc.metadata.get("source")
            if src in RENOMEAR:
                doc.metadata["source"] = RENOMEAR[src]             
 


        # ------------------------------------------------------
        # Ordena resultados
        # ------------------------------------------------------
        processed_results.sort(key=lambda x: float(x.metadata.get('score', 0)))
        
       
        # ------------------------------------------------------
        # Converte resultados para dicionários planos
        # ------------------------------------------------------
        # plain_results = plain_dicts(processed_results)
        # Converte resultados para dicionários planos (mantendo meta_score)       
        flat_results = plain_dicts(processed_results)
       
        # ------------------------------------------------------
        # Retorna resultados
        # ------------------------------------------------------    
        return flat_results


    except Exception as e:
        return {"error": str(e)}
    finally:
        logger.info("Search completed.")




#______________________________________________________________________________________
# plain_dicts
#______________________________________________________________________________________
def plain_dicts(
    results,
    *,
    include_page_content: bool = True,
):
    """
    Converte 'results' em lista de dicts planos, incluindo todos os campos.
    - Aceita: lista/tupla de dicts, objetos (ex.: Document), (document, score),
              ou contêiner dict com chaves usuais.
    - Mescla 'metadata' nas chaves de topo e NÃO mantém o blob 'metadata'.
    - Usa sempre o nome 'score' (se houver 'meta_score', converte para 'score').
    """

    if results is None:
        return []

    # Extrai lista de um contêiner dict, se for o caso
    if isinstance(results, dict):
        for k in ("plain_results", "processed_results", "all_results", "results", "documents", "docs"):
            if isinstance(results.get(k), (list, tuple)):
                results = results[k]
                break
        else:
            # caso documents/scores separados
            if "documents" in results and "scores" in results:
                docs = results.get("documents") or []
                scs  = results.get("scores") or []
                results = list(zip(docs, scs))  # [(doc, score), ...]
            else:
                return []

    # Materializa geradores
    if not isinstance(results, (list, tuple)):
        try:
            results = list(results)
        except TypeError:
            return []

    def to_float_maybe(x):
        try:
            return float(x)
        except Exception:
            return x

    def flatten_document(doc):
        """
        Retorna dict com todos os campos disponíveis.
        - dict: copia direto
        - objeto: usa __dict__ (se houver) e atributos comuns
        - mescla 'metadata' (se for dict) nas chaves de topo e NÃO mantém 'metadata'
        - respeita include_page_content
        """
        row = {}

        if isinstance(doc, dict):
            row.update(doc)
        else:
            # atributos do objeto
            if hasattr(doc, "__dict__") and isinstance(getattr(doc, "__dict__"), dict):
                row.update(dict(doc.__dict__))
            for attr in ("id", "page_content", "metadata"):
                if attr not in row and hasattr(doc, attr):
                    try:
                        row[attr] = getattr(doc, attr)
                    except Exception:
                        pass

        # remover page_content se solicitado
        if not include_page_content and "page_content" in row:
            row.pop("page_content", None)

        # mesclar metadata (se houver) e NÃO manter o blob
        md = row.pop("metadata", None)
        if isinstance(md, dict):
            row.update(md)

        return row

    out = []
    for item in results:
        score_from_tuple = None

        # item pode ser: dict; (doc, score); doc
        if isinstance(item, dict):
            row = dict(item)
        elif isinstance(item, (list, tuple)) and len(item) == 2:
            doc, score_val = item
            row = flatten_document(doc)
            score_from_tuple = score_val
        else:
            row = flatten_document(item)

        # normaliza 'score':
        # 1) se já houver 'score', mantém
        # 2) senão, se houver 'meta_score', cria 'score' a partir dele
        if "score" not in row and "meta_score" in row:
            row["score"] = to_float_maybe(row["meta_score"])

        # 3) se vier score da tupla e 'score' ainda não existir, usa-o
        if score_from_tuple is not None and "score" not in row:
            row["score"] = to_float_maybe(score_from_tuple)

        # 4) remover 'meta_score' (sempre usamos 'score')
        if "meta_score" in row:
            row.pop("meta_score", None)

        out.append(row)

    return out



# ------------------------------------------------------
# Define vector stores
# ------------------------------------------------------
def get_vector_store_id(source):
    vector_stores_ids = []

    try:
        if "LO" in source:
            vector_stores_ids.append(FAISS_ID_LO)
        if "HSRP" in source:
            vector_stores_ids.append(FAISS_ID_HSRP)
        if "700EXP" in source:
            vector_stores_ids.append(FAISS_ID_700EXP)
        if "PROJ" in source:
            vector_stores_ids.append(FAISS_ID_PROJ)
        if "CCG" in source:
            vector_stores_ids.append(FAISS_ID_CCG)
        if "DAC" in source:
            vector_stores_ids.append(FAISS_ID_DAC)
        if "QUEST" in source:
            vector_stores_ids.append(FAISS_ID_QUEST)
        if "MANUAIS" in source:
            vector_stores_ids.append(FAISS_ID_MANUAIS)
        if "ECWV" in source:
            vector_stores_ids.append(FAISS_ID_ECWV)
        if "ECALL_DEF" in source:
            vector_stores_ids.append(FAISS_ID_ECALL_DEF)
        if "ALLCONS" in source:
            vector_stores_ids.append(FAISS_ID_MANUAIS)
        if "ALLWV" in source:
            vector_stores_ids.append(FAISS_ID_LO)
            vector_stores_ids.append(FAISS_ID_ECWV)
            vector_stores_ids.append(FAISS_ID_HSRP)
            vector_stores_ids.append(FAISS_ID_700EXP)
            vector_stores_ids.append(FAISS_ID_PROJ)
            vector_stores_ids.append(FAISS_ID_CCG)
            vector_stores_ids.append(FAISS_ID_DAC)

        # Verifica se IDs estão definidos
        missing_ids = [vid for vid in vector_stores_ids if vid is None]
        vector_store_ids = [vid for vid in vector_stores_ids if vid is not None]

        if not vector_store_ids:
            return []

        if missing_ids:
            logger.warning(f"Alguns Vector Store IDs não estão definidos no .env: {missing_ids}")

    except Exception as e:
        logger.error(f"Erro ao obter Vector Store IDs: {str(e)}")
        return []

    return vector_store_ids


    
