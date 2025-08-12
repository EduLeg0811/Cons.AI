"""
API Response Structures
======================

1. Lexical Search (POST /api/lexical-search)
-------------------------------------------
Request:
    {
        "term": "search term",
        "books": ["LO", "HSRP"],  # Optional, defaults to ["LO"]
        "top_k": 50                # Optional, defaults to env.TOP_K or 50
    }

Response (200 OK):
    {
        "results": [
            {
                "text": "matching text content",
                "source": "filename.md",
                "paragraph_number": 123           # Optional
            },
            ...
        ],
        "search_type": "lexical",  # Type of search performed
        "term": "search term",
        "books": ["LO", "HSRP"],
        "total_results": 42,
        "source_counts": {
            "LO.md": 30,
            "HSRP.md": 12
        }
    }

2. Semantical Search (POST /api/semantical-search)
--------------------------------------------------
Request:
    {
        "term": "search term",
        "book": "LO",              # Optional, defaults to "LO"
        "top_k": 50,               # Optional, defaults to env.TOP_K or 50
        "temperature": 0.0         # Optional, defaults to env.TEMPERATURE or 0.0
    }

Response (200 OK):
    {
        "results": [
            {
                "text": "semantically related text",
                "source": "filename.md",
                "score": 0.92,                    # Semantic similarity score
                "paragraph_number": 45            # Optional
            },
            ...
        ],
        "search_type": "semantical",
        "term": "search term",
        "book": "LO",
        "temperature": 0.0,
        "total_results": 50,
        "source_counts": {
            "LO.md": 35,
            "HSRP.md": 15
        }
    }

Error Response (4xx/5xx):
    {
        "error": "Error message",
        "error_type": "ErrorClassName",
        "details": "Detailed error information"
    }
"""

# Import required libraries
from io import BytesIO
import logging
import os
import uuid

from flask import Flask, jsonify, make_response, request
from flask_cors import CORS
from flask_restful import Api, Resource

from modules.lexical_search.lexical_utils import lexical_search_in_files
from modules.mancia.mancia_utils import get_random_paragraph
from modules.semantical_search.search_operations import simple_search

from utils.config import (
    FAISS_INDEX_DIR,
    FILES_SEARCH_DIR,
    OPENAI_ID_ALLCONS,
    OPENAI_ID_ALLWV,
    TEMPERATURE,
    TOP_K,
    BASE_DIR,
)
from utils.docx_utils import create_document, sanitize_filename
from utils.response_llm import reset_conversation_memory
from utils.response_llm import generate_llm_answer
from utils.search_utils import (
    format_search_response,
    get_search_headers,
    handle_search_error,
)


logger = logging.getLogger("cons-ai")
logging.basicConfig(level=logging.INFO)

# Checagem de sanidade do FAISS_INDEX_DIR
try:
    contents = os.listdir(FAISS_INDEX_DIR)
    sizes = {f: os.path.getsize(os.path.join(FAISS_INDEX_DIR, f)) for f in contents}
    logger.info(f"[SANITY CHECK] FAISS_DIR={FAISS_INDEX_DIR} | files={list(sizes.keys())} | sizes={sizes}")
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
            books = data.get("books", ["LO"])
            top_k = int(data.get("top_k", TOP_K))
            
            if not term:
                raise ValueError("Search term is required")

            # Process search
            raw_results = lexical_search_in_files(term, books)
            
            # Transform results
            results = []
            for file_path, paragraphs in raw_results.items():
                source = os.path.basename(file_path)
                for paragraph in paragraphs[:top_k]:
                    # Extract paragraph number if available
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
                books=books
            )
            
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
            book = safe_str(payload.get("book", "LO"))
            top_k = int(payload.get("top_k", TOP_K))
            temperature = float(payload.get("temperature", TEMPERATURE))
            
            if not term:
                raise ValueError("Search term is required")

            # Run FAISS-backed search
            processed_results, grouped, sources_sorted = simple_search(
                query=term,
                book=book,
                index_dir=FAISS_INDEX_DIR,
                top_k=top_k
            )

            # Format results
            results = []
            for result in processed_results:
                metadata = getattr(result, 'metadata', {}) or {}
                result_data = {
                    'text': getattr(result, 'page_content', '').strip(),
                    'source': metadata.get('source', ''),
                }
                
                # Add paragraph number if available
                if 'paragraph_number' in metadata:
                    result_data['paragraph_number'] = metadata['paragraph_number']
                
                # Add score if available
                if hasattr(result, 'score'):
                    result_data['score'] = float(result.score)
                elif 'score' in metadata:
                    result_data['score'] = float(metadata['score'])
                
                results.append(result_data)

            # Format and return response
            response = format_search_response(
                results=results,
                search_type='semantical',
                term=term,
                source=book,
                temperature=temperature
            )
            
            return response, 200, get_search_headers('semantical')
            
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
            top_k = int(data.get("top_k", 50))
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

            logger.info(f"RAGbot: model={model} temp={temperature} top_k={top_k} vs={vector_store_names} use_session={use_session} chat_id={chat_id[:8]}...")

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
        book = safe_str(data.get("book", "LO"))

        try:
            pensata_result = get_random_paragraph(book + ".md", term)

            output_result = {
                "text": pensata_result.get("paragraph", ""),
                "paragraph_number": pensata_result.get("paragraph_number", ""),
                "total_paragraphs": pensata_result.get("total_paragraphs", ""),
                "source": pensata_result.get("source", f"{book}.md"),
                "type": "mancia"
            }


            return output_result, 200

        except Exception as e:
            logger.error(f"Error during Bibliomancia: {str(e)}")
            return {"error": str(e)}, 500





