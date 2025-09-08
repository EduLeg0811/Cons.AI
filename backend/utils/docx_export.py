from io import BytesIO
from collections import defaultdict
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from markdown import markdown
from html2docx import html2docx
import logging

logger = logging.getLogger(__name__)


# =======================
# CONSTANTES GERAIS
# =======================
DEFAULT_FONT_NAME   = "Calibri"
DEFAULT_FONT_SIZE   = Pt(10)             # corpo do texto
DEFAULT_FONT_COLOR  = RGBColor(0, 0, 0)  # preto

LINE_SPACING        = 1.0                # espaçamento entre linhas (simples)
SPACE_BEFORE        = Pt(0)              # espaço antes do parágrafo
SPACE_AFTER         = Pt(0)              # espaço depois do parágrafo

MARGIN_CM           = 2.5                # todas as margens em cm


def _add_paragraph_border_double(paragraph, color="000000", size_eights_pt=12):
    p = paragraph._p
    pPr = p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    for side in ('top', 'left', 'bottom', 'right'):
        el = OxmlElement(f'w:{side}')
        el.set(qn('w:val'), 'double')
        el.set(qn('w:sz'), str(size_eights_pt))
        el.set(qn('w:color'), color)
        el.set(qn('w:space'), '4')
        pBdr.append(el)
    pPr.append(pBdr)


def _add_bottom_border(paragraph, color="444444", size_eights_pt=12):
    p = paragraph._p
    pPr = p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), str(size_eights_pt))
    bottom.set(qn('w:color'), color)
    bottom.set(qn('w:space'), '1')
    pBdr.append(bottom)
    pPr.append(pBdr)






