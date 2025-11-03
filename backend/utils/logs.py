import os
import json
import time
import datetime
import logging
import hashlib
from pathlib import Path
from typing import Any, Dict
import urllib.request

from flask import Blueprint, Response, jsonify, request

# Base directory for backend (two levels up from this file: backend/utils/logs.py -> backend)
BACKEND_DIR = Path(__file__).parent.parent.resolve()

# Shared logger (configured in app.py)
logger = logging.getLogger("cons-ai")










# ______________________________________________________________________
# Lightweight logging endpoint (append-only JSON Lines)
# ______________________________________________________________________
# Grava eventos enviados pelo frontend (page_view, module_click, etc.)

# Detecta ambiente Render (filesystem somente leitura) e escolhe diretório gravável
def _select_log_dir() -> Path:
    try:
        # Preferência: diretório padrão dentro do backend se for gravável
        default_dir = BACKEND_DIR / "logs"
        try:
            default_dir.mkdir(parents=True, exist_ok=True)
            # Testa escrita
            test_file = default_dir / ".writetest"
            with test_file.open("w", encoding="utf-8") as tf:
                tf.write("ok")
            try:
                test_file.unlink(missing_ok=True)
            except Exception:
                pass
            return default_dir
        except Exception:
            pass

        # Se não foi possível usar o padrão, tenta variável de ambiente
        env_dir = os.getenv("LOG_DIR", "").strip()
        if env_dir:
            p = Path(env_dir)
            try:
                p.mkdir(parents=True, exist_ok=True)
                return p
            except Exception:
                pass

        # Fallback final: /tmp (gravável em plataformas como Render)
        tmp_dir = Path("/tmp/consai-logs")
        try:
            tmp_dir.mkdir(parents=True, exist_ok=True)
            return tmp_dir
        except Exception:
            pass
    except Exception:
        pass
    # Último recurso: diretório padrão (pode falhar em runtime, mas evita crash na importação)
    return BACKEND_DIR / "logs"

LOG_DIR = _select_log_dir()
LOG_FILE = LOG_DIR / "access.log"
LOG_SEPARATOR = "\n" + ("─" * 120) + "\n\n"  # Unicode full-width horizontal rule
RETENTION_DAYS = 14

# Flask Blueprint for logging endpoints
logs_bp = Blueprint("logs", __name__)

# ----------------------------------------------------
# Event schema normalization
# ----------------------------------------------------
def _anon_id(ip: str, ua: str) -> str:
    try:
        base = f"{ip}|{ua}".encode("utf-8", errors="ignore")
        return hashlib.sha256(base).hexdigest()[:16]
    except Exception:
        return ""

