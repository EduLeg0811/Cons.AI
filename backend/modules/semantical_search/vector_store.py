"""
Vector store operations for the RAG application.
"""
import logging
import os
from pathlib import Path

from langchain.chains import RetrievalQA
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings

from utils.config import load_config

load_config()

logger = logging.getLogger(__name__)

# Cache global para evitar recarregar o índice em cada busca
_vectorstore_cache: dict[str, FAISS] = {}



# ________________________________________________________________________________________
# Load vector store from FAISS index.
# ________________________________________________________________________________________
def load_vectorstore(docs, index_dir):
    
    # Verificar se o arquivo de índice realmente existe
    index_file = os.path.join(index_dir, "index.faiss")
    
    # Initialize embeddings
    embeddings = OpenAIEmbeddings()
    
    # Se o arquivo existe, carregue-o
    if os.path.exists(index_file):
        try:
            # Load existing index
            vectorstore = FAISS.load_local(
                folder_path=index_dir,
                embeddings=embeddings,
                allow_dangerous_deserialization=True
            )
            logger.info(f"Vector store carregado com sucesso: {index_dir}")
            return vectorstore, "loaded"
        except Exception as e:
            logger.error(f"Erro ao carregar índice existente: {e}")
            raise Exception(f"Erro ao carregar índice existente: {e}")
    
    # Se chegamos aqui, o arquivo não existe
    # Esta parte só deve ser executada pelo create_vector_store.py
    if not docs:
        logger.error("Nenhum documento fornecido para criar o vector store")
        raise Exception("Nenhum documento fornecido para criar o vector store")
    
    # Não criar diretórios automaticamente, assumindo que o diretório já existe
    # ou foi criado pelo create_vector_store.py
    if not os.path.exists(os.path.dirname(index_dir)):
        logger.error(f"Diretório base para índices não existe: {os.path.dirname(index_dir)}")
        raise Exception(f"Diretório base para índices não existe: {os.path.dirname(index_dir)}")
     
    return vectorstore


# ________________________________________________________________________________________
# Query the LLM using RetrievalQA.
# ________________________________________________________________________________________
def vector_llm_query(query, vectorstore, llm, top_k=20, temperature=0.0):
    """
    Query the LLM using RetrievalQA.
    Args:
        query (str): The query string
        vectorstore: Vector store object
        llm: LLM object
        top_k (int): Number of documents to retrieve
        temperature (float): Temperature for LLM response generation
    Returns:
        dict: Answer from the LLM
        list: List of (document, score) tuples
    """
    # Get similar documents
    results = vectorstore.similarity_search_with_score(query, k=top_k)
    
    # Query LLM
    qa = RetrievalQA.from_chain_type(
        llm=llm,
        retriever=vectorstore.as_retriever(search_kwargs={"k": top_k}),
        return_source_documents=True
    )
    answer = qa.invoke({"query": query, "temperature": temperature})
    
    return answer, results


# ________________________________________________________________________________________
# Busca por similaridade em FAISS e retorna Document com metadado 'score'.
# ________________________________________________________________________________________
def similarity_search_with_score(vector_store_id: str, optimized_query: str, top_k: int) -> List[Document]:
    """Busca por similaridade em FAISS e retorna Document com metadado 'score'."""
   
   
   # 1. Verifica INDEX_DIR
    index_dir = INDEX_DIR
    if not index_dir:
        raise EnvironmentError("Variável de ambiente INDEX_DIR não definida.")

    # 2. Monta caminho do índice e verifica existência
    index_path = os.path.join(index_dir, vector_store_id)
    index_file = os.path.join(index_path, "index.faiss")
    if not os.path.exists(index_file):
        raise FileNotFoundError(f"Arquivo de índice não encontrado: {index_file}")

    # 3. Carrega ou recupera do cache
    vectorstore = _vectorstore_cache.get(vector_store_id)
    if vectorstore is None:
        logger.info(f"Carregando FAISS de: {index_path}")
        try:
            vectorstore = FAISS.load_local(
                folder_path=index_path,
                embeddings=embeddings,
                allow_dangerous_deserialization=True
            )
        except Exception as e:
            logger.error(f"Falha ao carregar FAISS: {e}")
            raise
        _vectorstore_cache[vector_store_id] = vectorstore

    # 4. Executa a busca
    try:
        docs_and_scores = vectorstore.similarity_search_with_score(
            optimized_query,
            k=top_k
        )
    except Exception as e:
        logger.error(f"Erro durante a busca de similaridade: {e}")
        raise

    # 5. Injeta score no metadata e ordena
    processed: List[Document] = []
    for doc, score in docs_and_scores:
        doc.metadata["score"] = float(score)
        processed.append(doc)

    processed.sort(key=lambda d: d.metadata["score"])
    return processed[:top_k]
