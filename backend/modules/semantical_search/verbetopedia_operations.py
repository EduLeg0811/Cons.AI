"""
Verbetopedia operations for the RAG application.
"""
import logging
import os
from typing import List

from dotenv import load_dotenv
from langchain.schema import Document
from langchain.vectorstores import FAISS
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings

from search_operations import optimize_search_term
from utils.response_llm import generate_llm_answer
from vector_store import similarity_search_with_score
from utils.config import load_config


logger = logging.getLogger(__name__)

# Initialize embeddings
embeddings = OpenAIEmbeddings()


# _________________________________________________________________________________________

# Main Search VERBETOPEDIA
# _________________________________________________________________________________________
def verbetopedia_search(query, especialidade, tematologia, autor, index_dir, top_k):

    
    logger.info(f"Starting search with query: {query}")
    logger.info(f"Especialidade: {especialidade}")
    logger.info(f"Tema: {tematologia}")
    logger.info(f"Autor: {autor}")
    logger.info(f"Index directory: {index_dir}")
    logger.info(f"Top K: {top_k}")


    # Define vector stores
    # ======================================================
    vector_store_id = FAISS_ID_ECWV
    
    
    # Busca Semantica em FAISS
    # ======================================================    
    all_results = []
    try:
        # Otimiza query
        # ======================================================    
        logger.info(f"Original search term: {query}")
        optimized_query = optimize_search_term(query)
        if isinstance(optimized_query, dict) and "error" in optimized_query:
            return []
        logger.info(f"Optimized search term: {optimized_query}")
        
        # Busca em FAISS
        # ======================================================    
        all_results = similarity_search_with_score(vector_store_id, optimized_query, top_k)
    except Exception as e:
        logger.error(f"Error during search operation: {str(e)}")
        return []

