# Small helper used across endpoints
def safe_str(value):
    return str(value).strip() if value is not None else ""

"""
API Response Structures
======================
"""

# Import required libraries
from io import BytesIO
import logging
import os
from pathlib import Path
import re
import sys
from typing import Any, Dict, Tuple
import uuid
import pprint
import json
import datetime
import threading
import urllib.request
import urllib.error
import time

from flask import Flask, Response, jsonify, request, send_file, send_from_directory
from flask_cors import CORS
from flask_restful import Api, Resource
from functools import wraps

from modules.lexical_search.lexical_utils import lexical_search_in_files
from modules.mancia.mancia_utils import get_random_paragraph
from modules.bibliography.biblioRefW import build_biblio_wv, get_books_wv
from modules.bibliography.biblioRefVerbete import build_ref_verbete
from utils.config import (
    FILES_SEARCH_DIR,
    MODEL_LLM,
)
from utils.docx_export import build_docx
from utils.logs import (
    write_ndjson_line,
    normalize_event,
    add_enrichment,
    read_all_raw,
    parse_ndjson_lines,
    pretty_lines,
    clear_today,
    clear_all,
)
from utils.response_llm import generate_llm_answer, reset_conversation_memory

# Add backend directory to Python path
BACKEND_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(BACKEND_DIR))


logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:%(name)s:%(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True,  # override any existing handlers
)

logger = logging.getLogger("cons-ai")
logger.setLevel(logging.DEBUG)
logger.info("CONS-AI toolbox")

# Lista de IPs bloqueados (adicione os IPs que deseja bloquear)
BLOCKED_IPS = [
    "177.220.172.254",
    # Adicione outros IPs conforme necessário
]

# Rate-limit por IP para /llm_query (contagem diaria em memoria)
IP_DAILY_ACCESS = {}
IP_DAILY_ACCESS_LOCK = threading.Lock()
FORCE_MODEL_THRESHOLD = 5
BLOCK_THRESHOLD = 20
FORCED_MODEL = "gpt-4.1-mini"

def extract_client_ip(headers, remote_addr):
    """Extrai o IP real do cliente usando a mesma lógica do sistema de logs"""
    xff = headers.get("X-Forwarded-For") or headers.get("x-forwarded-for")
    if xff:
        # pick first IP
        return xff.split(",")[0].strip()
    return remote_addr or ""

