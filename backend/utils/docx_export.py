# -*- coding: utf-8 -*-
"""
docx_export.py (clean)
- Constrói Markdown agrupado por fonte (sumário + itens + metadados)
- Realça TERMO por palavra inteira usando **negrito** (sem <span>)
- Converte MD -> HTML -> DOCX com html2docx(html, title)
- Aplica moldura e cor no título (primeiro parágrafo)
- Aplica JUSTIFICAÇÃO GLOBAL (exceto o título)
"""

from collections import defaultdict
from datetime import datetime
from io import BytesIO
import os
import re

from docx import Document  # fábrica do python-docx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor
from html2docx import html2docx
from markdown import markdown


# ====================== helpers docx ======================

def _add_paragraph_border_double(paragraph, hex_color="006400", size_eights_pt=24):
    """Borda dupla no parágrafo (título)."""
    p = paragraph._p
    pPr = p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    for side in ('top', 'left', 'bottom', 'right'):
        el = OxmlElement(f'w:{side}')
        el.set(qn('w:val'), 'double')
        el.set(qn('w:sz'), str(size_eights_pt))  # 24 ~ 3pt
        el.set(qn('w:color'), hex_color)
        el.set(qn('w:space'), '4')
        pBdr.append(el)
    pPr.append(pBdr)

def _add_field_code(paragraph, instr):
    """Campos Word (PAGE, NUMPAGES)."""
    r = paragraph.add_run()
    fb = OxmlElement('w:fldChar'); fb.set(qn('w:fldCharType'), 'begin')
    it = OxmlElement('w:instrText'); it.set(qn('xml:space'), 'preserve'); it.text = instr
    fe = OxmlElement('w:fldChar'); fe.set(qn('w:fldCharType'), 'end')
    r._r.append(fb); r._r.append(it); r._r.append(fe)
    r.font.size = Pt(9); r.font.color.rgb = RGBColor(128, 128, 128)

def _apply_global_justification(doc, exclude_first_paragraph=True):
    """Justifica todo o texto (pula o primeiro parágrafo/título)."""
    start_idx = 1 if (exclude_first_paragraph and doc.paragraphs) else 0
    for p in doc.paragraphs[start_idx:]:
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY


# ====================== construção do Markdown ======================

def _norm_source(name: str) -> str:
    if not name:
        return "Geral"
    base = os.path.basename(str(name))
    name, _ = os.path.splitext(base)
    return name or "Geral"

def _pick_text_lexical(item: dict) -> str:
    """Extract text from lexical search results."""
    return str(item.get("paragraph") or "").strip()

def _pick_text_mancia(item: dict) -> str:
    """Extract text from mancia (commentary) results."""
    return str(item.get("text") or item.get("content") or "").strip()

def _pick_text_ragbot(item: dict) -> str:
    """Extract text from RAGbot results."""
    # RAGbot might have either 'text' or 'response' field
    return str(item.get("text") or item.get("response") or "").strip()

def _pick_text_semantical(item: dict) -> str:
    """Extract text from semantical/verbetopedia results."""
    # Try paragraph field first (matches lexical search structure)
    if "paragraph" in item and item["paragraph"]:
        return str(item["paragraph"]).strip()
    # Fall back to other possible fields
    for key in ["text", "content", "page_content"]:
        if key in item and item[key]:
            return str(item[key]).strip()
    return ""

def _pick_text(item: dict, search_type: str = "") -> str:
    """
    Main text extraction function that routes to specific handlers.
    
    Args:
        item: Dictionary containing the result item
        search_type: Type of search (lexical, mancia, ragbot, semantical, verbetopedia)
    """
    if not item or not isinstance(item, dict):
        return ""
        
    # Try specific handlers first
    if search_type == "lexical":
        return _pick_text_lexical(item)
    elif search_type == "mancia":
        return _pick_text_mancia(item)
    elif search_type == "ragbot":
        return _pick_text_ragbot(item)
    elif search_type in ("semantical", "verbetopedia"):
        return _pick_text_semantical(item)
    
    # Fallback: try common keys
    for key in ["text", "content", "paragraph", "response"]:
        if key in item and item[key]:
            return str(item[key]).strip()
            
    return ""

