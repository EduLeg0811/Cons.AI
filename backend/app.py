"""
API Response Structures
======================
"""

# Import required libraries
from io import BytesIO
import logging
import os
import uuid

from flask import Flask, jsonify, make_response, request, send_file
from flask_cors import CORS
from flask_restful import Api, Resource

from modules.lexical_search.lexical_utils import lexical_search_in_files
from modules.mancia.mancia_utils import get_random_paragraph
from modules.semantical_search.search_operations import simple_semantical_search
from utils.config import (
    FAISS_INDEX_DIR,
    FILES_SEARCH_DIR,
    OPENAI_ID_ALLCONS,
    OPENAI_ID_ALLWV,
    TEMPERATURE,
    TOP_K,
)
from utils.docx_export import build_grouped_markdown, markdown_to_docx_bytes
from utils.response_llm import generate_llm_answer, reset_conversation_memory
from utils.search_utils import get_search_headers, handle_search_error


logger = logging.getLogger("cons-ai")
logging.basicConfig(level=logging.INFO)

# Checagem de sanidade do FAISS_INDEX_DIR
try:
    contents = os.listdir(FAISS_INDEX_DIR)
    sizes = {f: os.path.getsize(os.path.join(FAISS_INDEX_DIR, f)) for f in contents}
except Exception as e:
    logger.error(f"[SANITY CHECK] Falha ao acessar FAISS_DIR={FAISS_INDEX_DIR} | err={e}")





#SERVER CONFIGURATION
#========================================================
app = Flask(__name__)
api = Api(app)

# Restrinja origens em produção; inclua localhost para dev
FRONTEND_ORIGINS = [
    "https://cons-ai.onrender.com",
    "http://localhost:5173",  # se usar Vite/Dev server
    "http://127.0.0.1:5500",  # se usar Live Server
    "http://localhost:5500",  # se usar Live Server
]
CORS(
    app,
    origins=FRONTEND_ORIGINS,
    supports_credentials=True,
    methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)



# Loga um banner de inicialização
IS_RENDER = bool(os.getenv("RENDER"))  # Render define RENDER=1
backend_url = os.getenv("RENDER_EXTERNAL_URL", "http://localhost:5000")
logger.info(
    "Boot API | env=%s | base_url=%s | cors_origins=%s | files=%s | faiss=%s",
    "render" if IS_RENDER else "local",
    backend_url,
    FRONTEND_ORIGINS,
    FILES_SEARCH_DIR, FAISS_INDEX_DIR
)


@app.route("/health")
def health():
    return "OK", 200



# Helper to safely strip values
def safe_str(value):
    return str(value).strip() if value is not None else ""





#____________________________________________________________________
# 1. Lexical Search
#____________________________________________________________________
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
            results.sort(key=lambda x: x['book'])

            #Limitar a TOP_K resultados
            results = results[:TOP_K]
            
             # Monta a resposta diretamente
            response = {
                "term": term,
                "search_type": "lexical",
                "results": results or [],
                "count": len(results) if results else 0
            }


            logger.info("\n\n")
            logger.info("[App.py][LexicalSearch] <<< response = >>>%s", response)
            logger.info("\n\n")

            return response, 200, get_search_headers('lexical')

                        
        except Exception as e:
            error_response, status_code, headers = handle_search_error(e, "lexical search")
            return error_response, status_code, headers






















#____________________________________________________________________
# 2. Semantical Search
#____________________________________________________________________
class SemanticalSearchResource(Resource):
    def post(self):
        try:
            payload = request.get_json(force=True)
            term = safe_str(payload.get("term", ""))
            top_k = int(payload.get("top_k", TOP_K))

            raw_source = payload.get("source", [])
            if isinstance(raw_source, list):
                source = ",".join(str(s).upper() for s in raw_source)
            else:
                source = safe_str(raw_source).upper()
            
            if not term:
                raise ValueError("Search term is required")

            #logger.info("\n\n")
            #logger.info(f'[App.py][SemanticalSearch] term={term}, source={source}, top_k={top_k}')
            
            # Run FAISS-backed search
            processed_results = simple_semantical_search(
                query=term,
                source=source,
                index_dir=FAISS_INDEX_DIR,
                top_k=top_k,
            )

            #logger.info("\n\n")
            #logger.info("[App.py][SemanticalSearch] <<< processed_results = >>>%s", processed_results)

            #Limitar a TOP_K resultados
            processed_results = processed_results[:top_k]
           
            #logger.info("[App.py][SemanticalSearch] response=%s", response)
            return processed_results, 200, get_search_headers('semantical')

        except Exception as e:
            error_response, status_code, headers = handle_search_error(e, "semantical search")
            return error_response, status_code, headers



