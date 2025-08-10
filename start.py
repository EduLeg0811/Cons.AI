# start.py — Desenvolvimento local: backend (Flask) + frontend estático (HTTP)
# Raiz: .../Simple_v23/start.py

import os
import sys
import webbrowser
import logging
import threading
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

# =============================
# Config (ports/host em DEV)
# =============================
BACKEND_HOST  = os.getenv("DEV_HOST", "127.0.0.1")
BACKEND_PORT  = int(os.getenv("DEV_PORT", "5000"))
FRONTEND_HOST = os.getenv("DEV_FRONT_HOST", "127.0.0.1")
FRONTEND_PORT = int(os.getenv("DEV_FRONT_PORT", "5500"))

def _resolve_paths():
    root = Path(__file__).parent.resolve()
    backend_dir = root / "backend"
    frontend_dir = root / "frontend"
    return root, backend_dir, frontend_dir

def _prepare_sys_path(backend_dir: Path, project_root: Path):
    # Garante que backend e raiz estejam no sys.path para imports
    for p in (str(backend_dir), str(project_root)):
        if p not in sys.path:
            sys.path.insert(0, p)

def _start_static_server(frontend_dir: Path, host: str, port: int):
    """Sobe um HTTP server estático servindo /frontend (evita Origin: null)."""
    handler_cls = partial(SimpleHTTPRequestHandler, directory=str(frontend_dir))
    httpd = ThreadingHTTPServer((host, port), handler_cls)

    def _serve():
        print(f"[start] Frontend estático em http://{host}:{port}  (dir={frontend_dir})")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            httpd.server_close()

    t = threading.Thread(target=_serve, name="frontend-http", daemon=True)
    t.start()
    return t

def _open_browser(url: str):
    try:
        webbrowser.open(url)
        print(f"[start] Abrindo navegador: {url}")
    except Exception as e:
        print(f"[start] Aviso: não consegui abrir o navegador ({e}). URL: {url}")

def _run_backend_with_hypercorn(flask_app, host: str, port: int) -> bool:
    """Tenta rodar via Hypercorn (ASGI). Se faltar dep., retorna False e cai no fallback."""
    try:
        from hypercorn.config import Config
        from hypercorn.asyncio import serve
        from asgiref.wsgi import WsgiToAsgi
        import asyncio

        config = Config()
        config.bind = [f"{host}:{port}"]

        asgi_app = WsgiToAsgi(flask_app)
        print(f"[start] Backend (Hypercorn) em http://{host}:{port}")
        asyncio.run(serve(asgi_app, config))
        return True
    except ModuleNotFoundError:
        return False
    except Exception as e:
        print(f"[start] Hypercorn falhou ({type(e).__name__}: {e}). Fallback para Flask dev server.")
        return False

def _run_backend_fallback(flask_app, host: str, port: int):
    print(f"[start] Backend (Flask dev server) em http://{host}:{port}")
    flask_app.run(debug=True, host=host, port=port)

def main():
    project_root, backend_dir, frontend_dir = _resolve_paths()
    _prepare_sys_path(backend_dir, project_root)

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    print(f"[start] Raiz do projeto : {project_root}")
    print(f"[start] Backend dir     : {backend_dir}")
    print(f"[start] Frontend dir    : {frontend_dir}")

    # 1) Sobe servidor estático para o frontend
    _start_static_server(frontend_dir, FRONTEND_HOST, FRONTEND_PORT)
    threading.Timer(0.6, _open_browser,
                    args=(f"http://{FRONTEND_HOST}:{FRONTEND_PORT}/index.html",)).start()

    # 2) Importa o app Flask (depois do sys.path)
    try:
        from backend.app import app as flask_app
    except Exception as e:
        print(f"[start] ERRO importando backend.app: {e}")
        raise

    # 3) Sobe backend (Hypercorn se disponível; senão Flask dev server)
    started = _run_backend_with_hypercorn(flask_app, BACKEND_HOST, BACKEND_PORT)
    if not started:
        _run_backend_fallback(flask_app, BACKEND_HOST, BACKEND_PORT)

if __name__ == "__main__":
    main()
