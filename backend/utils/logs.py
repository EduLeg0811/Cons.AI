import os
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Any, Iterable, List, Optional, Tuple
import threading
import urllib.request
import urllib.error

# Configuration
_DEFAULT_RETENTION_DAYS = int(os.getenv("LOG_RETENTION_DAYS", "3") or 3)
_ENV_LOG_DIR = os.getenv("LOG_DIR", "").strip()
_FALLBACK_DIRS = [
    # 1) project backend/logs
    str(Path(__file__).resolve().parent.parent / "logs"),
    # 2) env LOG_DIR (handled above but keep as fallback if set later)
    _ENV_LOG_DIR if _ENV_LOG_DIR else "",
    # 3) tmp
    "/tmp/consai-logs",
]
_LOG_SUBDIR = "access"
_FILENAME_FMT = "access-%Y-%m-%d.log"
_MAX_VALUE_LEN = 2000

_geoip_cache_lock = threading.Lock()
_geoip_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_geoip_ttl_seconds = 3600


def _ensure_dir(path: str) -> None:
    if not path:
        return
    Path(path).mkdir(parents=True, exist_ok=True)


def resolve_log_dir() -> str:
    """
    Resolve writable log directory with priority:
      1) backend/logs
      2) env LOG_DIR
      3) /tmp/consai-logs
    Returns the full path to the access subdirectory.
    """
    candidates = []
    # prefer backend/logs first
    candidates.append(_FALLBACK_DIRS[0])
    # then env if set
    if _FALLBACK_DIRS[1]:
        candidates.append(_FALLBACK_DIRS[1])
    # then tmp
    candidates.append(_FALLBACK_DIRS[2])

    for base in candidates:
        try:
            if not base:
                continue
            access_dir = os.path.join(base, _LOG_SUBDIR)
            _ensure_dir(access_dir)
            # test writability
            test_path = os.path.join(access_dir, ".wtest")
            with open(test_path, "w", encoding="utf-8") as f:
                f.write("ok")
            os.remove(test_path)
            return access_dir
        except Exception:
            continue
    # last resort to tmp
    access_dir = os.path.join(_FALLBACK_DIRS[2], _LOG_SUBDIR)
    _ensure_dir(access_dir)
    return access_dir


def get_daily_log_path(dt: Optional[datetime] = None) -> str:
    dt = dt or datetime.now(timezone.utc)
    folder = resolve_log_dir()
    filename = dt.strftime(_FILENAME_FMT)
    return os.path.join(folder, filename)


def _truncate_value(value: Any) -> Any:
    try:
        s = str(value)
    except Exception:
        return value
    if len(s) > _MAX_VALUE_LEN:
        return s[:_MAX_VALUE_LEN] + "…"
    return value


def clean_old_logs(retention_days: Optional[int] = None) -> int:
    """Delete files older than retention_days in the access logs directory.
    Returns number of files deleted."""
    retention_days = int(retention_days if retention_days is not None else _DEFAULT_RETENTION_DAYS)
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    folder = resolve_log_dir()
    deleted = 0
    try:
        for name in os.listdir(folder):
            if not name.startswith("access-") or not name.endswith(".log"):
                continue
            fpath = os.path.join(folder, name)
            try:
                stat = os.stat(fpath)
            except FileNotFoundError:
                continue
            mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
            if mtime < cutoff:
                try:
                    os.remove(fpath)
                    deleted += 1
                except Exception:
                    pass
    except Exception:
        pass
    return deleted


def write_ndjson_line(data: Dict[str, Any]) -> None:
    """Append a dict as a single NDJSON line to today's file."""
    path = get_daily_log_path()
    # Ensure parent exists
    _ensure_dir(os.path.dirname(path))
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False) + "\n")
    finally:
        # opportunistic retention cleanup (non-blocking safety)
        try:
            clean_old_logs()
        except Exception:
            pass


def _tail_lines(path: str, limit: int) -> List[str]:
    """Efficient tail: read last N lines from file without loading entire file."""
    if limit <= 0:
        return []
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            block = -1
            data = b""
            nl = 0
            step = 1024
            while size + block * step > 0 and nl <= limit:
                f.seek(block * step, os.SEEK_END)
                data = f.read(step) + data
                nl = data.count(b"\n")
                block -= 1
            lines = data.splitlines()[-limit:]
            return [line.decode("utf-8", errors="replace") for line in lines]
    except FileNotFoundError:
        return []


def read_all_raw(limit: Optional[int] = None) -> str:
    """Return raw NDJSON text from all log files.
    
    Args:
        limit: Maximum number of lines to return across all files. If None, returns all lines.
    """
    log_dir = resolve_log_dir()
    all_lines = []
    
    try:
        # Get all log files sorted by modification time (newest first)
        log_files = []
        for fname in os.listdir(log_dir):
            if fname.startswith("access-") and fname.endswith(".log"):
                fpath = os.path.join(log_dir, fname)
                mtime = os.path.getmtime(fpath)
                log_files.append((mtime, fpath))
        
        # Sort by modification time (newest first)
        log_files.sort(reverse=True, key=lambda x: x[0])
        
        # Read all lines from all files
        for _, fpath in log_files:
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    file_lines = f.readlines()
                    all_lines.extend(file_lines)
            except (IOError, OSError):
                continue
        
        # Apply limit if specified
        if limit and limit > 0:
            all_lines = all_lines[-limit:]
            
        return "".join(all_lines)
        
    except Exception as e:
        print(f"Error reading log files: {str(e)}")
        return ""