#_________________________________________________________  
# build_docx_bytes
#_________________________________________________________  
def build_docx_bytes(payload: dict) -> bytes:
    term = (payload.get("term") or "").strip() or "Resultados"
    search_type = (payload.get("search_type") or payload.get("type") or "").capitalize()
    results = payload.get("results") or []
    details = payload.get("details", False)

    grouped = defaultdict(list)
    for it in results:
        src = it.get("source") or it.get("book") or it.get("file")
        grouped[src].append(it)

    total_count = sum(len(v) for v in grouped.values())
    doc = Document()

    # ===== Ajustes globais =====
    style = doc.styles["Normal"]
    style.font.name = DEFAULT_FONT_NAME
    style.font.size = DEFAULT_FONT_SIZE
    style.font.color.rgb = DEFAULT_FONT_COLOR

    pf = style.paragraph_format
    pf.line_spacing = LINE_SPACING
    pf.space_before = SPACE_BEFORE
    pf.space_after = SPACE_AFTER

    for section in doc.sections:
        section.top_margin    = Cm(MARGIN_CM)
        section.bottom_margin = Cm(MARGIN_CM)
        section.left_margin   = Cm(MARGIN_CM)
        section.right_margin  = Cm(MARGIN_CM)

    # ===== Cabeçalho =====
    pf.space_after = 0
    term = term.title()
    p = doc.add_paragraph(term)
    run = p.runs[0]
    run.font.size = Pt(20)
    run.font.bold = True
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_paragraph_border_double(p, size_eights_pt=16)

    doc.add_paragraph("")
    doc.add_paragraph("")

    # ===== Tipo =====
    p = doc.add_paragraph()
    p.add_run("Tipo de pesquisa: ").bold = True
    if search_type == "Lexical":
        p.add_run("Léxica")
    elif search_type == "Semantical":
        p.add_run("Semântica")
    else:
        p.add_run("Geral")

    doc.add_paragraph("")

    # ===== Termo =====
    p = doc.add_paragraph()
    p.add_run("Termo de pesquisa: ").bold = True
    p.add_run(term)

    doc.add_paragraph("")
    

    # ===== Estatísticas =====
    p = doc.add_paragraph()
    p.add_run("Total de resultados: ").bold = True
    p.add_run(str(total_count))
    for src, items in grouped.items():
        doc.add_paragraph(f"• {bookName(src)}: {len(items)}")

    doc.add_paragraph("")
    


    # ===== Resultados =====
    counter = 1   # <<< INÍCIO DA NUMERAÇÃO GLOBAL

    for src, items in grouped.items():

        book = bookName(src)

        doc.add_paragraph("")
        doc.add_paragraph("")

        # Badge da fonte (vermelho, bold)
        badge_p = doc.add_paragraph()
        run = badge_p.add_run(f"{book}")
        run.font.size = Pt(14)
        run.font.bold = True
        run.font.color.rgb = RGBColor(200, 0, 0)
        badge_p.alignment = WD_ALIGN_PARAGRAPH.LEFT

        # Linha divisória
        divider_p = doc.add_paragraph()
        _add_bottom_border(divider_p)

        doc.add_paragraph("")

        #...............................................................
        # Parágrafos dos Resultados
        #...............................................................
        for it in items:

            meta = it.get("metadata") if it.get("metadata") else None

            if meta:
                raw_text = meta.get("markdown")
            else:
                raw_text = it.get("markdown") or it.get("content_text") or it.get("text") or ""


            # >>>>>> acrescentar "Definologia" em negrito antes do texto
            if src in ('EC', 'ECALL_DEF', 'ECWV', 'ECALL'):
                raw_text = f"**Definologia.** {raw_text}"
                
            numbered_md = f"{raw_text}"

            # Markdown -> HTML
            html = markdown(numbered_md, extensions=["extra", "sane_lists"])
            tmp_bytes = html2docx(html, None)
            tmp_doc = Document(tmp_bytes)

            # Copiar parágrafos inteiros com numeração global
            for p in tmp_doc.paragraphs:
                new_p = doc.add_paragraph()

                # Numeração sequencial global
                num_run = new_p.add_run(f"{counter}. ")
                num_run.bold = True
                num_run.font.color.rgb = RGBColor(0, 0, 255)

                # Conteúdo original
                for r in p.runs:
                    new_r = new_p.add_run(r.text)
                    new_r.bold = r.bold
                    new_r.italic = r.italic
                    new_r.font.name = DEFAULT_FONT_NAME
                    new_r.font.size = DEFAULT_FONT_SIZE
                    new_r.font.color.rgb = DEFAULT_FONT_COLOR

                # Justificar o parágrafo
                new_p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

                # Garantir formatação de parágrafo
                pf = new_p.paragraph_format
                pf.line_spacing = LINE_SPACING
                pf.space_before = SPACE_BEFORE
                pf.space_after = SPACE_AFTER

                counter += 1

                

            # ...............................................................
            # Metadados
            # ...............................................................
            if details:


                metaInfo = createMetaInfo(meta, it, src)

                metaInfo_p = doc.add_paragraph(metaInfo)
                metaInfo_p.runs[0].font.size = Pt(9)
                metaInfo_p.runs[0].font.color.rgb = RGBColor(150, 150, 150)
                metaInfo_p.space_before = 0.5

                # Garantir formatação de parágrafo
                pf = metaInfo_p.paragraph_format
                pf.line_spacing = LINE_SPACING
                pf.space_before = SPACE_BEFORE
                pf.space_after = SPACE_AFTER

                doc.add_paragraph("")

            else:
                doc.add_paragraph("")




    bio = BytesIO()
    doc.save(bio)
    bio.seek(0)
    return bio.getvalue()








#______________________________________________________________________________________________
# bookName  --- call from [bridge.js] <call_llm>
#______________________________________________________________________________________________
def bookName(source):

    realName = source;

    if (source == 'HSR'):
        realName = 'Homo sapiens reurbanisatus';

    if (source == 'HSP'):
        realName = 'Homo sapiens pacificus';
    
    if (source == '200TEAT'):
        realName = '200 Teáticas da Conscienciologia';

    if (source == '700EXP'):
        realName = '700 Experimentos da Conscienciologia';
    
    if (source == 'TEMAS'):
        realName = 'Temas da Conscienciologia';
    
    if (source == 'PROEXIS'):
        realName = 'Manual da Proéxis';
    
    if (source == 'TNP'):
        realName = 'Manual da Tenepes';
    
    if (source == 'DUPLA'):
        realName = 'Manual da Dupla Evolutiva';
    
    if (source == 'LO'):
        realName = 'Léxico de Ortopensatas';
    
    if (source == 'EC' or source == 'ECALL' or source == 'ECALL_DEF'):
        realName = 'Enciclopédia da Conscienciologia';
    
    if (source == 'DAC'):
        realName = 'Dicionário de Argumentos da Conscienciologia';
    
    if (source == 'PROJ'):
        realName = 'Projeciologia';

    if (source == 'CCG'):
        realName = 'Conscienciograma';

    return realName;







