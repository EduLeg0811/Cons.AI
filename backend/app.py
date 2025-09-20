"""
API Response Structures
======================
"""

# Import required libraries
import os
import sys
from pathlib import Path
from io import BytesIO
import logging
import re
from typing import Any, Dict, Tuple
import uuid

from flask import Flask, jsonify, request, send_file, Response, send_from_directory
from flask_cors import CORS
from flask_restful import Api, Resource

# Add backend directory to Python path
BACKEND_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(BACKEND_DIR))

# Now import local modules
from modules.lexical_search.lexical_utils import lexical_search_in_files
from modules.mancia.mancia_utils import get_random_paragraph
from modules.semantical_search.search_operations import simple_semantical_search
from utils.config import (
    FAISS_INDEX_DIR,
    FILES_SEARCH_DIR,
    INSTRUCTIONS_LLM_BACKEND,
    MODEL_LLM
)
from utils.docx_export import build_docx
from utils.response_llm import generate_llm_answer, reset_conversation_memory
    

logger = logging.getLogger("cons-ai")
logging.basicConfig(level=logging.INFO)

# Checagem de sanidade do FAISS_INDEX_DIR
try:
    contents = os.listdir(FAISS_INDEX_DIR)
    sizes = {f: os.path.getsize(os.path.join(FAISS_INDEX_DIR, f)) for f in contents}
except Exception as e:
    logger.error(f"[SANITY CHECK] Falha ao acessar FAISS_DIR={FAISS_INDEX_DIR} | err={e}")


# SERVER CONFIGURATION
# =========================================================
app = Flask(__name__, static_folder=None)  # Disable default static folder
api = Api(app)

# Configure static file serving
frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))
app.static_folder = frontend_path

# Serve frontend files
@app.route('/')
def serve_frontend():
    return send_from_directory(frontend_path, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(frontend_path, path)):
        return send_from_directory(frontend_path, path)
    return "File not found", 404

# Restrinja origens em produção; inclua localhost para dev
CORS_ALLOWED_ORIGINS = "*"