def ip_block_filter(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        client_ip = extract_client_ip(request.headers, request.remote_addr)
        logger.info(f"IP do cliente detectado: {client_ip}")  # Log para debug
        
        if client_ip in BLOCKED_IPS:
            logger.warning(f"IP bloqueado tentando acessar ragbot: {client_ip}")
            return {"error": "Acesso negado"}, 403
        return f(*args, **kwargs)
    return decorated_function



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

# Serve favicon.ico from existing Icon.png to prevent 404
@app.route('/favicon.ico')
def favicon():
    try:
        return send_from_directory(frontend_path, 'Icon.png', mimetype='image/png')
    except Exception:
        return "", 404

# Friendly alias: /logs/view -> frontend/logs/view.html
@app.route('/logs/view')
def logs_view_page():
    try:
        return send_from_directory(frontend_path, os.path.join('logs', 'view.html'))
    except Exception:
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
    "Boot API | env=%s | base_url=%s | cors_origins=%s | files=%s",
    "render" if IS_RENDER else "local",
    backend_url,
    CORS_ALLOWED_ORIGINS,
    FILES_SEARCH_DIR,
)


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

           
            if not term:
                raise ValueError("Search term is required")


            # Process search
            results = lexical_search_in_files(term, source)

            # Sort by source for consistent ordering
            #results.sort(key=lambda x: x['source' or 'book' or 'file'])
            #logger.info("\n\n++++++++++ [app.py - Lexical Search] results:\n%s",
                        #pprint.pformat(results, indent=2, width=120))


            

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
# 3. LLM Query
# ______________________________________________________________________
class LlmQueryResource(Resource):
    @ip_block_filter
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
            llm_max_results = int(data.get("llm_max_results", 3))
            max_output_tokens = int(data.get("max_output_tokens", 500))
            instructions = data.get("instructions", "")
            use_session = bool(data.get("use_session", True))
            reasoning_effort = data.get("reasoning_effort", "none")
            verbosity = data.get("verbosity", "low")
            # Optional timeout/retry controls
            try:
                timeout_s = int(data.get("timeout_s", 60))
            except Exception:
                timeout_s = 60
            try:
                max_retries = int(data.get("max_retries", 2))
            except Exception:
                max_retries = 2

            client_ip = extract_client_ip(request.headers, request.remote_addr)
            today = datetime.date.today().isoformat()
            model_forced = False
            forced_model = None
            limit_status = "normal"

            with IP_DAILY_ACCESS_LOCK:
                ip_entry = IP_DAILY_ACCESS.get(client_ip)
                if not ip_entry or ip_entry.get("date") != today:
                    ip_entry = {"date": today, "count": 0}
                ip_entry["count"] += 1
                access_count_today = ip_entry["count"]
                IP_DAILY_ACCESS[client_ip] = ip_entry

            if access_count_today >= BLOCK_THRESHOLD:
                logger.warning(
                    "IP bloqueado por limite diario | ip=%s | date=%s | count=%s",
                    client_ip,
                    today,
                    access_count_today,
                )
                return {
                    "error": "Limite diario de acessos atingido para este IP. Tente novamente amanha.",
                    "access_count_today": access_count_today,
                    "limit_status": "blocked",
                }, 429

            if access_count_today >= FORCE_MODEL_THRESHOLD:
                model = FORCED_MODEL
                model_forced = True
                forced_model = FORCED_MODEL
                limit_status = "forced_model"

            logger.info(
                "Rate control /llm_query | ip=%s | date=%s | count=%s | status=%s | model=%s",
                client_ip,
                today,
                access_count_today,
                limit_status,
                model,
            )

            # >>> NOVO: chat_id por conversa/aba (vem do body, header, ou é criado)
            chat_id = safe_str(data.get("chat_id", "")) \
                       or safe_str(request.headers.get("X-Chat-Id", "")) \
                       or str(uuid.uuid4())

            parameters = {
                "query": query,
                "model": model,
                "vector_store_names": vector_store_names,
                "temperature": temperature,
                "llm_max_results": llm_max_results,
                "max_output_tokens": max_output_tokens,
                "instructions": instructions,
                "use_session": use_session,
                "chat_id": chat_id,
                "reasoning_effort": reasoning_effort,
                "verbosity": verbosity,
                "timeout_s": timeout_s,
                "max_retries": max_retries,
            }

            # Generate LLM answer
            # -------------------
            results = generate_llm_answer(**parameters)

            if "error" in results:
                return {"error": results["error"]}, 500

            clean_text = results.get("text", "")

            response = {
                "text": clean_text,
                "citations": results.get("file_citations", "No citations"),
                "total_tokens_used": results.get("total_tokens_used", "N/A"),
                "search_type": "ragbot",
                "type": "ragbot",
                "model": model,
                "temperature": temperature,
                "llm_max_results": llm_max_results,
                "max_output_tokens": max_output_tokens,
                "reasoning_effort": reasoning_effort,
                "verbosity": verbosity,
                "timeout_s": timeout_s,
                "max_retries": max_retries,
                # Retorne o chat_id para o frontend persistir
                "chat_id": chat_id,
                "access_count_today": access_count_today,
                "model_forced": model_forced,
                "forced_model": forced_model,
                "limit_status": limit_status,
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
# 5. BiblioWV (Obras Waldo Vieira)
# ______________________________________________________________________
class BiblioWVBooksResource(Resource):
    def get(self):
        try:
            books = get_books_wv()
            return {"books": books, "count": len(books)}, 200
        except Exception as e:
            logger.error(f"Error loading BiblioWV books: {str(e)}", exc_info=True)
            return {"error": str(e)}, 500


class BiblioWVBuildResource(Resource):
    def post(self):
        try:
            data = request.get_json(force=True) or {}
            book_title = safe_str(data.get("book_title", ""))
            book_sigla = safe_str(data.get("book_sigla", ""))
            style = safe_str(data.get("style", "simples")) or "simples"

            result = build_biblio_wv(book_title=book_title, style=style, book_sigla=book_sigla)
            return {
                "text": result["bibliografia"],
                "book_title": result["titulo"],
                "sigla": result["sigla"],
                "style": result["style"],
                "type": "biblio_wv",
            }, 200

        except ValueError as e:
            return {"error": str(e)}, 400
        except Exception as e:
            logger.error(f"Error building BiblioWV bibliography: {str(e)}", exc_info=True)
            return {"error": str(e)}, 500


# ______________________________________________________________________
# 5.1 Biblio Verbetes (Enciclopedia)
# ______________________________________________________________________
@app.route('/api/apps/insert-ref-verbete', methods=['POST'])
def insert_ref_verbete():
    try:
        data = request.get_json(force=True) or {}
        titles = safe_str(data.get("titles", ""))
        style = safe_str(data.get("style", "simples")) or "simples"
        if not titles:
            return jsonify({"error": "Parametro 'titles' e obrigatorio."}), 400

        result = build_ref_verbete(titles_raw=titles, style=style)
        return jsonify({"ok": True, "result": result}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except FileNotFoundError as e:
        logger.error(f"Error loading EC.xlsx for verbetes bibliography: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Error building verbetes bibliography: {str(e)}", exc_info=True)
        return jsonify({"error": f"Falha ao processar bibliografia de verbetes: {str(e)}"}), 500


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
        search_type: Type of search ('lexical')
        
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
api.add_resource(RandomPensataResource, '/random_pensata')
api.add_resource(BiblioWVBooksResource, '/biblio_wv/books')
api.add_resource(BiblioWVBuildResource, '/biblio_wv/build')
api.add_resource(DownloadResource, '/download')
api.add_resource(RAGbotResetResource, '/ragbot_reset')

# ---------------------- Logs API ----------------------
@app.route('/log', methods=['POST'])
def post_log():
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        payload = {}
    # normalize and enrich
    record = normalize_event(payload)
    record = add_enrichment(
        record,
        headers={k: v for k, v in request.headers.items()},
        remote_addr=request.remote_addr,
        user_agent=(request.user_agent.string if request.user_agent else None),
    )
    try:
        write_ndjson_line(record)
    except Exception as e:
        logger.error(f"Failed to write log: {e}")
        return jsonify({"status": "error", "message": "failed to write"}), 500
    return jsonify({"status": "ok"})


@app.route('/logs', methods=['GET'])
def get_logs():
    fmt = (request.args.get('format') or 'raw').lower()
    try:
        limit = int(request.args.get('limit', '0') or 0)
    except ValueError:
        limit = 0

    raw_text = read_all_raw(limit=limit)
    if fmt == 'raw':
        return Response(raw_text, mimetype='text/plain; charset=utf-8')

    records = parse_ndjson_lines(raw_text)
    if fmt == 'ndjson':
        # Normalize each record to standard fields, preserving enrichments
        normalized = []
        for r in records:
            base = normalize_event(r if isinstance(r, dict) else {})
            # keep enrichment if present
            for k in ['_server_ts', '_client_ip', '_user_agent', '_geo', 'chat_id', 'session_id']:
                if isinstance(r, dict) and k in r:
                    base[k] = r[k]
            normalized.append(base)
        text = "\n".join(json.dumps(x, ensure_ascii=False) for x in normalized)
        if text:
            text += "\n"
        return Response(text, mimetype='application/x-ndjson; charset=utf-8')

    if fmt == 'pretty':
        pretty = pretty_lines(records)
        return Response(pretty, mimetype='text/plain; charset=utf-8')

    # default to raw
    return Response(raw_text, mimetype='text/plain; charset=utf-8')


@app.route('/logs/clear', methods=['DELETE'])
def clear_logs_today():
    try:
        clear_today()
        return jsonify({"status": "ok"})
    except Exception as e:
        logger.error(f"Failed to clear logs: {e}")
        return jsonify({"status": "error"}), 500

@app.route('/logs/clear_all', methods=['DELETE'])
def clear_logs_all():
    try:
        deleted = clear_all()
        return jsonify({"status": "ok", "deleted": deleted})
    except Exception as e:
        logger.error(f"Failed to clear all logs: {e}")
        return jsonify({"status": "error"}), 500

@app.route('/health')
def health_check():
    return jsonify({'status': 'ok', 'message': 'Server is running'})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
