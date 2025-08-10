"""
Search operations for the RAG application.
"""
import logging
import os

from dotenv import load_dotenv
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings
from utils.config import (
    FAISS_ID_700EXP,
    FAISS_ID_CCG,
    FAISS_ID_DAC,
    FAISS_ID_DEF_ECWV,
    FAISS_ID_ECWV,
    FAISS_ID_HSRP,
    FAISS_ID_LO,
    FAISS_ID_MANUAIS,
    FAISS_ID_PROJ,
    FAISS_ID_QUEST,
    FAISS_INDEX_DIR,
    MODEL_LLM,
    OPENAI_API_KEY,
    OPENAI_ID_ALLCONS,
    OPENAI_ID_ALLWV,
    TEMPERATURE,
    TOP_K,
)


from utils.response_llm import generate_llm_answer


logger = logging.getLogger(__name__)

# Initialize embeddings
embeddings = OpenAIEmbeddings()

# _________________________________________________________________________________________

# Simple Search SEMANTICAL
# _________________________________________________________________________________________
def simple_search(query, book, index_dir, top_k):
    logger.info(f"Starting search with query: {query}")
    logger.info(f"Book: {book}")
    logger.info(f"Index directory: {index_dir}")
    logger.info(f"Top K: {top_k}")


# Define vector stores
# ======================================================

    vector_stores_ids = []
    
    if book == "LO":
        vector_stores_ids.append(FAISS_ID_LO)
    if book == "HSRP":
        vector_stores_ids.append(FAISS_ID_HSRP)
    if book == "700EXP":
        vector_stores_ids.append(FAISS_ID_700EXP)
    if book == "PROJ":
        vector_stores_ids.append(FAISS_ID_PROJ)
    if book == "CCG":
        vector_stores_ids.append(FAISS_ID_CCG)
    if book == "DAC":
        vector_stores_ids.append(FAISS_ID_DAC)
    if book == "QUEST":
        vector_stores_ids.append(FAISS_ID_QUEST)
    if book == "MANUAIS":
        vector_stores_ids.append(FAISS_ID_MANUAIS)
    if book == "ECWV":
        vector_stores_ids.append(FAISS_ID_ECWV)
    if book == "DEF_ECWV":
        vector_stores_ids.append(FAISS_ID_DEF_ECWV)
    if book == "ALLCONS":
        vector_stores_ids.append(FAISS_ID_MANUAIS)
    if book == "ALLWV":
        vector_stores_ids.append(FAISS_ID_LO)
        vector_stores_ids.append(FAISS_ID_ECWV)
        vector_stores_ids.append(FAISS_ID_HSRP)
        vector_stores_ids.append(FAISS_ID_700EXP)
        vector_stores_ids.append(FAISS_ID_PROJ)
        vector_stores_ids.append(FAISS_ID_CCG)
        vector_stores_ids.append(FAISS_ID_DAC)

    missing_ids = [vid for vid in vector_stores_ids if vid is None]
    valid_vector_store_ids = [vid for vid in vector_stores_ids if vid is not None]
    if missing_ids:
        logger.warning(f"Alguns Vector Store IDs não estão definidos no .env: {missing_ids}")
    if not valid_vector_store_ids:
        return [], {}, []

    # Verifica índices
    missing_indices = []
    for vector_store_id in valid_vector_store_ids:
        index_path = os.path.abspath(os.path.join(index_dir, vector_store_id))
        if not os.path.exists(index_path):
            missing_indices.append(vector_store_id)
        if missing_indices:
            logger.error(f"Índices não encontrados: {', '.join(missing_indices)}")
            return [], {}, []




# Busca Semantica em FAISS
# ======================================================    
    all_results = []
    try:
        
        # Otimiza query
        # ======================================================    
        logger.info(f"Original search term: {query}")
        optimized_query = optimize_search_term(query)
        if isinstance(optimized_query, dict) and "error" in optimized_query:
            return [], {}, []
        logger.info(f"Optimized search term: {optimized_query}")

        # Pesquisa em todos os vector stores
        for vector_store_id in valid_vector_store_ids:
            index_path = os.path.abspath(os.path.join(index_dir, vector_store_id))
            try:
                index_file = os.path.join(index_path, "index.faiss")
                if not os.path.exists(index_file):
                    logger.warning(f"Arquivo de índice não encontrado para {vector_store_id}")
                    continue
                logger.info(f"Loading vector store from: {index_path}")
                vectorstore = FAISS.load_local(
                    folder_path=index_path,
                    embeddings=embeddings,
                    allow_dangerous_deserialization=True
                )
                results_with_scores = vectorstore.similarity_search_with_score(optimized_query, k=top_k)
                all_results.extend(results_with_scores)
            except Exception as e:
                logger.error(f"Erro ao carregar/processar {vector_store_id}: {str(e)}")
                continue


        # Processa resultados
        # ======================================================    
        processed_results = []
        for doc, score in all_results:
            if hasattr(doc, 'page_content') and hasattr(doc, 'metadata'):
                doc.metadata['score'] = float(score)
                processed_results.append(doc)
        processed_results.sort(key=lambda x: x.metadata.get('score', float('inf')))
        processed_results = processed_results[:top_k]
        grouped, sources_sorted = group_results_by_source(processed_results)
        return processed_results, grouped, sources_sorted

    except Exception as e:
        logger.error(f"Erro durante a busca: {str(e)}")
        return {"error": str(e)}, {}, []
    finally:
        logger.info("Search completed.")










# ________________________________________________________________________________________
# Group results by source
# ________________________________________________________________________________________

def group_results_by_source(results):
    grouped = {}
    for doc in results:
        source = doc.metadata.get('source', 'Unknown')
        grouped.setdefault(source, []).append(doc)
    sorted_sources = sorted(
        grouped.keys(),
        key=lambda src: min(doc.metadata.get('score', float('inf')) for doc in grouped[src])
    )
    return grouped, sorted_sources



# ________________________________________________________________________________________
# Optimize search term
# ________________________________________________________________________________________
def optimize_search_term(term):
    try:
        search_params = {
            "query": "Termo a ser otimizado para pesquisa RAG: " + term,
            "model": MODEL_LLM,
            "use_session": False,
            "temperature": TEMPERATURE,
            "top_k": TOP_K,
            "vector_store_id": OPENAI_ID_ALLWV,
            "instructions": "Você é um assistente especialista em Conscienciologia. Sua função é formular uma query otimizada para uma pesquisa RAG."
        }
        response = generate_llm_answer(**search_params)
        if "error" in response:
            logger.error(f"Erro no LLM: {response['error']}")
            return {"error": response["error"]}
        response_text = str(response.get("text", term)).strip().strip('"\'')

        return response_text

    except Exception as e:
        logger.error(f"Erro ao otimizar termo: {str(e)}")
        return {"error": str(e)}