def _extract_meta(item: dict) -> dict:
    """
    >>>>>>>>>>>>>>  PONTO DE CUSTOMIZAÇÃO — METADADOS (EXTRAÇÃO)  <<<<<<<<<<<<<<
    Ajuste/adicione chaves conforme sua base.
    """
    m = dict(item.get("meta") or {})
    m["source"] = m.get("source") or item.get("source")
    m["author"] = m.get("author") or m.get("autor") or item.get("author") or item.get("autor")
    m["date"]   = m.get("date")   or item.get("date")
    m["theme"]  = m.get("theme")  or m.get("tematologia") or item.get("theme")
    m["title"]  = m.get("title")  or item.get("title")
    m["link"]   = m.get("link")   or item.get("link") or m.get("link_wv")
    number = (item.get("paragraph_number") or item.get("paragraph") or
              item.get("quest_number") or item.get("number") or m.get("number"))
    if number is not None:
        m["number"] = number
    # EXTRAS:
    # m["especialidade"] = m.get("especialidade") or item.get("especialidade")
    # m["area"]          = m.get("area")          or item.get("area")
    # m["sigla"]         = m.get("sigla")         or item.get("sigla")
    return m

def _highlight_term_in_md(md_text: str, term: str):
    """
    Realça TERMO por PALAVRA INTEIRA no Markdown com **negrito**.
    (Sem HTML inline para evitar duplicações na conversão.)
    """
    if not term or not md_text:
        return md_text
    pattern = re.compile(rf"\b{re.escape(term)}\b", flags=re.IGNORECASE)
    return pattern.sub(lambda m: f'**{m.group(0)}**', md_text)

def build_grouped_markdown(payload: dict) -> str:
    """
    Markdown:
    - H1 título (term), tipo de busca, data
    - Sumário (total + por fonte)
    - Por fonte: H2 + lista numerada + metadados
    """
    term        = (payload.get("term") or "").strip() or "Resultados da Busca"
    search_type = (payload.get("search_type") or payload.get("type") or "lexical").strip()
    results     = (payload.get("results") or [])

    by_source = defaultdict(list)
    for it in results:
        src = _norm_source((it.get("meta") or {}).get("source") or it.get("source") or "Geral")
        by_source[src].append(it)

    total = sum(len(v) for v in by_source.values())

    lines = []
    lines.append(f"# {term}")
    lines.append("")
    lines.append("\n")
    lines.append(f"\n\n**Tipo de busca:** {search_type.capitalize()}\n")
    lines.append(f"**Data:** {datetime.now().strftime('%d/%m/%Y')}\n")
    lines.append("\n\n## Sumário\n")
    lines.append("")
    lines.append(f"**Total de parágrafos encontrados: {total}**")
    lines.append("")
    for src in sorted(by_source.keys()):
        lines.append(f"•  {src}: {len(by_source[src])}\n")
    lines.append("")
    lines.append("")

    for src in sorted(by_source.keys()):
        lines.append("\n\n")
        lines.append(f"\n\n## {src}\n\n")
        lines.append("\n\n")
        
        for idx, it in enumerate(by_source[src], start=1):
            text = _highlight_term_in_md(_pick_text(it, search_type), term)
            meta = _extract_meta(it)

            lines.append(f"{idx}. {text}")

            # >>>>>>>>>>>>>>  PONTO DE CUSTOMIZAÇÃO — METADADOS (EXIBIÇÃO)  <<<<<<<<<<<<<<
            meta_bits = []
            
            # Add all metadata fields except the ones we handle specially
            special_fields = {'number', 'author', 'date', 'theme', 'link', 'source'}
            for key, value in meta.items():
                if key not in special_fields and value not in (None, ""):
                    meta_bits.append(f"{key}: {value}")
            
            # Add the special fields in a specific order
            if meta.get("number") not in (None, ""): meta_bits.insert(0, f"#{meta['number']}")
            if meta.get("author"): meta_bits.insert(1, f"Autor: {meta['author']}")
            if meta.get("date"): meta_bits.append(f"Data: {meta['date']}")
            if meta.get("theme"): meta_bits.append(f"Tema: {meta['theme']}")
            if meta.get("source"): meta_bits.append(f"Fonte: {meta['source']}")
            if meta.get("title"): meta_bits.append(f"Título: {meta['title']}")

            if meta_bits or meta.get("link"):
                parts = []
                if meta_bits:
                    parts.append("**Metadados:** " + " | ".join(meta_bits))
                if meta.get("link"):
                    parts.append(f"[link]({meta['link']})")
                lines.append("")
                lines.append("_" + " | ".join(parts) + "_")
            lines.append("")

        lines.append("")

    return "\n".join(lines)