def parse_ndjson_lines(text: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            # store as raw line if malformed
            out.append({"_raw": line})
    return out


def normalize_event(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize arbitrary payload into standard event structure."""
    def s(key: str, default: str = "") -> str:
        val = payload.get(key, default)
        return str(val) if val is not None else default

    event = s("event") or s("type") or "generic"
    module = s("module") or s("mod") or ""
    module_label = s("module_label") or s("moduleLabel") or ""
    page = s("page") or s("path") or s("url") or ""
    origin = s("origin") or s("referrer") or ""
    session_id = s("session_id") or s("sessionId") or s("sid") or ""
    chat_id = s("chat_id") or s("chatId") or ""
    value = _truncate_value(payload.get("value"))
    meta = payload.get("meta")

    if isinstance(meta, (dict, list)):
        pass
    elif meta is None:
        meta = None
    else:
        meta = str(meta)

    return {
        "event": event,
        "module": module,
        "module_label": module_label,
        "page": page,
        "origin": origin,
        "session_id": session_id,
        "chat_id": chat_id,
        "value": value,
        "meta": meta,
    }


def extract_client_ip(headers: Dict[str, str], remote_addr: Optional[str]) -> str:
    xff = headers.get("X-Forwarded-For") or headers.get("x-forwarded-for")
    if xff:
        # pick first IP
        return xff.split(",")[0].strip()
    return remote_addr or ""


def add_enrichment(record: Dict[str, Any], headers: Dict[str, str], remote_addr: Optional[str], user_agent: Optional[str]) -> Dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()
    record["_server_ts"] = now_iso
    record["_client_ip"] = extract_client_ip(headers, remote_addr)
    if user_agent:
        record["_user_agent"] = user_agent
    else:
        record["_user_agent"] = ""
    # optional geoip
    try:
        geo = geoip_lookup(record["_client_ip"]) if record["_client_ip"] else None
    except Exception:
        geo = None
    if geo:
        record["_geo"] = geo
    return record


def geoip_lookup(ip: str, timeout: float = 0.75) -> Optional[Dict[str, Any]]:
    """Very simple GeoIP via external service with cache. Fail silently.
    Uses ipapi.co/json/{ip}."""
    if not ip:
        return None
    now = datetime.now(timezone.utc).timestamp()
    with _geoip_cache_lock:
        if ip in _geoip_cache:
            ts, data = _geoip_cache[ip]
            if now - ts < _geoip_ttl_seconds:
                return data
    try:
        url = f"https://ipapi.co/{ip}/json/"
        req = urllib.request.Request(url, headers={"User-Agent": "consai-logs/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            raw = resp.read()
            data = json.loads(raw.decode("utf-8", errors="ignore"))
    except Exception:
        return None
    geo = {
        "country": data.get("country_name") or data.get("country"),
        "region": data.get("region") or data.get("region_code") or data.get("state"),
        "city": data.get("city"),
        "lat": data.get("latitude") or data.get("lat"),
        "lon": data.get("longitude") or data.get("lon"),
    }
    with _geoip_cache_lock:
        _geoip_cache[ip] = (now, geo)
    return geo


def pretty_lines(records: Iterable[Dict[str, Any]]) -> str:
    lines: List[str] = []
    counts: Dict[str, int] = {}
    for r in records:
        evt = r.get("event") or r.get("_raw") or "?"
        counts[evt] = counts.get(evt, 0) + 1
        ts = r.get("_server_ts", "")
        mod = r.get("module", "")
        page = r.get("page", "")
        val = r.get("value", "")
        ip = r.get("_client_ip", "")
        geo = r.get("_geo", {}) or {}
        geo_str = ", ".join([str(geo.get("city") or ""), str(geo.get("region") or ""), str(geo.get("country") or "")]).strip(", ")
        lines.append(f"{ts} | {evt} | {mod} | {page} | {val} | {geo_str} | {ip}")
    # totals footer
    lines.append("")
    lines.append("Totals:")
    for k in sorted(counts.keys()):
        lines.append(f"  {k}: {counts[k]}")
    return "\n".join(lines) + "\n"


def clear_today() -> None:
    path = get_daily_log_path()
    _ensure_dir(os.path.dirname(path))
    with open(path, "w", encoding="utf-8"):
        pass


def clear_all() -> int:
    """Delete all access-*.log files in the logs directory. Returns count deleted."""
    folder = resolve_log_dir()
    deleted = 0
    try:
        for name in os.listdir(folder):
            if not name.startswith("access-") or not name.endswith(".log"):
                continue
            fpath = os.path.join(folder, name)
            try:
                os.remove(fpath)
                deleted += 1
            except Exception:
                pass
    except Exception:
        pass
    # Ensure an empty file for today exists after clearing
    try:
        path_today = get_daily_log_path()
        _ensure_dir(os.path.dirname(path_today))
        with open(path_today, "a", encoding="utf-8"):
            pass
    except Exception:
        pass
    return deleted