def createMetaInfo(meta, it, src):
    

    mt_book = bookName(src) + " | "
    
    # --- title ---
    if meta and meta.get("title"):
        mt_title = meta.get("title") + " | "
    elif it.get("title"):
        mt_title = it.get("title") + " | "
    else:
        mt_title = ""

    # --- number ou paragraph_number ---
    if meta and (meta.get("number") or meta.get("paragraph_number")):
        mt_number = f"@{meta.get('number') or meta.get('paragraph_number')} | "
    elif it.get("number") or it.get("paragraph_number"):
        mt_number = f"@{it.get('number') or it.get('paragraph_number')} | "
    else:
        mt_number = ""

    # --- score ---
    if meta and meta.get("score"):
        mt_score = f"#{meta.get('score')} | "
    elif it.get("score"):
        mt_score = f"#{it.get('score')} | "
    else:
        mt_score = ""

    # --- author ---
    if meta and meta.get("author"):
        mt_author = meta.get("author") + " | "
    elif it.get("author"):
        mt_author = it.get("author") + " | "
    else:
        mt_author = ""

    # --- date ---
    if meta and meta.get("date"):
        mt_date = meta.get("date") + " | "
    elif it.get("date"):
        mt_date = it.get("date") + " | "
    else:
        mt_date = ""

    # --- section ---
    if meta and meta.get("section"):
        mt_section = meta.get("section") + " | "
    elif it.get("section"):
        mt_section = it.get("section") + " | "
    else:
        mt_section = ""

    # --- theme ---
    if meta and meta.get("theme"):
        mt_theme = meta.get("theme") + " | "
    elif it.get("theme"):
        mt_theme = it.get("theme") + " | "
    else:
        mt_theme = ""

    # --- area ---
    if meta and meta.get("area"):
        mt_area = meta.get("area") + " | "
    elif it.get("area"):
        mt_area = it.get("area") + " | "
    else:
        mt_area = ""

    # --- folha ---
    if meta and meta.get("folha"):
        mt_folha = meta.get("folha") + " | "
    elif it.get("folha"):
        mt_folha = it.get("folha") + " | "
    else:
        mt_folha = ""

                           

    # Add metadata to badges

    metaInfo = [mt_book]
    
    if src == "LO":
        metaInfo.append(mt_title)
        metaInfo.append(mt_number)
        metaInfo.append(mt_score)

    elif src == 'DAC':
        metaInfo.append(mt_title)
        metaInfo.append(mt_author)
        metaInfo.append(mt_date)
        metaInfo.append(mt_section)
        metaInfo.append(mt_number)
        metaInfo.append(mt_score)

    elif src == 'CCG':
        metaInfo.append(mt_title)
        metaInfo.append(mt_section)
        metaInfo.append(mt_folha)
        metaInfo.append(mt_number)
        metaInfo.append(mt_score)

    elif src in ('EC', 'ECALL_DEF', 'ECWV', 'ECALL'):
        metaInfo.append(mt_title)
        metaInfo.append(mt_area)
        metaInfo.append(mt_theme)
        metaInfo.append(mt_author)
        metaInfo.append(mt_date)
        metaInfo.append(mt_number)
        metaInfo.append(mt_score)

    else:
        metaInfo.append(mt_title)
        metaInfo.append(mt_number)
        metaInfo.append(mt_score)


    # Join list into string
    metaInfo = "".join(metaInfo)

    # Erases the last " | " (3 chars)
    metaInfo = metaInfo[:-3]

    return metaInfo