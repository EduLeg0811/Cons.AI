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

from modules.lexical_search.lexical_utils import lexical_search_in_files
from modules.mancia.mancia_utils import get_random_paragraph
from modules.semantic_search.search_operations import simple_semantic_search
from utils.config import (
    FAISS_INDEX_DIR,
    FILES_SEARCH_DIR,
    MODEL_LLM,
)
from utils.docx_export import build_docx
from utils.response_llm import generate_llm_answer, reset_conversation_memory

# Add backend directory to Python path
BACKEND_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(BACKEND_DIR))


logger = logging.getLogger("cons-ai")
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:%(name)s:%(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True,  # override any existing handlers
)

logger = logging.getLogger("cons-ai")
logger.setLevel(logging.INFO)
logger.info("CONS-AI toolbox")



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
    # Kick off a non-blocking warm-up ping to ConsAGENT (Render)
    try:
        warm_consagent_async()
    except Exception:
        pass
    return send_from_directory(frontend_path, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(frontend_path, path)):
        return send_from_directory(frontend_path, path)
    return "File not found", 404

# Optional endpoint to manually trigger warm-up (useful for smoke tests)
@app.route('/warm-consagent', methods=['GET', 'POST'])
def warm_consagent_route():
    try:
        warm_consagent_async()
        return jsonify({"status": "ok"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

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


# ______________________________________________________________________
# Render warm-up helper (ConsAGENT)
# ______________________________________________________________________
CONSAGENT_URL = os.getenv("CONSAGENT_URL", "https://consagent.onrender.com/")

def _warm_consagent_once():
    """Fire-and-forget GET to wake the Render app. Non-fatal on error."""
    try:
        req = urllib.request.Request(
            CONSAGENT_URL,
            method="GET",
            headers={
                "User-Agent": "ConsAI-Warm/1.0",
                "Cache-Control": "no-cache",
            },
        )
        # Short timeout; we don't care about the body
        with urllib.request.urlopen(req, timeout=4) as _:
            pass
    except Exception as e:
        # Keep it quiet unless debugging; warm-up should never break the app
        logger.debug(f"[warmup] ConsAGENT ping failed: {e}")

def warm_consagent_async():
    try:
        threading.Thread(target=_warm_consagent_once, daemon=True).start()
    except Exception as e:
        logger.debug(f"[warmup] Failed to start warm thread: {e}")


# Helper to safely strip values
def safe_str(value):
    return str(value).strip() if value is not None else ""


# ______________________________________________________________________
# Lightweight logging endpoint (append-only JSON Lines)
# ______________________________________________________________________
# Grava eventos enviados pelo frontend (page_view, module_click, etc.)
LOG_DIR = BACKEND_DIR / "logs"
LOG_FILE = LOG_DIR / "access.log"
LOG_SEPARATOR = "\n" + ("─" * 120) + "\n\n"  # Unicode full-width horizontal rule
RETENTION_DAYS = 14

def _today_str():
    try:
        return datetime.datetime.utcnow().strftime("%Y-%m-%d")
    except Exception:
        return ""

def _daily_log_path(date_str: str) -> Path:
    try:
        return LOG_DIR / f"access-{date_str}.log"
    except Exception:
        return LOG_FILE

def _ensure_log_dir():
    try:
        LOG_DIR.mkdir(exist_ok=True)
    except Exception:
        pass

def _cleanup_old_logs():
    """Delete rotated logs older than RETENTION_DAYS."""
    try:
        cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=RETENTION_DAYS)
        for name in os.listdir(LOG_DIR):
            if not name.startswith("access-") or not name.endswith(".log"):
                continue
            try:
                date_part = name[len("access-"):-len(".log")]
                dt = datetime.datetime.strptime(date_part, "%Y-%m-%d")
                if dt < cutoff:
                    try:
                        os.remove(LOG_DIR / name)
                    except Exception:
                        pass
            except Exception:
                continue
    except Exception:
        pass

def _day_header(date_str: str) -> str:
    line = "═" * 120
    return f"{line}\n⊙ {date_str} (UTC) ⊙\n{line}\n\n"

def _summarize(record: Dict[str, Any]) -> str:
    try:
        ts = record.get("_server_ts") or record.get("ts") or ""
        # compact time: YYYY-MM-DD HH:MM (UTC)
        try:
            dt = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
            ts_compact = dt.strftime("%Y-%m-%d %H:%M") + "Z"
        except Exception:
            ts_compact = ts or ""
        event = str(record.get("event", "")).strip()
        page = str(record.get("page", record.get("_path", ""))).strip()
        ip = str(record.get("_client_ip", "")).strip()
        ua = str(record.get("_user_agent", "")).strip().replace("\n", " ")
        if len(ua) > 80:
            ua = ua[:77] + "..."
        module = str(record.get("module_label") or record.get("module") or "").strip()
        origin = str(record.get("origin", "")).strip()
        geo_parts = [record.get("geo_city"), record.get("geo_region"), record.get("geo_country")]
        geo = ", ".join([str(x) for x in geo_parts if x])
        bits = [
            f"[{ts_compact}]",
            f"event={event or '—'}",
            f"page={page or '—'}",
            f"module={module or '—'}",
            f"ip={ip or '—'}",
            f"geo={geo or '—'}",
            f"ua={ua or '—'}",
        ]
        return " ".join(bits)
    except Exception:
        return ""

def append_log(record: Dict[str, Any]):
    """Append one record to current logs with summary, JSON and separator.
    Also write to a daily rotated file and cleanup retention.
    """
    try:
        _ensure_log_dir()
        # daily rotation: write day header if daily file is new
        today = _today_str()
        daily_file = _daily_log_path(today)
        need_day_header = not daily_file.exists()

        # optional sanitization/truncation for generic events
        try:
            if isinstance(record.get("value"), str) and len(record.get("value")) > 400:
                record["value"] = record["value"][:397] + "..."
        except Exception:
            pass

        summary = _summarize(record)
        payload = json.dumps(record, ensure_ascii=False)
        block = (summary + "\n" if summary else "") + payload + LOG_SEPARATOR

        # write to main file
        with LOG_FILE.open('a', encoding='utf-8') as f:
            # insert a day header in main file if it's the first write of the day in daily file
            if need_day_header:
                f.write(_day_header(today))
            f.write(block)

        # write to daily file
        with daily_file.open('a', encoding='utf-8') as df:
            if need_day_header:
                df.write(_day_header(today))
            df.write(block)

        # retention cleanup (best-effort)
        _cleanup_old_logs()
    except Exception as e:
        logger.error(f"[append_log] failed: {e}")

# Simple in-memory GeoIP cache with TTL
GEOIP_CACHE: Dict[str, Dict[str, Any]] = {}
GEOIP_TTL_SECONDS = 24 * 60 * 60  # 24h

def get_client_ip(req) -> str:
    """Resolve client IP honoring X-Forwarded-For when behind a proxy."""
    try:
        xff = req.headers.get("X-Forwarded-For", "")
        if xff:
            # Take the first IP in the list
            candidate = xff.split(",")[0].strip()
            if candidate:
                return candidate
    except Exception:
        pass
    return req.remote_addr or ""

def _is_private_ip(ip: str) -> bool:
    try:
        # Very light check to avoid external lookups for private/local ranges
        return (
            ip.startswith("10.") or
            ip.startswith("192.168.") or
            ip.startswith("172.") or  # includes 172.16.0.0/12
            ip.startswith("127.") or
            ip.startswith("::1") or
            ip.startswith("fc") or ip.startswith("fd")
        )
    except Exception:
        return False

def geoip_lookup(ip: str) -> Dict[str, Any]:
    """Lookup GeoIP data for an IP with caching and short timeout.
    Uses ip-api.com (no key) limited fields.
    """
    if not ip or _is_private_ip(ip):
        return {}
    try:
        now = time.time()
        cached = GEOIP_CACHE.get(ip)
        if cached and (now - cached.get("_ts", 0)) < GEOIP_TTL_SECONDS:
            return cached.get("data", {})

        url = f"http://ip-api.com/json/{ip}?fields=status,country,regionName,city,query"
        req = urllib.request.Request(url, headers={"User-Agent": "ConsAI-Geo/1.0"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            body = resp.read()
        try:
            data = json.loads(body.decode("utf-8", errors="ignore"))
        except Exception:
            data = {}
        result = {}
        if data.get("status") == "success":
            result = {
                "geo_country": data.get("country"),
                "geo_region": data.get("regionName"),
                "geo_city": data.get("city"),
            }
        GEOIP_CACHE[ip] = {"_ts": now, "data": result}
        return result
    except Exception:
        return {}

@app.route('/log', methods=['POST'])
def log_event():
    try:
        payload = request.get_json(silent=True) or {}
    except Exception:
        payload = {}

    # Enriquecimento server-side
    try:
        payload["_server_ts"] = datetime.datetime.utcnow().isoformat() + "Z"
        real_ip = get_client_ip(request)
        payload["_client_ip"] = real_ip
        payload["_user_agent"] = request.headers.get("User-Agent")
        payload["_path"] = request.path
        # Geo enrichment (short-timeout, cached)
        try:
            geo = geoip_lookup(real_ip)
            if geo:
                payload.update(geo)
        except Exception:
            pass
    except Exception:
        pass

    # Garantir diretório e gravar
    try:
        append_log(payload)
    except Exception as e:
        logger.error(f"[log_event] Falha ao gravar log: {e}")
        return jsonify({"status": "error"}), 500

    return jsonify({"status": "ok"})


@app.route('/logs', methods=['GET'])
def get_logs():
    # Exibe logs com opções de formato e limite
    try:
        _ensure_log_dir()
        if not LOG_FILE.exists():
            return Response("", mimetype='text/plain; charset=utf-8')

        fmt = (request.args.get('format') or '').strip().lower()
        try:
            limit = int(request.args.get('limit', '') or 0)
            if limit < 0:
                limit = 0
        except Exception:
            limit = 0

        with LOG_FILE.open('r', encoding='utf-8') as f:
            raw = f.read()

        if not fmt:
            # backward-compatible: return raw; apply limit if requested by splitting blocks
            if limit > 0:
                blocks = [b for b in raw.split(LOG_SEPARATOR) if b.strip()]
                content = LOG_SEPARATOR.join(blocks[-limit:]) + (LOG_SEPARATOR if blocks else "")
                return Response(content, mimetype='text/plain; charset=utf-8')
            return Response(raw, mimetype='text/plain; charset=utf-8')

        # parse blocks from separator
        blocks = [b for b in raw.split(LOG_SEPARATOR) if b.strip()]
        if limit > 0:
            blocks = blocks[-limit:]

        if fmt == 'pretty':
            out_lines = []
            hr = "─" * 120
            for b in blocks:
                # try to detect summary (first line not starting with '{')
                lines = b.splitlines()
                summary_line = ''
                json_line = ''
                if lines and not lines[0].lstrip().startswith('{'):
                    summary_line = lines[0]
                    json_line = "\n".join(lines[1:])
                else:
                    json_line = "\n".join(lines)
                try:
                    rec = json.loads(json_line)
                except Exception:
                    rec = {}
                if not summary_line:
                    summary_line = _summarize(rec)
                out_lines.append(summary_line)
                # show selected fields pretty
                fields = [
                    ("event", rec.get("event")),
                    ("page", rec.get("page", rec.get("_path"))),
                    ("module", rec.get("module_label") or rec.get("module")),
                    ("value", rec.get("value")),
                    ("ip", rec.get("_client_ip")),
                    ("geo", ", ".join([x for x in [rec.get("geo_city"), rec.get("geo_region"), rec.get("geo_country")] if x])),
                    ("ua", rec.get("_user_agent")),
                    ("chat_id", rec.get("chat_id")),
                ]
                for k, v in fields:
                    if v is None or v == "":
                        continue
                    s = str(v).replace("\n", " ")
                    if len(s) > 500:
                        s = s[:497] + "..."
                    out_lines.append(f"  - {k}: {s}")
                out_lines.append(hr)
                out_lines.append("")
            content = "\n".join(out_lines)
            return Response(content, mimetype='text/plain; charset=utf-8')

        # default fallback: raw (optionally limited)
        if limit > 0:
            content = LOG_SEPARATOR.join(blocks[-limit:]) + (LOG_SEPARATOR if blocks else "")
            return Response(content, mimetype='text/plain; charset=utf-8')
        return Response(raw, mimetype='text/plain; charset=utf-8')
    except Exception as e:
        logger.error(f"[get_logs] Falha ao ler log: {e}")
        return Response("Erro ao ler logs.", status=500, mimetype='text/plain; charset=utf-8')


@app.route('/logs/clear', methods=['DELETE'])
def clear_logs():
    try:
        LOG_DIR.mkdir(exist_ok=True)
        with LOG_FILE.open('w', encoding='utf-8') as f:
            f.write('')
        return jsonify({"status": "ok", "message": "logs cleared"}), 200
    except Exception as e:
        logger.error(f"[clear_logs] Falha ao limpar log: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/logs/view', methods=['GET'])
def view_logs_page():
    # Página simples para visualizar os logs em tabela
    html = """
<!DOCTYPE html>
<html lang=\"pt-BR\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>Cons-AI • Logs</title>
  <style>
    :root {
      --bg: #0f172a; /* slate-900 */
      --panel: #111827; /* gray-900 */
      --muted: #94a3b8; /* slate-400 */
      --text: #e5e7eb; /* gray-200 */
      --accent: #38bdf8; /* sky-400 */
      --accent-2: #7c3aed; /* violet-600 */
      --ok: #10b981; /* emerald-500 */
      --err: #ef4444; /* red-500 */
      --warn: #f59e0b; /* amber-500 */
      --border: #1f2937; /* gray-800 */
    }
    html, body { height:100%; background:var(--bg); color:var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, \"Apple Color Emoji\", \"Segoe UI Emoji\"; }
    .wrap { max-width: 100%; width: 100%; margin: 12px auto; padding: 0 8px; }
    .header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
    .title { font-weight:700; font-size:22px; letter-spacing:.3px; }
    .controls { display:flex; gap:8px; flex-wrap:wrap; }
    .input, .select { background:var(--panel); border:1px solid var(--border); color:var(--text); padding:10px 12px; border-radius:8px; min-height:40px; }
    .btn { background:linear-gradient(135deg, var(--accent), var(--accent-2)); color:#fff; border:none; padding:10px 14px; border-radius:8px; cursor:pointer; font-weight:600; letter-spacing:.3px; }
    .card { background:var(--panel); border:1px solid var(--border); border-radius:10px; overflow:hidden; box-shadow: 0 1px 0 rgba(0,0,0,.3); }
    table { width:100%; border-collapse: collapse; table-layout: auto; }
    thead th { text-align:left; font-size:12px; color:var(--muted); padding:4px 6px; border-bottom:1px solid var(--border); white-space:nowrap; }
    tbody td { padding:4px 6px; border-bottom:1px solid var(--border); font-size:11.5px; line-height:1.25; vertical-align:top; white-space: normal; word-break: break-word; }
    tbody tr:hover { background: rgba(56,189,248,0.07); }
    .pill { display:inline-block; padding:1px 6px; border-radius:999px; font-size:11px; font-weight:600; letter-spacing:.2px; }
    .pill.ev { background:rgba(56,189,248,.18); color:#7dd3fc; border:1px solid rgba(56,189,248,.35); }
    .pill.grp { background:rgba(124,58,237,.18); color:#c4b5fd; border:1px solid rgba(124,58,237,.35); }
    .muted { color:var(--muted); font-size:12px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", monospace; font-size:12px; color:#cbd5e1; }
    .nowrap { white-space:nowrap; }

    /* Resizable columns */
    th { position: relative; }
    .resizer { position:absolute; right:0; top:0; height:100%; width:6px; cursor:col-resize; user-select:none; }
    .resizer:hover { background: rgba(125,211,252,0.25); }
  </style>
</head>
<body>
  <div class=\"wrap\">
    <div class=\"header\">
      <div class=\"title\">Logs de Acesso • Cons-AI</div>
      <div class=\"controls\">
        <select id=\"filter-event\" class=\"select\">
          <option value=\"\">Todos os eventos</option>
          <option value=\"page_view\">page_view</option>
          <option value=\"module_click\">module_click</option>
          <option value=\"input_text\">input_text</option>
          <option value=\"input_submit\">input_submit</option>
        </select>
        <input id=\"search\" placeholder=\"Buscar (label, page, ip, UA)\" class=\"input\" />
        <button id=\"refresh\" class=\"btn\">Atualizar</button>
        <button id=\"reset\" class=\"btn\" title=\"Limpa filtros e larguras salvas\">Resetar</button>
        <button id=\"clear-logs\" class=\"btn\" title=\"Apaga o arquivo de logs no servidor\">Limpar Logs</button>
      </div>
    </div>
    <div class=\"card\">
      <div id=\"loglist\" class=\"log-list\"></div>
    </div>
    <div class=\"muted\" id=\"counter\" style=\"margin-top:8px\"></div>
  </div>

  <script>
    const $ = (sel) => document.querySelector(sel);
    const rowsEl = $('#loglist');
    const counterEl = $('#counter');
    const filterEvent = $('#filter-event');
    const search = $('#search');
    const refreshBtn = $('#refresh');
    const resetBtn = $('#reset');
    const clearBtn = $('#clear-logs');

    async function fetchLogs() {
      const res = await fetch('/logs', { cache: 'no-store' });
      const text = await res.text();
      return text.split('\\n').filter(Boolean).map(line => {
        try { return JSON.parse(line); } catch (e) { return null; }
      }).filter(Boolean);
    }

    function fmtDateTimeUTCm3(iso){
      try {
        const base = iso || '';
        const d0 = new Date(base);
        if (isNaN(d0.getTime())) return { d:'', t:'' };
        const dms = d0.getTime() - (3 * 60 * 60 * 1000);
        const d = new Date(dms);
        const dd = String(d.getUTCDate()).padStart(2,'0');
        const mm = String(d.getUTCMonth()+1).padStart(2,'0');
        const yyyy = d.getUTCFullYear();
        const HH = String(d.getUTCHours()).padStart(2,'0');
        const MM = String(d.getUTCMinutes()).padStart(2,'0');
        return { d: `${dd}/${mm}/${yyyy}`, t: `${HH}:${MM}` };
      } catch(e) { return { d:'', t:'' }; }
    }

    function render(data) {
      const ev = (filterEvent && filterEvent.value) || '';
      const q = (search && search.value || '').toLowerCase();
      let list = data;
      if (ev) list = list.filter(x => (x.event||'') === ev);
      if (q) {
        list = list.filter(x => {
          const hay = [
            x.value,
            x.module_label, x.module_group, x.page,
            x.origin, x._client_ip, x._user_agent,
            x.geo_city, x.geo_region, x.geo_country
          ].join(' ').toLowerCase();
          return hay.includes(q);
        });
      }
      // Ordenar por _server_ts ou ts desc
      list.sort((a,b) => (b._server_ts||b.ts||'').localeCompare(a._server_ts||a.ts||''));

      rowsEl.innerHTML = list.map(x => {
        const ts = x._server_ts || x.ts || '';
        const f = fmtDateTimeUTCm3(ts);
        const esc = (s) => (String(s||'')).replace(/</g,'&lt;');
        const geo = [x.geo_city||'', x.geo_region||'', x.geo_country||''].filter(Boolean).join(', ');
        const moduleName = (x.module_label || (x.field && x.field.dataset_module) || x.module || '')
          .toString().replace(/</g,'&lt;');
        const page = (x.page||'').toString().replace(/</g,'&lt;');
        const origin = (x.origin||'').toString().replace(/</g,'&lt;');
        return `
          <div class="log-item">
            <div class="log-line mono nowrap" title="server: ${x._server_ts||''}">${f.d} | ${f.t}</div>
            <div class="log-line">Evento: <span class="pill ev">${x.event||''}</span></div>
            <div class="log-line">${moduleName || '—'} | ${page || '—'}</div>
            <div class="log-line">value: ${esc(x.value)}</div>
            <div class="log-line">geo: ${geo || '—'}</div>
            <div class="log-line">client ip: ${x._client_ip||''}</div>
            <div class="log-line">origin: ${origin}</div>
          </div>
        `
      }).join('');
      counterEl.textContent = `${list.length} eventos`;
    }

    async function load() {
      try {
        const data = await fetchLogs();
        render(data);
      } catch(e) {
        rowsEl.innerHTML = `<div class=\"mono\">Erro ao carregar logs.</div>`;
      }
    }

    // No resizable columns needed in vertical list layout

    filterEvent && filterEvent.addEventListener('change', load);
    search && search.addEventListener('input', () => { window.clearTimeout(window.__t); window.__t = setTimeout(load, 250); });
    refreshBtn && refreshBtn.addEventListener('click', load);
    resetBtn && resetBtn.addEventListener('click', () => {
      // limpar larguras persistidas
      try { localStorage.removeItem('log_col_widths'); } catch {}
      // limpar filtros
      if (filterEvent) filterEvent.value = '';
      if (search) search.value = '';
      // limpar larguras aplicadas no DOM
      const colgroup = document.getElementById('colgroup');
      if (colgroup) Array.from(colgroup.children).forEach(c => c.style.width = '');
      // recarregar
      load();
    });
    clearBtn && clearBtn.addEventListener('click', async () => {
      if (!confirm('Tem certeza que deseja limpar todos os logs?')) return;
      try {
        const res = await fetch('/logs/clear', { method: 'DELETE' });
        if (!res.ok) throw new Error('Falha ao limpar logs');
      } catch(e) {
        console.error(e);
      }
      load();
    });
    document.addEventListener('DOMContentLoaded', ()=>{ load(); });
  </script>
</body>
</html>
    """
    return Response(html, mimetype='text/html; charset=utf-8')


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
# 2. semantic Search
# ______________________________________________________________________
class SemanticSearchResource(Resource):
    def post(self):
        try:
            payload = request.get_json(force=True)
            term = safe_str(payload.get("term", ""))

            source = payload.get("source", [])

            if not term:
                raise ValueError("Search term is required")

            # Run FAISS-backed search
            processed_results = simple_semantic_search(
                query=term,
                source=source,
                index_dir=FAISS_INDEX_DIR,
            )



            return processed_results, 200, get_search_headers('semantic')

        except Exception as e:
            error_response, status_code, headers = handle_search_error(e, "semantic search")
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

            # Log only the prompt text for LLM requests
            try:
                LOG_DIR.mkdir(exist_ok=True)
                llm_log = {
                    "event": "llm_request",
                    "value": (query or "")[:200],
                    "model": model,
                    "temperature": temperature,
                    "chat_id": chat_id,
                    "_server_ts": datetime.datetime.utcnow().isoformat() + "Z",
                    "_client_ip": request.remote_addr,
                    "_user_agent": request.headers.get("User-Agent"),
                    "_path": request.path,
                }
                append_log(llm_log)
            except Exception as e:
                logger.error(f"[llm_request log] failed: {e}")

            results = generate_llm_answer(**parameters)

            if "error" in results:
                return {"error": results["error"]}, 500

            clean_text = results.get("text", "")

            # Log only a short summary of the LLM response
            try:
                LOG_DIR.mkdir(exist_ok=True)
                llm_log_resp = {
                    "event": "llm_response",
                    "value": (clean_text or "")[:200],
                    "model": model,
                    "temperature": temperature,
                    "chat_id": chat_id,
                    "_server_ts": datetime.datetime.utcnow().isoformat() + "Z",
                    "_client_ip": request.remote_addr,
                    "_user_agent": request.headers.get("User-Agent"),
                    "_path": request.path,
                }
                append_log(llm_log_resp)
            except Exception as e:
                logger.error(f"[llm_response log] failed: {e}")

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
        context: Context for the error (e.g., 'lexical search', 'semantic search')
        
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
        search_type: Type of search ('lexical' or 'semantic')
        
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
api.add_resource(SemanticSearchResource, '/semantic_search')
api.add_resource(RandomPensataResource, '/random_pensata')
api.add_resource(DownloadResource, '/download')
api.add_resource(RAGbotResetResource, '/ragbot_reset')

@app.route('/health')
def health_check():
    return jsonify({'status': 'ok', 'message': 'Server is running'})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)