# ====================== MD -> DOCX ======================

def _first_heading_from_md(md_text: str, default="Document"):
    """Extrai o primeiro heading (# ...) do Markdown para usar como título do html2docx."""
    
    for line in (md_text or "").splitlines():
        s = line.strip()
        if s.startswith("#"):
            t = s.lstrip("#").strip()
            if t:
                return t[:40].capitalize()
    return default

def _wrap_full_html(html_fragment: str) -> str:
    """Garante HTML completo (<html><body>...</body></html>) — previne DOCX vazio."""
    frag = html_fragment or ""
    low = frag.lower()
    if "<html" in low and "<body" in low:
        return frag
    return f"<!DOCTYPE html><html><head><meta charset='utf-8'></head><body>{frag}</body></html>"






def markdown_to_docx_bytes(md_text: str,
                           title_color_rgb=(0x00, 0x64, 0x00),
                           justify_globally: bool = True) -> bytes:
    """
    Markdown -> HTML -> DOCX (bytes) com html2docx(html, title).
    - Moldura/cor no título (primeiro parágrafo não-vazio)
    - Justificação global (exceto o título)
    - Rodapé "Página X / Y"
    """
    # 1) MD -> HTML (sem nl2br/smarty para evitar artefatos)
    html_fragment = markdown(md_text, extensions=["extra", "sane_lists"])
    html_full = _wrap_full_html(html_fragment)

    # 2) HTML -> DOCX (sua versão usa 2 argumentos)
    title_guess = _first_heading_from_md(md_text, default="Resultados da Busca").capitalize()
    res = html2docx(html_full, title_guess)

    # 3) Normaliza o retorno (pode ser Document, bytes ou BytesIO)
    if hasattr(res, "sections") and hasattr(res, "save"):
        doc = res  # python-docx Document
    elif isinstance(res, (bytes, bytearray)):
        bio_in = BytesIO(res)
        bio_in.seek(0)
        doc = Document(bio_in)
    elif hasattr(res, "read"):  # BytesIO ou file-like
        try:
            res.seek(0)
        except Exception:
            pass
        doc = Document(res)
    else:
        # fallback mínimo: doc vazio (não deve ocorrer)
        doc = Document()

    # 4) Rodapé "Página X / Y"
    footer = doc.sections[0].footer
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_field_code(p, "PAGE")
    run = p.add_run(" / "); run.font.size = Pt(9); run.font.color.rgb = RGBColor(128, 128, 128)
    _add_field_code(p, "NUMPAGES")

   
         
    # 6) Justificação global (exceto o título)
    p0 = next((par for par in doc.paragraphs if par.text.strip()), doc.paragraphs[0] if doc.paragraphs else None)
    if justify_globally:
        started = False
        for par in doc.paragraphs:
            if not started and par is p0:
                started = True
                continue
            par.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for par in cell.paragraphs:
                        par.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    # 5) Moldura + cor no título (primeiro parágrafo não-vazio)
    p0 = next((par for par in doc.paragraphs if par.text.strip()), doc.paragraphs[0] if doc.paragraphs else None)
    if p0 is not None:
        for r in p0.runs:
            r.font.color.rgb = RGBColor(*title_color_rgb)
            r.bold = True
            r.font.size = Pt(18)
        _add_paragraph_border_double(p0, hex_color="006400", size_eights_pt=12)
        p0.alignment = WD_ALIGN_PARAGRAPH.CENTER  


    # 7) Bytes
    bio = BytesIO()
    doc.save(bio)
    bio.seek(0)
    return bio.getvalue()
