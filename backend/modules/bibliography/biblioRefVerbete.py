from __future__ import annotations

import datetime as dt
import re
import unicodedata
import zipfile
from pathlib import Path
from typing import Dict, List, Optional
import xml.etree.ElementTree as ET


EC_XLSX_PATH = Path(__file__).resolve().parents[2] / "files" / "Biblio" / "EC.xlsx"

# Mantidas em nível de módulo para fácil customização.
SUFIXO_BIBLIO_VERBETE_SIMPLES = " *In*: **Vieira**, Waldo; Org.; ***Enciclopédia da Conscienciologia***; vol. digital único (PDF); CCXL + 34.372 p.; 10a Ed. rev. e aum.; *Associação Internacional de Enciclopediologia Conscienciológica* (ENCYCLOSSAPIENS); & *Associação Internacional Editares*; Foz do Iguaçu, PR; 2023."
SUFIXO_BIBLIO_VERBETE_BEE = "*In*: **Vieira**, Waldo; Org.; ***Enciclopédia da Conscienciologia***; apres. Coordenação da ENCYCLOSSAPIENS; revisores Equipe de Revisores da ENCYCLOSSAPIENS; vol. digital único (PDF); CCXL + 34.372 p.; 3 e-mails; 11.129 enus.; 727 especialidades; 1 foto; glos. 6.500 termos; 1 ilus.; 1.001 microbiografias; 417 tabs.; 25 websites; 1.048 filmes; 22.474 refs.; 125 vídeos; 1.860 webgrafias; alf.; 10a Ed. rev. e aum.; *Associação Internacional de Enciclopediologia Conscienciológica* (ENCYCLOSSAPIENS); & *Associação Internacional Editares*; Foz do Iguaçu, PR; 2023."
SUFIXO_BIBLIO_VERBETE_NEW = " *In*: **Vieira**, Waldo; Org.; ***Enciclopédia da Conscienciologia***; defendido no *Tertuliarium* do Centro de Altos Estudos da Conscienciologia (CEAEC); Foz do Iguaçu, PR; disponível em: <https:// encyclossapiens.space/ buscaverbete>; acesso em: ____."


TERMO_VERBETE_UNICO = "verbete;"
TERMO_VERBETE_MULTIPLOS = "verbetes;"

_CUTOFF_DATE = dt.date(2023, 12, 6)  # 06.12.2023
_SPLIT_RE = re.compile(r"[;,\r\n]+")
_NUM_RE = re.compile(r"n\.\s*(\d+)", re.IGNORECASE)
_DATE_RE = re.compile(r"\b(\d{2}\.\d{2}\.\d{4})\b")
_AUTHOR_PREFIX_RE = re.compile(r"^\s*(\*\*[^*]+\*\*(?:,\s*[^;]+)?)\s*;")
_TITLE_BLOCK_RE = re.compile(r"(\*\*\*.+?\*\*\*\s*\(n\.\s*\d+[^)]*\))", re.IGNORECASE)
_AUTHOR_PREFIX_FALLBACK_RE = re.compile(r"^\s*([^;]+?)\s*;")
_TITLE_BLOCK_FALLBACK_RE = re.compile(r";\s*(.+?\(n\.\s*\d+[^)]*\))", re.IGNORECASE)

