import os
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Any, Iterable, List, Optional, Tuple
import threading
import urllib.request
import urllib.error
from collections import Counter

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
_MAX_META_ITEMS = 12

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


def _trim_string(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return str(_truncate_value(value)).strip()


def _clean_meta(meta: Any, depth: int = 0) -> Any:
    if meta is None:
        return None
    if depth >= 2:
        return _trim_string(meta)
    if isinstance(meta, dict):
        cleaned = {}
        for idx, (key, value) in enumerate(meta.items()):
            if idx >= _MAX_META_ITEMS:
                break
            cleaned[_trim_string(key)[:80]] = _clean_meta(value, depth + 1)
        return cleaned or None
    if isinstance(meta, list):
        return [_clean_meta(item, depth + 1) for item in meta[:_MAX_META_ITEMS]]
    return _trim_string(meta)


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


def _normalize_legacy_event(payload: Dict[str, Any], event: str) -> Tuple[str, str, str]:
    category = _trim_string(payload.get("category"))
    module = _trim_string(payload.get("module"))
    action = _trim_string(payload.get("action"))

    if event == "module_click":
        return "module_access", category or "navigation", action or "open"
    if event == "homepage_banner_click":
        return "module_access", category or "navigation", action or "open"
    if event == "search_performed":
        return "feature_access", category or "feature", action or "search"
    if event in {"download_completed", "download_initiated", "download_failed"}:
        action_map = {
            "download_completed": "download",
            "download_initiated": "download_start",
            "download_failed": "download_failed",
        }
        return "feature_access", category or "feature", action or action_map[event]
    if event == "feedback_message":
        return "feedback", category or "feedback", action or "send"
    if event == "page_view":
        return "page_view", category or "navigation", action or "view"
    return event or "generic", category or "feature", action


def normalize_event(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize arbitrary payload into standard event structure."""
    raw_event = _trim_string(payload.get("event") or payload.get("type") or "generic", "generic")
    event, category, action = _normalize_legacy_event(payload, raw_event)
    page = _trim_string(payload.get("page") or payload.get("path") or payload.get("url"))
    page_label = _trim_string(payload.get("page_label") or payload.get("pageLabel") or payload.get("title"))
    module = _trim_string(payload.get("module") or payload.get("mod") or payload.get("module_group"))
    label = _trim_string(
        payload.get("label")
        or payload.get("module_label")
        or payload.get("moduleLabel")
        or payload.get("module_href")
    )
    session_id = _trim_string(payload.get("session_id") or payload.get("sessionId") or payload.get("sid"))
    chat_id = _trim_string(payload.get("chat_id") or payload.get("chatId"))
    value = _trim_string(payload.get("value"))
    meta = _clean_meta(payload.get("meta"))

    if not page_label:
        page_label = page.rsplit("/", 1)[-1].replace(".html", "").replace("_", " ").strip().title() if page else ""
    if not label:
        if event == "page_view":
            label = page_label or page
        elif module:
            label = module.replace("_", " ").strip().title()
        else:
            label = event.replace("_", " ").strip().title()

    return {
        "event": event,
        "category": category,
        "module": module,
        "action": action,
        "label": label,
        "page": page,
        "page_label": page_label,
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
    record["_user_agent"] = user_agent or ""
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
        val = r.get("label", "")
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


def _list_log_files_desc() -> List[str]:
    folder = resolve_log_dir()
    files: List[str] = []
    try:
        for name in os.listdir(folder):
            if name.startswith("access-") and name.endswith(".log"):
                files.append(os.path.join(folder, name))
    except Exception:
        return []
    return sorted(files, reverse=True)


def read_recent_lines(limit: Optional[int] = None) -> List[str]:
    if limit is not None and limit <= 0:
        limit = None

    log_files = _list_log_files_desc()
    if not log_files:
        return []

    if limit is None:
        ordered = list(reversed(log_files))
        lines: List[str] = []
        for fpath in ordered:
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    lines.extend(f.readlines())
            except (IOError, OSError):
                continue
        return lines

    remaining = limit
    chunks: List[List[str]] = []
    for fpath in log_files:
        if remaining <= 0:
            break
        lines = _tail_lines(fpath, remaining)
        if not lines:
            continue
        chunks.append([line + "\n" for line in lines])
        remaining -= len(lines)

    collected: List[str] = []
    for chunk in reversed(chunks):
        collected.extend(chunk)
    return collected


def read_all_raw(limit: Optional[int] = None) -> str:
    return "".join(read_recent_lines(limit=limit))


def read_records(limit: Optional[int] = None) -> List[Dict[str, Any]]:
    return parse_ndjson_lines(read_all_raw(limit=limit))


def summarize_records(records: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    total = 0
    page_views = 0
    accesses = 0
    unique_ips = set()
    locations = set()
    page_counter: Counter[str] = Counter()
    module_counter: Counter[str] = Counter()
    recent_locations: Counter[str] = Counter()

    for record in records:
        if not isinstance(record, dict):
            continue
        total += 1
        event = _trim_string(record.get("event"))
        label = _trim_string(record.get("label"))
        page_label = _trim_string(record.get("page_label"))
        module = _trim_string(record.get("module"))
        ip = _trim_string(record.get("_client_ip"))
        geo = record.get("_geo") or {}
        location = ", ".join(
            part for part in [
                _trim_string(geo.get("city")),
                _trim_string(geo.get("region")),
                _trim_string(geo.get("country")),
            ] if part
        )

        if ip:
            unique_ips.add(ip)
        if location:
            locations.add(location)
            recent_locations[location] += 1

        if event == "page_view":
            page_views += 1
            page_counter[page_label or label or _trim_string(record.get("page"))] += 1
        else:
            accesses += 1
            module_counter[label or module or event] += 1

    return {
        "total": total,
        "page_views": page_views,
        "accesses": accesses,
        "unique_ips": len(unique_ips),
        "locations": len(locations),
        "top_pages": [{"label": key, "count": count} for key, count in page_counter.most_common(4)],
        "top_accesses": [{"label": key, "count": count} for key, count in module_counter.most_common(5)],
        "top_locations": [{"label": key, "count": count} for key, count in recent_locations.most_common(4)],
    }