def normalize_event(rec: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure a consistent event schema for logging and reading.

    Required/normalized fields:
    - event: str
    - module, module_label, module_group: str (best-effort)
    - page, origin: str
    - session_id: str (from payload or fallback)
    - user_anon_id: str (hashed ip+ua)
    - value: str (payload as string limited elsewhere)
    - meta: dict (free-form)
    """
    try:
        out = dict(rec or {})
        # basic strings
        def s(x):
            try:
                return str(x).strip()
            except Exception:
                return ""

        out["event"] = s(out.get("event")) or "event"
        # module fields
        out["module"] = s(out.get("module"))
        out["module_label"] = s(out.get("module_label")) or out.get("module", "")
        out["module_group"] = s(out.get("module_group"))

        # page/origin
        out["page"] = s(out.get("page", out.get("_path")))
        out["origin"] = s(out.get("origin"))

        # identifiers
        session_id = s(out.get("session_id")) or s(out.get("sid")) or s(out.get("chat_id"))
        if not session_id:
            # best-effort session from header if present
            try:
                session_id = s(request.headers.get("X-Session-Id"))
            except Exception:
                session_id = ""
        out["session_id"] = session_id

        # anon user id from ip+ua (does not replace explicit user_id if present)
        user_id = s(out.get("user_id"))
        if not user_id:
            user_id = _anon_id(s(out.get("_client_ip")), s(out.get("_user_agent")))
        out["user_anon_id"] = user_id

        # value/meta
        out["value"] = out.get("value") if out.get("value") is not None else ""
        if not isinstance(out.get("meta"), dict):
            out["meta"] = {}

        return out
    except Exception:
        return rec

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
        LOG_DIR.mkdir(parents=True, exist_ok=True)
    except Exception:
        # Tenta reescolher o diretório uma vez e criar novamente
        try:
            new_dir = _select_log_dir()
            if new_dir != LOG_DIR:
                globals()["LOG_DIR"] = new_dir
                globals()["LOG_FILE"] = new_dir / "access.log"
            new_dir.mkdir(parents=True, exist_ok=True)
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

@logs_bp.route('/log', methods=['POST'])
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

    # Normalização de esquema de evento
    try:
        payload = normalize_event(payload)
    except Exception:
        pass

    # Garantir diretório e gravar
    try:
        append_log(payload)
    except Exception as e:
        logger.error(f"[log_event] Falha ao gravar log: {e}")
        return jsonify({"status": "error"}), 500

    return jsonify({"status": "ok"})


@logs_bp.route('/logs', methods=['GET'])
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

        # Default limit quando formato não é especificado (evita transferir tudo sem querer)
        if not fmt and limit == 0:
            limit = 200

        # Leitura tolerante a encoding: tenta UTF-8 estrito; em erro, usa 'replace'
        try:
            with LOG_FILE.open('r', encoding='utf-8') as f:
                raw = f.read()
        except Exception:
            try:
                with LOG_FILE.open('rb') as fb:
                    raw = fb.read().decode('utf-8', errors='replace')
            except Exception:
                raw = ''

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

        # NDJSON (uma linha JSON por evento, sem resumo nem separadores)
        if fmt == 'ndjson':
            lines = []
            for b in blocks:
                lines_in_block = b.splitlines()
                # detecta se a primeira linha é resumo
                if lines_in_block and not lines_in_block[0].lstrip().startswith('{'):
                    json_line = "\n".join(lines_in_block[1:])
                else:
                    json_line = "\n".join(lines_in_block)
                json_line = json_line.strip()
                if not json_line:
                    continue
                try:
                    rec = json.loads(json_line)
                except Exception:
                    continue
                # incluir normalização mínima no retorno
                try:
                    rec = normalize_event(rec)
                except Exception:
                    pass
                lines.append(json.dumps(rec, ensure_ascii=False))
            return Response("\n".join(lines) + ("\n" if lines else ""), mimetype='application/x-ndjson; charset=utf-8')

        if fmt == 'pretty':
            out_lines = []
            hr = "─" * 120
            uniq = set()
            # Build lines and accumulate unique IDs
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
                # Local time (-03) helper
                try:
                    ts_iso = (rec.get("_server_ts") or rec.get("ts") or "").replace("Z", "+00:00")
                    dt_utc = datetime.datetime.fromisoformat(ts_iso)
                    dt_local = dt_utc - datetime.timedelta(hours=3)
                    local_str = dt_local.strftime("%d/%m/%Y %H:%M") + " (-03)"
                except Exception:
                    local_str = ""
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
                # accumulate unique id (best-effort)
                try:
                    uid = (rec.get("session_id") or rec.get("_client_ip") or "").strip()
                    if uid:
                        uniq.add(uid)
                except Exception:
                    pass
                if local_str:
                    out_lines.append(f"  - local: {local_str}")
                for k, v in fields:
                    if v is None or v == "":
                        continue
                    s = str(v).replace("\n", " ")
                    if len(s) > 500:
                        s = s[:497] + "..."
                    out_lines.append(f"  - {k}: {s}")
                out_lines.append(hr)
                out_lines.append("")
            # Prepend header with totals
            header = f"Total: {len(blocks)} eventos | N={len(uniq)} usuários distintos"
            content = "\n".join([header, hr, ""] + out_lines)
            return Response(content, mimetype='text/plain; charset=utf-8')

        # default fallback: raw (optionally limited)
        if limit > 0:
            content = LOG_SEPARATOR.join(blocks[-limit:]) + (LOG_SEPARATOR if blocks else "")
            return Response(content, mimetype='text/plain; charset=utf-8')
        return Response(raw, mimetype='text/plain; charset=utf-8')
    except Exception as e:
        logger.error(f"[get_logs] Falha ao ler log: {e}")
        return Response("Erro ao ler logs.", status=500, mimetype='text/plain; charset=utf-8')


@logs_bp.route('/logs/clear', methods=['DELETE'])
def clear_logs():
    try:
        LOG_DIR.mkdir(exist_ok=True)
        with LOG_FILE.open('w', encoding='utf-8') as f:
            f.write('')
        return jsonify({"status": "ok", "message": "logs cleared"}), 200
    except Exception as e:
        logger.error(f"[clear_logs] Falha ao limpar log: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500



@logs_bp.route('/logs/view', methods=['GET'])
def view_logs_page():
    # Página simples para visualizar os logs em tabela
    html = r"""
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
    html, body { height:100%; background:var(--bg); color:var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, \"Apple Color Emoji\", \"Segoe UI Emoji\"; font-size:14px; }
    .wrap { max-width: 1100px; width: 100%; margin: 16px auto; padding: 0 12px; }
    .header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }
    .title { font-weight:800; font-size:22px; letter-spacing:.3px; }
    .controls { display:flex; gap:8px; flex-wrap:wrap; }
    .input, .select { background:var(--panel); border:1px solid var(--border); color:var(--text); padding:10px 12px; border-radius:8px; min-height:40px; }
    .btn { background:linear-gradient(135deg, var(--accent), var(--accent-2)); color:#fff; border:none; padding:10px 14px; border-radius:8px; cursor:pointer; font-weight:700; letter-spacing:.3px; }
    .card { background:var(--panel); border:1px solid var(--border); border-radius:12px; overflow:hidden; box-shadow: 0 1px 0 rgba(0,0,0,.3); }
    table { width:100%; border-collapse: collapse; table-layout: fixed; }
    thead th { text-align:left; font-size:12px; color:var(--muted); padding:4px 6px; border-bottom:1px solid var(--border); white-space:nowrap; }
    tbody td { padding:4px 6px; border-bottom:1px solid var(--border); font-size:11.5px; line-height:1.25; vertical-align:top; white-space: normal; word-break: break-word; }
    tbody tr:hover { background: rgba(56,189,248,0.07); }
    .nowrap { white-space:nowrap; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", monospace; font-size:12px; color:#cbd5e1; }
    /* Colunas compactas */
    .col-time { width: 96px; min-width: 84px; }
    .col-event { width: 108px; min-width: 96px; }
    .col-module { width: 140px; min-width: 120px; }
    .col-page { width: 180px; min-width: 140px; }
    .col-geo { width: 160px; min-width: 120px; }
    .col-ip { width: 120px; min-width: 100px; }
    .col-origin { width: 140px; min-width: 120px; }
    .col-ua { width: 240px; min-width: 180px; }
    .col-chat { width: 100px; min-width: 90px; }
    .col-session { width: 140px; min-width: 120px; }
    .col-value { width: auto; }
    .pill { display:inline-block; padding:1px 6px; border-radius:999px; font-size:11px; font-weight:700; letter-spacing:.2px; }
    .pill.ev { background:rgba(56,189,248,.18); color:#7dd3fc; border:1px solid rgba(56,189,248,.35); }
    .pill.grp { background:rgba(124,58,237,.18); color:#c4b5fd; border:1px solid rgba(124,58,237,.35); }
    /* Event-specific pills */
    .pill.evt-page_view { background:rgba(59,130,246,.18); color:#93c5fd; border:1px solid rgba(59,130,246,.35); }
    .pill.evt-module_click { background:rgba(234,179,8,.18); color:#fde68a; border:1px solid rgba(234,179,8,.35); }
    .pill.evt-input_text { background:rgba(16,185,129,.18); color:#86efac; border:1px solid rgba(16,185,129,.35); }
    .pill.evt-input_submit { background:rgba(236,72,153,.18); color:#f9a8d4; border:1px solid rgba(236,72,153,.35); }
    .pill.evt-llm_request { background:rgba(147,51,234,.18); color:#d8b4fe; border:1px solid rgba(147,51,234,.35); }
    .pill.evt-llm_response { background:rgba(2,132,199,.18); color:#7dd3fc; border:1px solid rgba(2,132,199,.35); }
    .muted { color:var(--muted); font-size:12px; }
    /* Agrupamento visual por usuário */
    .group-sep td { border-top: 2px solid var(--accent); }
    .group-start td { border-top: 2px solid var(--accent); }

    /* Ocultação por modo de visualização */
    .col-adv { display: table-cell; }
    .mode-simple .col-adv { display: none; }

    mark { background: rgba(56,189,248,.25); color: inherit; }
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
          <option value=\"llm_request\">llm_request</option>
          <option value=\"llm_response\">llm_response</option>
        </select>
        <select id=\"group-by\" class=\"select\">
          <option value=\"none\">Sem agrupamento</option>
          <option value=\"event\">Agrupar por event</option>
          <option value=\"module\">Agrupar por module</option>
        </select>
        <select id=\"sort-by\" class=\"select\">
          <option value=\"time_desc\">Mais recentes</option>
          <option value=\"time_asc\">Mais antigos</option>
          <option value=\"event\">Ordenar por event</option>
          <option value=\"module\">Ordenar por module</option>
        </select>
        <input id=\"search\" placeholder=\"Buscar (label, page, ip, UA, value)\" class=\"input\" />
        <button id=\"refresh\" class=\"btn\">Atualizar</button>
        <button id=\"auto\" class=\"btn\" title=\"Auto-refresh a cada 5s\">Auto</button>
        <button id=\"tz\" class=\"btn\" title=\"Alternar timezone\">UTC</button>
        <button id=\"reset\" class=\"btn\" title=\"Limpa filtros e larguras salvas\">Resetar</button>
        <button id=\"clear-logs\" class=\"btn\" title=\"Apaga o arquivo de logs no servidor\">Limpar Logs</button>
        <button id=\"viewmode\" class=\"btn\" title=\"Alternar Simple/Complete\">Simple</button>
        <span class=\"muted\" id=\"counter\" style=\"margin-left:8px\"></span>
      </div>
    </div>
    <div class=\"card\">
      <div id=\"tablewrap\">
        <table id=\"logtable\" class=\"mode-simple\">
          <thead>
            <tr>
              <th class=\"col-time nowrap\">Data/Hora</th>
              <th class=\"col-event col-adv\">Evento</th>
              <th class=\"col-module col-adv\">Módulo</th>
              <th class=\"col-page\">Página</th>
              <th class=\"col-value\">Value</th>
              <th class=\"col-geo\">Geo</th>
              <th class=\"col-ip col-adv\">IP</th>
              <th class=\"col-origin col-adv\">Origin</th>
              <th class=\"col-ua col-adv\">UA</th>
              <th class=\"col-chat col-adv\">chat_id</th>
              <th class=\"col-session col-adv\">session_id</th>
            </tr>
          </thead>
          <tbody id=\"logbody\"></tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    const $ = (sel) => document.querySelector(sel);
    const tbodyEl = $('#logbody');
    const tableEl = $('#logtable');
    const counterEl = $('#counter');
    const filterEvent = $('#filter-event');
    const groupBy = $('#group-by');
    const sortBy = $('#sort-by');
    const search = $('#search');
    const refreshBtn = $('#refresh');
    const autoBtn = $('#auto');
    const tzBtn = $('#tz');
    const resetBtn = $('#reset');
    const clearBtn = $('#clear-logs');
    const viewModeBtn = $('#viewmode');
    let useLocalTZ = true; // toggle timezone
    let autoOn = false;
    let autoTimer = 0;
    let simpleMode = true; // Simple por padrão

    async function fetchLogs() {
      console.time('fetchLogs');
      try {
        const res = await fetch('/logs?format=ndjson&limit=200', { cache: 'no-store' });
        const ok = res.ok;
        const text = await res.text();
        const lines = text.split('\n').filter(Boolean);
        console.log('[logs:view] fetch ok=%s lines=%d', ok, lines.length);
        const parsed = lines.map(line => { try { return JSON.parse(line); } catch (e) { console.warn('[logs:view] JSON parse error', e, line); return null; } }).filter(Boolean);
        console.timeEnd('fetchLogs');
        return parsed;
      } catch (e) {
        console.error('[logs:view] fetchLogs error', e);
        console.timeEnd('fetchLogs');
        throw e;
      }
    }

    function fmtDateTime(iso){
      try {
        const base = iso || '';
        const d0 = new Date(base);
        if (isNaN(d0.getTime())) return { d:'', t:'' };
        const d = useLocalTZ ? new Date(d0.getTime() - (3*60*60*1000)) : d0; // local(-03) vs UTC
        const dd = String(d.getUTCDate()).padStart(2,'0');
        const mm = String(d.getUTCMonth()+1).padStart(2,'0');
        const yyyy = d.getUTCFullYear();
        const HH = String(d.getUTCHours()).padStart(2,'0');
        const MM = String(d.getUTCMinutes()).padStart(2,'0');
        return { d: `${dd}/${mm}/${yyyy}`, t: `${HH}:${MM}` };
      } catch(e) { return { d:'', t:'' }; }
    }

    function highlight(hay, needle){
      if (!needle) return String(hay||'');
      try {
        // Escape regex metacharacters (including / and {}) safely
        const escaped = needle.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const re = new RegExp(escaped, 'ig');
        return String(hay||'').replace(re, m => `<mark>${m}</mark>`);
      } catch(e){ return String(hay||''); }
    }

    function render(data) {
      console.group('[logs:view] render');
      console.log('input events=%d', Array.isArray(data) ? data.length : -1);
      const ev = (filterEvent && filterEvent.value) || '';
      const q = (search && search.value || '').toLowerCase();
      let list = data.slice();
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
      // Ordenação principal
      const getTs = (x) => (x._server_ts||x.ts||'');
      if (sortBy) {
        const mode = sortBy.value;
        if (mode === 'time_asc') list.sort((a,b) => getTs(a).localeCompare(getTs(b)));
        else if (mode === 'event') list.sort((a,b) => (a.event||'').localeCompare(b.event||''));
        else if (mode === 'module') list.sort((a,b) => (a.module_label||a.module||'').localeCompare(b.module_label||b.module||''));
        else list.sort((a,b) => getTs(b).localeCompare(getTs(a))); // time_desc
        console.log('filters: ev=%s q="%s" sort=%s -> remaining=%d', ev, q, mode, list.length);
      }
      // Fallback: nenhum dado após filtros
      if (!list || list.length === 0) {
        if (tbodyEl) {
          tbodyEl.innerHTML = `<tr><td class=\"mono\" colspan=\"11\">Nenhum log recente encontrado. Tente alterar filtros, aumentar o limite ou aguarde novos eventos.</td></tr>`;
        }
        if (counterEl) counterEl.textContent = `N=0 usuários distintos | 0 eventos`;
        console.groupEnd();
        return;
      }
      // Agrupar por usuário (visual): ordena por user key para aproximar e marca inícios de grupo
      const userKey = (x) => (x.session_id || x._client_ip || '').toString();
      list.sort((a,b) => userKey(a).localeCompare(userKey(b)) || getTs(b).localeCompare(getTs(a)));

      // Renderização em tabela
      const esc = (s) => (String(s||'')).replace(/</g,'&lt;');
      const makeRow = (x, isGroupStart) => {
        const ts = x._server_ts || x.ts || '';
        const f = fmtDateTime(ts);
        const geo = [x.geo_city||'', x.geo_region||'', x.geo_country||''].filter(Boolean).join(', ');
        const moduleName = (x.module_label || x.module || '').toString();
        const page = (x.page||'').toString();
        const origin = (x.origin||'').toString();
        const evtClass = `pill evt-${(x.event||'').replace(/[^\w-]/g,'_')}`;
        const ipHtml = `<a href=\"#\" data-filter-ip=\"${esc(x._client_ip||'')}\">${esc(x._client_ip||'')}</a>`;
        return `
          <tr class="${isGroupStart ? 'group-start' : ''}">
            <td class="col-time mono nowrap" title="server: ${esc(ts)}">${f.d} ${f.t}</td>
            <td class="col-event col-adv"><span class=\"pill ${evtClass}\">${esc(x.event||'')}</span></td>
            <td class="col-module col-adv">${esc(moduleName) || '—'}</td>
            <td class="col-page">${esc(page) || '—'}</td>
            <td class="col-value">${highlight(esc(x.value), q)}</td>
            <td class="col-geo">${esc(geo) || '—'}</td>
            <td class="col-ip col-adv">${ipHtml}</td>
            <td class="col-origin col-adv">${esc(origin)}</td>
            <td class="col-ua col-adv">${esc(x._user_agent||'')}</td>
            <td class="col-chat col-adv">${esc(x.chat_id||'')}</td>
            <td class="col-session col-adv">${esc(x.session_id||'')}</td>
          </tr>`;
      };
      let html = '';
      let lastUser = '';
      for (const x of list) {
        const u = userKey(x);
        const isStart = u !== lastUser;
        html += makeRow(x, isStart);
        lastUser = u;
      }
      tbodyEl.innerHTML = html;
      try {
        const uniq = new Set();
        for (const x of list) {
            const id = (x.session_id || x._client_ip || '').toString();
            if (id) uniq.add(id);
        }
        counterEl.textContent = `N=${uniq.size} usuários distintos | ${list.length} eventos`;
        console.log('rendered rows=%d unique_users=%d', list.length, uniq.size);
      } catch (e) {
        counterEl.textContent = `${list.length} eventos`;
        console.warn('[logs:view] counter error', e);
      }

      // Clickable filters (IP)
      tbodyEl.querySelectorAll('[data-filter-ip]').forEach(a => {
        a.addEventListener('click', (ev) => {
          ev.preventDefault();
          const ip = a.getAttribute('data-filter-ip') || '';
          search.value = ip;
          load();
        });
      });
    }

    async function load() {
      console.group('[logs:view] load');
      try {
        const data = await fetchLogs();
        render(data);
        console.groupEnd();
      } catch(e) {
        console.error('[logs:view] load error', e);
        if (tbodyEl) {
          tbodyEl.innerHTML = `<tr><td class=\"mono\" colspan=\"11\">Erro ao carregar logs.</td></tr>`;
        }
        console.groupEnd();
      }
    }

    // Alternar modo Simple/Complete (mostra/oculta colunas avançadas)
    function applyViewMode() {
      if (!tableEl) return;
      if (simpleMode) {
        tableEl.classList.add('mode-simple');
        viewModeBtn.textContent = 'Simple';
      } else {
        tableEl.classList.remove('mode-simple');
        viewModeBtn.textContent = 'Complete';
      }
    }

    filterEvent && filterEvent.addEventListener('change', () => { console.log('[logs:view] filter:event', filterEvent.value); load(); });
    groupBy && groupBy.addEventListener('change', () => { console.log('[logs:view] groupBy', groupBy.value); load(); });
    sortBy && sortBy.addEventListener('change', () => { console.log('[logs:view] sortBy', sortBy.value); load(); });
    search && search.addEventListener('input', () => { window.clearTimeout(window.__t); window.__t = setTimeout(() => { console.log('[logs:view] search', search.value); load(); }, 250); });
    refreshBtn && refreshBtn.addEventListener('click', () => { console.log('[logs:view] manual refresh'); load(); });
    tzBtn && tzBtn.addEventListener('click', () => { useLocalTZ = !useLocalTZ; tzBtn.textContent = useLocalTZ ? 'UTC' : 'Local'; console.log('[logs:view] tz', useLocalTZ ? 'local(-03)' : 'UTC'); load(); });
    viewModeBtn && viewModeBtn.addEventListener('click', () => { simpleMode = !simpleMode; applyViewMode(); console.log('[logs:view] viewMode', simpleMode ? 'Simple' : 'Complete'); });
    autoBtn && autoBtn.addEventListener('click', () => {
      autoOn = !autoOn;
      autoBtn.textContent = autoOn ? 'Auto✓' : 'Auto';
      if (autoOn) {
        if (autoTimer) window.clearInterval(autoTimer);
        autoTimer = window.setInterval(load, 5000);
        console.log('[logs:view] auto ON (5s)');
      } else {
        if (autoTimer) window.clearInterval(autoTimer);
        autoTimer = 0;
        console.log('[logs:view] auto OFF');
      }
    });
    resetBtn && resetBtn.addEventListener('click', () => {
      // limpar filtros
      if (filterEvent) filterEvent.value = '';
      if (groupBy) groupBy.value = 'none';
      if (sortBy) sortBy.value = 'time_desc';
      if (search) search.value = '';
      // reset de modo
      simpleMode = true;
      applyViewMode();
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
    document.addEventListener('DOMContentLoaded', ()=>{ console.log('[logs:view] DOM ready'); applyViewMode(); load(); });
  </script>
</body>
</html>
    """
    return Response(html, mimetype='text/html; charset=utf-8')










