"""
Search operations for the RAG application.
"""
import logging
import os
import faiss

import gc
import psutil

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
    FAISS_ID_MANUAIS,
    FAISS_ID_PROJ,
    FAISS_ID_QUEST,
    MODEL_LLM,
    OPENAI_API_KEY,
    OPENAI_ID_ALLWV,
    TEMPERATURE,
    TOP_K,
    FAISS_ID_LO1,
    FAISS_ID_LO2,
    FAISS_ID_LO3,
    FAISS_ID_LO4,
    FECTH_K,
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

# (removido) _sort_key não é utilizado


# _________________________________________________________________________________________

# Simple Search SEMANTICAL
# _________________________________________________________________________________________
def simple_semantical_search(query, source, index_dir):
    

     # Normalize query to lowercase for case-insensitive search
    if query and isinstance(query, str):
        query = query.lower()

    # ------------------------------------------------------
    # Busca Semântica em FAISS
    # ------------------------------------------------------
    all_results = []
    try:

         # Caso source contenha "LO", substitui "LO" por "LO1", "LO2", "LO3", "LO4"
        if "LO" in source:
            source.remove("LO")
            source.extend(["LO1", "LO2", "LO3", "LO4"])

             

        # Pesquisa em todos os vector stores
        # ****************************************************************************************************************
        vector_store_ids = get_vector_store_id(source)

        logger.info(f"++++++++++ [simple_semantical_search] Vector store IDs: {vector_store_ids}")

        for vs_id in vector_store_ids:

            index_path = os.path.abspath(os.path.join(index_dir, vs_id))
            index_file = os.path.join(index_path, "index.faiss")
            
            if not os.path.exists(index_file):
               continue

            # Log de memória antes
            process = psutil.Process(os.getpid())
            #logger.info(f"[FAISS] Antes de carregar {vs_id}: {process.memory_info().rss / 1024 ** 2:.2f} MB")

            logger.info(f"\n\n++++++++++ [simple_semantical_search] index_path: {index_path}")
            logger.info(f"++++++++++ [simple_semantical_search] index_file: {index_file}")
            logger.info(f"++++++++++ [simple_semantical_search] vs_id: {vs_id}")

            # Carrega o índice FAISS
            #------------------------------------------------------
            vectorstore = FAISS.load_local(
                folder_path=index_path,
                embeddings=embeddings,
                allow_dangerous_deserialization=True
                )

            # Log de memória antes
            process = psutil.Process(os.getpid())
            #logger.info(f"[FAISS] Depois de carregar {vs_id}: {process.memory_info().rss / 1024 ** 2:.2f} MB")

            # k-NN clássico com fetch_k=150
            #------------------------------------------------------
            results_with_scores = vectorstore.similarity_search_with_score(
                query, k=TOP_K, fetch_k=FECTH_K, score_threshold=None
            )
          
            all_results.extend(results_with_scores)

            # Libera memória imediatamente
            del vectorstore
            del results_with_scores
            gc.collect()

            # Log de memória depois
            process = psutil.Process(os.getpid())
            #logger.info(f"[FAISS] Depois de liberar {vs_id}: {process.memory_info().rss / 1024 ** 2:.2f} MB")


        # ****************************************************************************************************************

     
        # ------------------------------------------------------
        # Processa resultados
        # ------------------------------------------------------
        processed_results = []
        for doc, score in all_results:
            if hasattr(doc, 'page_content') and hasattr(doc, 'metadata'):
                # 1) score salvo como número ou None (4 digitos decimais)
                doc.metadata['score'] = round(_to_float_or_none(score), 4)
                # normalizar as chaves do metadata já aqui (minúsculas)
                doc.metadata = {str(k).lower(): v for k, v in doc.metadata.items()}
                processed_results.append(doc)

            

        # ------------------------------------------------------
        # Caso especial de FAISS do LO (dividido em 2 partes)
        # ------------------------------------------------------
        RENOMEAR = {"LO1": "LO", "LO2": "LO", "LO3": "LO", "LO4": "LO"}
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
        logger.exception("Error during search")
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

        # mesclar metadata (se houver) normalizando chaves para minúsculas
        md = row.pop("metadata", None)
        if isinstance(md, dict):
            row.update({str(k).lower(): v for k, v in md.items()})


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
def get_vector_store_id(sources):
    """
    Get vector store IDs based on a list of sources.
    
    Args:
        sources: List of source strings (e.g., ["LO1", "LO2", "LO3", "LO4"])
        
    Returns:
        List of vector store IDs
    """
    if not isinstance(sources, list):
        logger.warning(f"Expected list for sources, got {type(sources)}")
        return []

    # Convert all sources to uppercase for case-insensitive comparison
    sources = [str(s).upper() for s in sources]
    vector_store_ids = []

    # Process each source
    for source in sources:
        if source == "LO1":
            vector_store_ids.append(FAISS_ID_LO1)
        elif source == "LO2":
            vector_store_ids.append(FAISS_ID_LO2)
        elif source == "LO3":
            vector_store_ids.append(FAISS_ID_LO3)
        elif source == "LO4":
            vector_store_ids.append(FAISS_ID_LO4)
        elif source == "HSRP":
            vector_store_ids.append(FAISS_ID_HSRP)
        elif source == "700EXP":
            vector_store_ids.append(FAISS_ID_700EXP)
        elif source == "PROJ":
            vector_store_ids.append(FAISS_ID_PROJ)
        elif source == "CCG":
            vector_store_ids.append(FAISS_ID_CCG)
        elif source == "DAC":
            vector_store_ids.append(FAISS_ID_DAC)
        elif source == "QUEST":
            vector_store_ids.append(FAISS_ID_QUEST)
        elif source == "MANUAIS":
            vector_store_ids.append(FAISS_ID_MANUAIS)
        elif source == "ECWV":
            vector_store_ids.append(FAISS_ID_ECWV)
        elif source == "ECALL_DEF" or source == "EC":
            vector_store_ids.append(FAISS_ID_ECALL_DEF)
        elif source == "ALLCONS":
            vector_store_ids.append(FAISS_ID_MANUAIS)
        elif source == "ALLWV":
            vector_store_ids.extend([
                FAISS_ID_LO, FAISS_ID_ECWV, FAISS_ID_HSRP,
                FAISS_ID_700EXP, FAISS_ID_PROJ, FAISS_ID_CCG, FAISS_ID_DAC
            ])

    # Filter out None values and remove duplicates
    vector_store_ids = list(dict.fromkeys([vid for vid in vector_store_ids if vid is not None]))

    if not vector_store_ids:
        logger.warning("No valid vector store IDs found for the provided sources")
    elif None in vector_store_ids:
        logger.warning("Some vector store IDs are not defined in .env")

    return vector_store_ids