_NS_SHEET = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
_NS_REL = {"r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}


def _norm(value: object) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_requested_titles(raw_titles: str) -> List[str]:
    return [part.strip() for part in _SPLIT_RE.split(str(raw_titles or "")) if part.strip()]


def dedupe_requested_titles(titles: List[str]) -> List[str]:
    deduped: List[str] = []
    seen: set[str] = set()
    for item in titles:
        key = _norm(item)
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(item.strip())
    return deduped


def _column_index(cell_ref: str) -> int:
    match = re.match(r"([A-Z]+)", str(cell_ref or "A"))
    if not match:
        return 0
    letters = match.group(1)
    idx = 0
    for ch in letters:
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return idx - 1


def _read_shared_strings(xlsx_zip: zipfile.ZipFile) -> List[str]:
    if "xl/sharedStrings.xml" not in xlsx_zip.namelist():
        return []
    root = ET.fromstring(xlsx_zip.read("xl/sharedStrings.xml"))
    out: List[str] = []
    for si in root.findall("s:si", _NS_SHEET):
        out.append("".join(node.text or "" for node in si.findall(".//s:t", _NS_SHEET)))
    return out


def _resolve_first_worksheet_path(xlsx_zip: zipfile.ZipFile) -> str:
    workbook = ET.fromstring(xlsx_zip.read("xl/workbook.xml"))
    first_sheet = workbook.find("s:sheets/s:sheet", _NS_SHEET)
    if first_sheet is None:
        raise ValueError("workbook sem planilhas.")

    rel_id = first_sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
    rels = ET.fromstring(xlsx_zip.read("xl/_rels/workbook.xml.rels"))
    target = None
    for rel in rels:
        if rel.attrib.get("Id") == rel_id:
            target = rel.attrib.get("Target")
            break
    if not target:
        raise ValueError("relacionamento da planilha nao encontrado.")
    return target if target.startswith("xl/") else f"xl/{target}"


def _cell_text(cell: ET.Element, shared_strings: List[str]) -> str:
    ctype = cell.attrib.get("t")

    if ctype == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//s:t", _NS_SHEET)).strip()

    value_node = cell.find("s:v", _NS_SHEET)
    if value_node is None or value_node.text is None:
        return ""

    raw = value_node.text.strip()
    if ctype == "s" and raw.isdigit():
        idx = int(raw)
        if 0 <= idx < len(shared_strings):
            return shared_strings[idx]
        return ""
    return raw


def read_xlsx_as_dicts(xlsx_path: Path) -> List[Dict[str, str]]:
    if not xlsx_path.exists():
        raise FileNotFoundError(f"Arquivo EC.xlsx nao encontrado no caminho: {xlsx_path}")

    with zipfile.ZipFile(xlsx_path) as zf:
        shared = _read_shared_strings(zf)
        worksheet_path = _resolve_first_worksheet_path(zf)
        worksheet = ET.fromstring(zf.read(worksheet_path))

    rows = worksheet.findall(".//s:sheetData/s:row", _NS_SHEET)
    if not rows:
        return []

    header_cells: Dict[int, str] = {}
    for cell in rows[0].findall("s:c", _NS_SHEET):
        idx = _column_index(cell.attrib.get("r", "A1"))
        header_cells[idx] = _norm(_cell_text(cell, shared))

    headers: List[str] = []
    if header_cells:
        max_idx = max(header_cells)
        headers = [header_cells.get(i, "") for i in range(max_idx + 1)]

    result: List[Dict[str, str]] = []
    for row in rows[1:]:
        row_cells: Dict[int, str] = {}
        for cell in row.findall("s:c", _NS_SHEET):
            idx = _column_index(cell.attrib.get("r", "A1"))
            row_cells[idx] = _cell_text(cell, shared).strip()

        if not row_cells:
            continue

        row_dict: Dict[str, str] = {}
        max_idx = max(max(row_cells.keys()), len(headers) - 1)
        for idx in range(max_idx + 1):
            key = headers[idx] if idx < len(headers) else ""
            if not key:
                continue
            row_dict[key] = row_cells.get(idx, "").strip()

        if any(str(v).strip() for v in row_dict.values()):
            result.append(row_dict)

    return result


def _row_get(row: Dict[str, str], *keys: str) -> str:
    for key in keys:
        candidate = row.get(_norm(key), "")
        if str(candidate).strip():
            return str(candidate).strip()
    return ""


def _extract_number(row: Dict[str, str], ref_list: str, ref_biblio: str) -> Optional[int]:
    raw_num = _row_get(row, "numero", "number")
    if raw_num:
        parsed = re.search(r"\d+", raw_num)
        if parsed:
            return int(parsed.group(0))

    for text in (ref_list, ref_biblio):
        match = _NUM_RE.search(str(text or ""))
        if match:
            return int(match.group(1))
    return None


def _extract_date(text: str) -> Optional[dt.date]:
    match = _DATE_RE.search(str(text or ""))
    if not match:
        return None
    try:
        return dt.datetime.strptime(match.group(1), "%d.%m.%Y").date()
    except ValueError:
        return None


def _extract_author_prefix(ref_biblio: str) -> str:
    match = _AUTHOR_PREFIX_RE.search(str(ref_biblio or ""))
    if match:
        return match.group(1).strip()

    fallback = _AUTHOR_PREFIX_FALLBACK_RE.search(str(ref_biblio or ""))
    return fallback.group(1).strip() if fallback else ""


def _extract_title_block(ref_biblio: str) -> str:
    match = _TITLE_BLOCK_RE.search(str(ref_biblio or ""))
    if match:
        return match.group(1).strip()

    fallback = _TITLE_BLOCK_FALLBACK_RE.search(str(ref_biblio or ""))
    return fallback.group(1).strip() if fallback else ""


def _find_match_row(rows: List[Dict[str, str]], requested_norm: str) -> Optional[Dict[str, str]]:
    exact_match = None
    fallback_match = None

    for row in rows:
        title = _row_get(row, "titulo", "title")
        title_norm = _norm(title)
        if not title_norm:
            continue
        if title_norm == requested_norm:
            exact_match = row
            break
        if not fallback_match and (requested_norm in title_norm or title_norm in requested_norm):
            fallback_match = row

    return exact_match or fallback_match


def _build_missing_entry(label: str, index: int) -> Dict[str, object]:
    fallback = f"**{label}**: verbete nao encontrado."
    return {
        "requested_title": label,
        "request_index": index,
        "number": None,
        "ref_list": fallback,
        "ref_biblio": fallback,
        "author_prefix": "",
        "title_block": "",
        "is_new": False,
    }


def _collect_entries(rows: List[Dict[str, str]], requested_titles: List[str]) -> List[Dict[str, object]]:
    entries: List[Dict[str, object]] = []

    for idx, requested in enumerate(requested_titles):
        requested_norm = _norm(requested)
        found = _find_match_row(rows, requested_norm)
        if not found:
            entries.append(_build_missing_entry(requested, idx))
            continue

        ref_list = _row_get(found, "ref_list", "ref list")
        ref_biblio = _row_get(found, "ref_biblio", "ref biblio")
        if not ref_list:
            ref_list = f"**{requested}**: verbete nao encontrado."
        if not ref_biblio:
            ref_biblio = f"**{requested}**: verbete nao encontrado."

        date_value = (
            _extract_date(ref_biblio)
            or _extract_date(ref_list)
            or _extract_date(_row_get(found, "data", "date"))
        )

        entries.append(
            {
                "requested_title": requested,
                "request_index": idx,
                "number": _extract_number(found, ref_list, ref_biblio),
                "ref_list": ref_list.strip(),
                "ref_biblio": ref_biblio.strip(),
                "author_prefix": _extract_author_prefix(ref_biblio),
                "title_block": _extract_title_block(ref_biblio),
                "is_new": bool(date_value and date_value > _CUTOFF_DATE),
            }
        )

    return entries


def _sort_entries(entries: List[Dict[str, object]]) -> List[Dict[str, object]]:
    return sorted(
        entries,
        key=lambda item: (
            item.get("number") is None,
            item.get("number") if item.get("number") is not None else float("inf"),
            int(item.get("request_index", 0)),
        ),
    )


def _sort_entries_for_ref_list(entries: List[Dict[str, object]]) -> List[Dict[str, object]]:
    return sorted(
        entries,
        key=lambda item: (
            _norm(item.get("requested_title", "")),
            int(item.get("request_index", 0)),
        ),
    )


def _render_suffix(template: str, count: int) -> str:
    plural = "verbete" if count == 1 else "verbetes"
    termo = TERMO_VERBETE_UNICO if count == 1 else TERMO_VERBETE_MULTIPLOS
    return f" {termo} {template.format(count=count, plural=plural).lstrip()}"


def _normalize_style(style: str) -> str:
    style_norm = str(style or "").strip().lower()
    return "bee" if style_norm == "bee" else "simples"


def _regular_suffix_by_style(style: str) -> str:
    return SUFIXO_BIBLIO_VERBETE_BEE if _normalize_style(style) == "bee" else SUFIXO_BIBLIO_VERBETE_SIMPLES


def _build_group_lines(sorted_entries: List[Dict[str, object]], group_name: str, style: str) -> List[str]:
    author_groups: Dict[str, Dict[str, object]] = {}
    plain_lines: List[tuple[int, str]] = []

    for idx, item in enumerate(sorted_entries):
        is_new = bool(item.get("is_new"))
        target = "novo" if is_new else "regular"
        if target != group_name:
            continue

        author = str(item.get("author_prefix", "")).strip()
        title_block = str(item.get("title_block", "")).strip()
        original_line = str(item.get("ref_biblio", "")).strip()

        if author and title_block:
            group = author_groups.setdefault(author, {"first_idx": idx, "titles": []})
            group["titles"].append(title_block)
            group["first_idx"] = min(int(group["first_idx"]), idx)
        elif original_line:
            plain_lines.append((idx, original_line))

    consolidated_lines: List[tuple[int, str]] = []
    for author, data in author_groups.items():
        titles = data["titles"]
        suffix_tmpl = SUFIXO_BIBLIO_VERBETE_NEW if group_name == "novo" else _regular_suffix_by_style(style)
        suffix = _render_suffix(suffix_tmpl, len(titles)).strip()
        line = f"{author}; {'; '.join(titles)} {suffix}"
        consolidated_lines.append((int(data["first_idx"]), line.strip()))

    all_lines = consolidated_lines + plain_lines
    all_lines.sort(key=lambda item: item[0])
    return [line for _, line in all_lines if line]


def _assemble_ref_biblio(sorted_entries: List[Dict[str, object]], style: str) -> str:
    regular_lines = _build_group_lines(sorted_entries, "regular", style)
    new_lines = _build_group_lines(sorted_entries, "novo", style)

    sections: List[str] = []
    if regular_lines:
        sections.append("\n\n".join(regular_lines))
    if new_lines:
        sections.append("\n\n".join(new_lines))
    return "\n\n".join(sections).strip()


def build_ref_verbete(titles_raw: str, style: str = "simples", xlsx_path: Path = EC_XLSX_PATH) -> Dict[str, str]:
    if not str(titles_raw or "").strip():
        raise ValueError("Parametro 'titles' e obrigatorio.")

    titles = dedupe_requested_titles(parse_requested_titles(titles_raw))
    if not titles:
        raise ValueError("Nenhum verbete valido informado.")

    rows = read_xlsx_as_dicts(xlsx_path)
    entries = _collect_entries(rows, titles)
    sorted_entries = _sort_entries(entries)
    ref_list_entries = _sort_entries_for_ref_list(entries)
    style_norm = _normalize_style(style)

    ref_list_lines = [str(item["ref_list"]).strip() for item in ref_list_entries if str(item["ref_list"]).strip()]
    ref_list = "\n\n".join(f"{idx}.  {line}" for idx, line in enumerate(ref_list_lines, start=1))
    ref_biblio = _assemble_ref_biblio(sorted_entries, style_norm)
    return {"ref_list": ref_list.strip(), "ref_biblio": ref_biblio.strip()}