#____________________________________________________________________
# 3. RAGbot
#____________________________________________________________________
class RAGbotResource(Resource):
    def post(self):
        try:
            data = request.get_json(force=True)

            query = safe_str(data.get("query", ""))
            if not query:
                return {"error": "Query não fornecida."}, 400

            model = data.get("model", "gpt-4.1-nano")
            temperature = float(data.get("temperature", 0.3))
            top_k = int(data.get("top_k", TOP_K))
            instructions = data.get("instructions", "Você é um assistente especialista em Conscienciologia.")
            vector_store_names = data.get("vector_store_names", "ALLWV")
            use_session = bool(data.get("use_session", True))

            # >>> NOVO: chat_id por conversa/aba (vem do body, header, ou é criado)
            chat_id = safe_str(data.get("chat_id", "")) \
                   or safe_str(request.headers.get("X-Chat-Id", "")) \
                   or str(uuid.uuid4())

            if vector_store_names == "ALLWV":
                vector_store_id = OPENAI_ID_ALLWV
            elif vector_store_names == "ALLCONS":
                vector_store_id = OPENAI_ID_ALLCONS
            else:
                vector_store_id = OPENAI_ID_ALLWV

            #logger.info(f"RAGbot: model={model} temp={temperature} top_k={top_k} vs={vector_store_names} use_session={use_session} chat_id={chat_id[:8]}...")

            # >>> SÓ ISTO: repassar chat_id (o restante do seu fluxo não muda)
            results = generate_llm_answer(
                query=query,
                model=model,
                vector_store_id=vector_store_id,
                top_k=top_k,
                temperature=temperature,
                instructions=instructions,
                use_session=use_session,
                chat_id=chat_id,   # <<< NOVO
            )

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
                "top_k": top_k,
                # Retorne o chat_id para o frontend persistir
                "chat_id": chat_id,
            }

            return response, 200

        except Exception as e:
            logger.error(f"Error during RAGbot: {str(e)}")
            return {"error": str(e)}, 500




#____________________________________________________________________
# 4. Mancia (Random Pensata)
#____________________________________________________________________
class ManciaResource_randomPensata(Resource):
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






#____________________________________________________________________
# 6. Reset Conversation Memory (RAGbot)
#____________________________________________________________________
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



#____________________________________________________________________
# 7. Download — ponto de entrada enxuto (usa docx_export.py)
#____________________________________________________________________
class DownloadResource(Resource):
    def post(self):
        try:
            data = request.get_json(force=True) or {}
            format  = (data.get("format") or "docx").lower().strip()
            term = safe_str(data.get("term", "") or "")
            type = safe_str(data.get("type", "") or "lexical") 
            resultsArray = data.get("results", [])

            payload = {
                "term": term,
                "results": resultsArray,
                "search_type": type,
                "format": format,
            }

            # 1) Markdown agrupado por fonte
            md = build_grouped_markdown(payload)

            # 2a) Se pediram markdown, devolve MD
            if format in ("md", "markdown"):
                resp = make_response(md.encode("utf-8"))
                resp.headers["Content-Type"] = "text/markdown; charset=utf-8"
                filename = f"{(payload.get('term') or term or 'resultados').strip().replace(' ', '_')}.md"
                resp.headers["Content-Disposition"] = f'attachment; filename=\"{filename}\"'
                return resp

            # 2b) Caso contrário, DOCX (justificação global = True)
            # restringe filename to max 10 caracteres
            docx_bytes = markdown_to_docx_bytes(md, justify_globally=True)
            filename = f"{(payload.get('term') or term or 'resultados').strip().replace(' ', '_')}"
            filename = filename[:10] + ".docx"

            return send_file(
                BytesIO(docx_bytes),
                as_attachment=True,
                download_name=filename,
                mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )

        except Exception as e:
            logger.error(f"Error in DownloadResource: {str(e)}", exc_info=True)
            return {"error": "Internal server error"}, 500























# ====================== Routes ======================
api.add_resource(RAGbotResource, '/ragbot')
api.add_resource(LexicalSearchResource, '/lexical_search')
api.add_resource(SemanticalSearchResource, '/semantical_search')
api.add_resource(ManciaResource_randomPensata, '/random_pensata')
api.add_resource(DownloadResource, '/download')
api.add_resource(RAGbotResetResource, '/ragbot_reset')

@app.route('/')
def home():
    return {"status": "success", "message": "Welcome to the Search API"}

@app.route('/health')
def health_check():
    return jsonify({'status': 'ok', 'message': 'Server is running'})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)















#____________________________________________________________________
# 1. Lexical Search
#____________________________________________________________________
class LexicalSearchResource_old(Resource):
    def post(self):
        try:
            data = request.get_json(force=True)
            
            # Parse input parameters with defaults
            term = safe_str(data.get("term", ""))
            source = data.get("source", ["LO"])  # lista
            top_k = int(data.get("top_k", TOP_K))
            
            if not term:
                raise ValueError("Search term is required")

            # Process search
            raw_results = lexical_search_in_files(term, source)
            
            # Transform results
            results = []
            for file_path, paragraphs in raw_results.items():
                source = os.path.basename(file_path)
                for paragraph in paragraphs[:top_k]:
                    paragraph_number = None
                    paragraph_text = paragraph
                    
                    if ': ' in paragraph:
                        try:
                            paragraph_number = int(paragraph.split(':', 1)[0])
                            paragraph_text = paragraph.split(':', 1)[1].strip()
                        except (ValueError, IndexError):
                            pass
                    
                    result_data = {
                        'text': paragraph_text,
                        'source': source
                    }
                    if paragraph_number is not None:
                        result_data['paragraph_number'] = paragraph_number
                    
                    results.append(result_data)
            
            # Sort by source for consistent ordering
            results.sort(key=lambda x: x['source'])
            
            # Format and return response
            response = format_search_response(
                results=results,
                search_type='lexical',
                term=term,
                source=source,
            )
            return response, 200, get_search_headers('lexical')
            
        except Exception as e:
            error_response, status_code, headers = handle_search_error(e, "lexical search")
            return error_response, status_code, headers