#____________________________________________________________________
# 6. Verbetopedia
#____________________________________________________________________
class VerbetopediaResource(Resource):
    def post(self):
        try:
            data = request.get_json(force=True)
            term = safe_str(data.get("term", ""))
            book = safe_str(data.get("book", "LO"))
            if not term:
                return {"error": "Search term is required"}, 400



            top_k = int(TOP_K)
            temperature = float(TEMPERATURE)
            
            logger.info(f"Search term: {term}")
            logger.info(f"Book: {book}")
            logger.info(f"Top k: {top_k}")
            logger.info(f"Temperature: {temperature}")
            
            processed_results, grouped, sources_sorted = verbetopedia_search(
                query=term,
                book=book,
                index_dir=FAISS_INDEX_DIR,
                top_k=top_k
            )

            formatted_results = [
                format_result(
                    result.page_content,
                    "verbetopedia",
                    source=result.metadata.get("source"),
                    paragraph_number=result.metadata.get("paragraph_number"),
                    score=result.metadata.get("score")
                )
                for result in processed_results
            ]

            output_result = {
                "text": processed_results,
                "source": source,
                "paragraph_number": paragraph_number,
                "type": "semantical"
            }
            
            return output_result, 200

        except Exception as e:
            logger.error(f"Error during semantic search: {str(e)}")
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
# 7. Download
#____________________________________________________________________
class DownloadResource(Resource):
    def post(self):
        try:
            # 1) Read JSON from request
            data = request.get_json(force=True)
            fmt = data.get("format")
            search_term = safe_str(data.get("term", ""))
            items = data.get("results", [])
            
            # 2) Basic validations
            if not search_term:
                return {"error": "Search term is required"}, 400
            if fmt not in ("markdown", "docx"):
                return {"error": "Invalid format type"}, 400
            if not isinstance(items, list):
                return {"error": "Results must be a list"}, 400

            # 3) Sanitize and truncate filename
            base_fn = sanitize_filename(search_term)[:25] or "search_results"

            # 4) Group by source
            grouped = {}
            for item in items:
                # Handle both old and new format
                if isinstance(item, dict):
                    # New format: {"text": "...", "source": "...", ...}
                    source = item.get("source", "Unknown")
                    text = item.get("text", "")
                    # If it's a RAGbot result, include citations
                    if "citations" in item and item["citations"]:
                        text += f"\n\nCitações: {item['citations']}"
                else:
                    # Old format: just the text
                    source = "Results"
                    text = str(item)
                
                clean_src = sanitize_filename(source)
                grouped.setdefault(clean_src, []).append(text)

            if fmt == "markdown":
                # 5a) Generate Markdown content
                content = f"# Resultados da busca: {search_term}\n\n"
                for src, texts in grouped.items():
                    content += f"## {src}\n\n"
                    for i, text in enumerate(texts, 1):
                        content += f"{i}. {text}\n\n"
                    content += "---\n\n"

                resp = make_response(content)
                resp.headers["Content-Type"] = "text/markdown; charset=utf-8"
                resp.headers["Content-Disposition"] = f"attachment; filename={base_fn}.md"
                return resp

            else:  # fmt == "docx"
                # 5b) Generate .docx using create_document
                doc = create_document(search_term, grouped)
                stream = BytesIO()
                doc.save(stream)
                stream.seek(0)

                resp = make_response(stream.getvalue())
                resp.headers["Content-Type"] = (
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                )
                resp.headers["Content-Disposition"] = f"attachment; filename={base_fn}.docx"
                return resp

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