# Configure CORS
CORS(app, resources={
    r"/*": {
        "origins": CORS_ALLOWED_ORIGINS,
        "supports_credentials": True,
        "methods": ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Loga um banner de inicialização
IS_RENDER = bool(os.getenv("RENDER"))  # Render define RENDER=1
backend_url = os.getenv("RENDER_EXTERNAL_URL", "http://localhost:5000")
logger.info(
    "Boot API | env=%s | base_url=%s | cors_origins=%s | files=%s | faiss=%s",
    "render" if IS_RENDER else "local",
    backend_url,
    CORS_ALLOWED_ORIGINS,
    FILES_SEARCH_DIR, FAISS_INDEX_DIR
)


# (removido) rota duplicada de health; manteremos a versão JSON abaixo


# Helper to safely strip values
def safe_str(value):
    return str(value).strip() if value is not None else ""


# ______________________________________________________________________
# 1. Lexical Search
# ______________________________________________________________________
class LexicalSearchResource(Resource):
    def post(self):
        try:
            data = request.get_json(force=True)

            # Parse input parameters with defaults
            term = safe_str(data.get("term", ""))
            source = data.get("source", [])  # lista
            file_type = data.get("file_type")

            if not term:
                raise ValueError("Search term is required")

            # Process search
            results = lexical_search_in_files(term, source, file_type)

            # Sort by source for consistent ordering
            #results.sort(key=lambda x: x['source' or 'book' or 'file'])

            # Monta a resposta diretamente
            response = {
                "term": term,
                "search_type": "lexical",
                "results": results or [],
                "count": len(results) if results else 0
            }

            return response, 200, get_search_headers('lexical')

        except Exception as e:
            error_response, status_code, headers = handle_search_error(e, "lexical search")
            return error_response, status_code, headers


# ______________________________________________________________________
# 2. Semantical Search
# ______________________________________________________________________
class SemanticalSearchResource(Resource):
    def post(self):
        try:
            payload = request.get_json(force=True)
            term = safe_str(payload.get("term", ""))

            source = payload.get("source", [])

            if not term:
                raise ValueError("Search term is required")

            # Run FAISS-backed search
            processed_results = simple_semantical_search(
                query=term,
                source=source,
                index_dir=FAISS_INDEX_DIR,
            )



            return processed_results, 200, get_search_headers('semantical')

        except Exception as e:
            error_response, status_code, headers = handle_search_error(e, "semantical search")
            return error_response, status_code, headers


# ______________________________________________________________________
# 3. LLM Query
# ______________________________________________________________________
class LlmQueryResource(Resource):
    def post(self):
        try:
            data = request.get_json(force=True)
            # Handle both vector_store_id and vector_store_names for backward compatibility
            vector_store_names = data.get("vector_store_names")

            query = safe_str(data.get("query", ""))
            if not query:
                return {"error": "Query não fornecida."}, 400

            model = data.get("model", MODEL_LLM)
            temperature = float(data.get("temperature", 0.3))
            instructions = data.get("instructions", "")
            use_session = bool(data.get("use_session", True))

            # >>> NOVO: chat_id por conversa/aba (vem do body, header, ou é criado)
            chat_id = safe_str(data.get("chat_id", "")) \
                       or safe_str(request.headers.get("X-Chat-Id", "")) \
                       or str(uuid.uuid4())

            parameters = {
                "query": query,
                "model": model,
                "vector_store_names": vector_store_names,
                "temperature": temperature,
                "instructions": instructions,
                "use_session": use_session,
                "chat_id": chat_id,
            }

            results = generate_llm_answer(**parameters)

            if "error" in results:
                return {"error": results["error"]}, 500

            clean_text = results.get("text", "")

            response = {
                "text": clean_text,
                "citations": results.get("file_citations", "No citations"),
                "file_citations": results.get("file_citations", "No citations"),
                "total_tokens_used": results.get("total_tokens_used", "N/A"),
                "search_type": "ragbot",
                "type": "ragbot",
                "model": model,
                "temperature": temperature,
                # Retorne o chat_id para o frontend persistir
                "chat_id": chat_id,
            }

            return response, 200

        except Exception as e:
            logger.error(f"Error during RAGbot: {str(e)}")
            return {"error": str(e)}, 500


# ______________________________________________________________________
# 4. Mancia (Random Pensata)
# ______________________________________________________________________
class RandomPensataResource(Resource):
    def post(self):
        data = request.get_json(force=True)
        term = safe_str(data.get("term", ""))
        source = safe_str(data.get("source", "LO"))

        try:
            pensata_result = get_random_paragraph(source + ".md", term)

            output_result = {
                "text": pensata_result.get("paragraph", ""),
                "paragraph_number": pensata_result.get("paragraph_number", ""),
                "total_paragraphs": pensata_result.get("total_paragraphs", ""),
                "source": pensata_result.get("source", f"{source}.md"),
                "type": "mancia"
            }

            return output_result, 200

        except Exception as e:
            logger.error(f"Error during Bibliomancia: {str(e)}")
            return {"error": str(e)}, 500


# ______________________________________________________________________
# 6. Reset Conversation Memory (RAGbot)
# ______________________________________________________________________
class RAGbotResetResource(Resource):
    def delete(self):
        try:
            data = request.get_json(silent=True) or {}
            chat_id = safe_str(data.get("chat_id", "")) or safe_str(request.args.get("chat_id", ""))
            if not chat_id:
                return {"error": "chat_id é obrigatório"}, 400
            reset_conversation_memory(chat_id)
            return {"status": "ok", "chat_id": chat_id}, 200
        except Exception as e:
            logger.error(f"Error during RAGbot reset: {str(e)}")
            return {"error": str(e)}, 500




# ______________________________________________________________________
# 7. Download ponto de entrada enxuto (usa docx_export.py)
# ______________________________________________________________________
class DownloadResource(Resource):
    def post(self):

        try:
            data = request.get_json(force=True) or {}
            group_results_by_book = data.get("group_results_by_book", False)
           
            #Extrai variáveis
            search_term = data.get("search_term")
        
            docx_bytes = build_docx(data, group_results_by_book)
            filename = f"{search_term}"
            filename = filename[:30]
            filename = filename + '.' + ".docx"

            return send_file(
                BytesIO(docx_bytes),
                as_attachment=True,
                download_name=filename,
                mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )



        except Exception as e:
            logger.error(f"Error in DownloadResource: {str(e)}", exc_info=True)
            return {"error": "Internal server error"}, 500








# ______________________________________________________________________
# HELPERS  
# ______________________________________________________________________

def handle_search_error(error: Exception, context: str = "search") -> Tuple[Dict[str, Any], int, Dict[str, str]]:
    """
    Handle search errors consistently.
    
    Args:
        error: The exception that was raised
        context: Context for the error (e.g., 'lexical search', 'semantical search')
        
    Returns:
        Tuple of (error_response, status_code, headers)
    """
    error_type = error.__class__.__name__
    error_details = str(error)
    
    if isinstance(error, ValueError):
        status_code = 400
        error_message = f"Invalid request parameters: {error_details}"
    else:
        status_code = 500
        error_message = f"An error occurred during {context}"
    
    logger.error(f"{error_message}: {error}", exc_info=True)
    
    error_response = {
        'error': error_message,
        'error_type': error_type,
        'details': error_details if status_code == 400 else 'Internal server error'
    }
    
    return error_response, status_code, get_search_headers(error)



def get_search_headers(search_type: str) -> Dict[str, str]:
    """
    Get standard headers for search responses.
    
    Args:
        search_type: Type of search ('lexical' or 'semantical')
        
    Returns:
        Dict with standard response headers
    """
    return {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Api-Version': '1.0',
        'X-Search-Type': search_type
    }











# ====================== Routes ======================
api.add_resource(LlmQueryResource, '/llm_query')
api.add_resource(LexicalSearchResource, '/lexical_search')
api.add_resource(SemanticalSearchResource, '/semantical_search')
api.add_resource(RandomPensataResource, '/random_pensata')
api.add_resource(DownloadResource, '/download')
api.add_resource(RAGbotResetResource, '/ragbot_reset')

@app.route('/health')
def health_check():
    return jsonify({'status': 'ok', 'message': 'Server is running'})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)


