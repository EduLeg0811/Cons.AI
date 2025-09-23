"""
lexical_utils.py
----------------
Módulo de busca léxica em arquivos .md/.txt e .xlsx com suporte a:

- Conectores lógicos: NOT (!), AND (&), OR (|)
- Precedência: ! > & > |
- Parênteses
- Curingas: `*` (prefixo, sufixo, infixo)
- Frases exatas entre aspas: "campo de força"
- Normalização: case-insensitive e sem acentos (NFD)
- Pré-filtro barato por substring (quando seguro) para acelerar a busca

Organização:
1) Constantes & imports
2) Modelos de dados
3) Normalização & helpers gerais
4) I/O (leitura de arquivos)
5) Mini-motor booleano (tokenização, RPN, compilação + pré-filtro)
6) Buscas por tipo de conteúdo (MD/Excel)
7) Façade pública `lexical_search_in_files`
"""

from __future__ import annotations

# =============================================================================================
# 1) Constantes & imports
# =============================================================================================
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import logging
import re
import unicodedata

import pandas as pd

from utils.config import FILES_SEARCH_DIR, MAX_OVERALL_SEARCH_RESULTS


# Operadores e precedência: NOT > AND > OR
_BOOL_OPS: Dict[str, int] = {"!": 3, "&": 2, "|": 1}


# =============================================================================================
# 2) Modelos de dados
# =============================================================================================
@dataclass
class SearchResult:
    """Estrutura padronizada para um item de resultado."""
    source: str
    text: str
    number: Optional[int] = None
    score: float = 0.0
    metadata: Optional[Dict[str, Any]] = None


# =============================================================================================
# 3) Normalização & helpers gerais
# =============================================================================================
def strip_accents(s: str) -> str:
    """Remove acentos mantendo apenas as letras base (NFD)."""
    if not s:
        return ""
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def normalize_for_match(s: str) -> str:
    """Normaliza string para comparação: sem acentos e minúscula."""
    return strip_accents(s or "").lower()


def balanced_parentheses(query: str) -> bool:
    """Retorna True se os parênteses estiverem balanceados."""
    depth = 0
    for ch in query:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                return False
    return depth == 0


def clamp_max_results(results: List[Any], limit: int) -> List[Any]:
    """Corta a lista ao tamanho máximo (sem causar exceções se limite <= 0)."""
    return results[: max(0, limit)]


# =============================================================================================
# 4) I/O (leitura de arquivos)
# =============================================================================================
def list_files(source_dir: str, extension: str) -> List[Path]:
    """
    Lista arquivos de uma extensão num diretório (não recursivo).
    - extension: "md", "txt" ou "xlsx"
    """
    base = Path(source_dir).expanduser().resolve()
    if not base.exists():
        logging.error(f"Diretório não existe: {base}")
        return []
    ext = f".{extension.lower()}"
    return sorted([p for p in base.iterdir() if p.is_file() and p.suffix.lower() == ext])


def read_text_file(path: Path, encodings: Tuple[str, ...] = ("utf-8", "cp1252")) -> str:
    """
    Lê um arquivo texto/markdown testando múltiplos encodings.
    Levanta exceção se todos falharem.
    """
    last_error: Optional[Exception] = None
    for enc in encodings:
        try:
            return path.read_text(encoding=enc)
        except UnicodeDecodeError as e:
            last_error = e
            logging.warning(f"[read_text_file] Falha {path.name} com {enc}. Tentando próximo…")
    raise Exception(f"Não foi possível decodificar {path} ({encodings}). Último erro: {last_error}")


def read_excel_first_sheet(path: Path) -> List[Dict[str, str]]:
    """
    Lê a primeira planilha como lista de dicionários (tudo como string).
    Adiciona 'paragraph_number' como número de linha (1-based no dado).
    """
    df = pd.read_excel(path, sheet_name=0, dtype=str).fillna("")
    rows: List[Dict[str, str]] = []
    for i, row in enumerate(df.to_dict(orient="records"), start=1):
        # normaliza chaves em minúsculas para evitar colisões/exceções posteriores
        row_norm = {str(k).lower(): ("" if v is None else str(v)) for k, v in row.items()}
        row_norm["paragraph_number"] = i
        rows.append(row_norm)
    return rows


# =============================================================================================
# 5) Mini-motor booleano (tokenização, RPN, compilação + pré-filtro)
# =============================================================================================
def tokenize_query(q: str) -> List[str]:
    """
    Tokeniza conectores, parênteses e termos.
    - Suporta frases entre aspas duplas como um único token (pode conter espaços).
    - Ex.: pato & "donald duck" | !cadeira -> ['pato','&','\"donald duck\"','|','!','cadeira']
    """
    tokens: List[str] = []
    i, n = 0, len(q)
    while i < n:
        c = q[i]
        if c.isspace():
            i += 1
            continue
        if c in "()&|!":
            tokens.append(c)
            i += 1
            continue
        if c == '"':
            # frase entre aspas
            j = i + 1
            buf: List[str] = []
            while j < n and q[j] != '"':
                buf.append(q[j])
                j += 1
            tokens.append('"' + "".join(buf) + '"')
            i = j + 1 if j < n and q[j] == '"' else j
            continue
        # termo simples até operador/espaço/aspas
        j = i
        while j < n and (q[j] not in '()&|!"') and (not q[j].isspace()):
            j += 1
        tokens.append(q[i:j])
        i = j
    # remove tokens vazios (p. ex., se houver múltiplos espaços)
    return [t for t in tokens if t]


def shunting_yard(tokens: List[str]) -> List[str]:
    """Converte expressão infixa -> pós-fixa (RPN), respeitando precedência."""
    out: List[str] = []
    st: List[str] = []
    for t in tokens:
        if t in _BOOL_OPS:
            while st and st[-1] in _BOOL_OPS and _BOOL_OPS[st[-1]] >= _BOOL_OPS[t]:
                out.append(st.pop())
            st.append(t)
        elif t == "(":
            st.append(t)
        elif t == ")":
            while st and st[-1] != "(":
                out.append(st.pop())
            if not st:
                logging.warning("[shunting_yard] Parêntese fechado sem correspondente.")
                continue
            st.pop()  # remove '('
        else:
            out.append(t)  # termo/frase
    while st:
        top = st.pop()
        if top in "()":
            logging.warning("[shunting_yard] Parênteses não balanceados ao final.")
            continue
        out.append(top)
    return out


def wildcard_pattern(term_raw: str) -> re.Pattern:
    """
    Converte termo com * em regex (sobre texto normalizado).
    - Usa limites de palavra apenas se NÃO houver * no início/fim.
    """
    # normalizamos o termo como normalizamos o texto
    term = normalize_for_match(term_raw)
    escaped = re.escape(term).replace(r"\*", ".*")

    prefix_bound = not term_raw.startswith("*")
    suffix_bound = not term_raw.endswith("*")

    pattern_str = ""
    if prefix_bound:
        pattern_str += r"\b"
    pattern_str += escaped
    if suffix_bound:
        pattern_str += r"\b"

    return re.compile(pattern_str, flags=re.IGNORECASE)


def phrase_pattern(quoted_raw: str) -> re.Pattern:
    """
    Frase entre aspas: busca de substring literal (sem curingas), insensível a caso/acentos.
    """
    core = quoted_raw[1:-1] if quoted_raw.startswith('"') and quoted_raw.endswith('"') else quoted_raw
    core_norm = normalize_for_match(core)
    return re.compile(re.escape(core_norm), flags=re.IGNORECASE)


def compile_boolean_predicate(query: str) -> Callable[[str], bool]:
    """
    Compila a query textual em um predicado (pnorm: str) -> bool, onde `pnorm`
    é o parágrafo previamente normalizado (normalize_for_match).

    Regras:
      - "frase exata" -> substring literal normalizada
      - termo com *   -> wildcard (.*)
      - termo sem *   -> palavra inteira (\b...\b)
      - conectores    -> !, &, |   (precedência ! > & > |)
      - parênteses    -> opcionais
    """
    q = (query or "").strip()
    if not q:
        # query vazia nunca casa nada
        return lambda _: False

    # validação leve (opcional, só loga)
    if not balanced_parentheses(q):
        logging.warning("[compile_boolean_predicate] Parênteses possivelmente desbalanceados.")

    tokens = tokenize_query(q)
    rpn = shunting_yard(tokens)

    # cache de padrões por token; evita recompilar o mesmo regex
    pat_cache: Dict[str, re.Pattern] = {}

    def make_term_pred(token: str) -> Callable[[str], bool]:
        """Constrói predicado para 'token' (termo simples ou frase entre aspas)."""
        # frase entre aspas?
        if len(token) >= 2 and token[0] == '"' and token[-1] == '"':
            if token not in pat_cache:
                pat_cache[token] = phrase_pattern(token)
            pat = pat_cache[token]
            return lambda s: bool(pat.search(s))

        # termo comum: com/sem '*'
        if token not in pat_cache:
            if "*" in token:
                pat_cache[token] = wildcard_pattern(token)
            else:
                norm = normalize_for_match(token)
                pat_cache[token] = re.compile(rf"\b{re.escape(norm)}\b", flags=re.IGNORECASE)
        pat = pat_cache[token]
        return lambda s: bool(pat.search(s))

    # monta a função via RPN
    stack: List[Callable[[str], bool]] = []
    for t in rpn:
        if t in _BOOL_OPS:
            try:
                if t == "!":
                    a = stack.pop()
                    stack.append(lambda s, a=a: not a(s))
                elif t == "&":
                    b, a = stack.pop(), stack.pop()
                    stack.append(lambda s, a=a, b=b: a(s) and b(s))
                elif t == "|":
                    b, a = stack.pop(), stack.pop()
                    stack.append(lambda s, a=a, b=b: a(s) or b(s))
            except IndexError:
                logging.error("[compile_boolean_predicate] Expressão booleana inválida (operandos insuficientes).")
                # retorna predicado que falha sempre para não quebrar o fluxo
                return lambda _: False
        else:
            stack.append(make_term_pred(t))

    if not stack:
        # Query só com operadores ou vazia
        return lambda _: False

    return stack[-1]


# ----------------------------- PRÉ-FILTRO BARATO POR SUBSTRING --------------------------------
def _has_or(tokens: List[str]) -> bool:
    """Retorna True se a expressão possui operador OR (|)."""
    return "|" in tokens


def _extract_conj_literals_for_prefilter(tokens: List[str]) -> Tuple[List[str], List[str]]:
    """
    Extrai literais para pré-filtro quando a expressão é CONJUNÇÃO pura (sem OR).
    Retorna (must_have, must_not), já normalizados (sem acentos, minúsculos).

    Regras:
      - Inclui frases entre aspas e termos simples SEM '*'.
      - Ignora termos com curinga.
      - Considera negação unária '!' no token imediatamente seguinte.
    """
    must_have: List[str] = []
    must_not: List[str] = []

    negate_next = False
    for t in tokens:
        if t == "!":
            negate_next = True
            continue
        if t in ("&", "(", ")"):
            continue
        if t == "|":
            # segurança extra — não usar prefilter se houver OR
            return [], []

        # t é termo/frase; ignorar se tem curinga
        is_phrase = (len(t) >= 2 and t[0] == '"' and t[-1] == '"')
        core = t[1:-1] if is_phrase else t

        if "*" in core:
            negate_next = False
            continue

        lit = normalize_for_match(core)

        if negate_next:
            must_not.append(lit)
        else:
            must_have.append(lit)
        negate_next = False

    return must_have, must_not


def compile_prefilter(query: str) -> Optional[Callable[[str], bool]]:
    """
    Compila um pré-filtro barato (checks de substring) OU retorna None se não for seguro aplicar.
    Só ativa para CONJUNÇÃO pura (sem OR) e sem curingas nos literais pré-filtrados.
    """
    q = (query or "").strip()
    if not q:
        return None

    tokens = tokenize_query(q)
    if _has_or(tokens):
        return None  # desliga quando há OR

    must_have, must_not = _extract_conj_literals_for_prefilter(tokens)
    if not must_have and not must_not:
        return None

    def _prefilter(pnorm: str) -> bool:
        # todos obrigatórios presentes
        for lit in must_have:
            if lit not in pnorm:
                return False
        # nenhum proibido presente
        for lit in must_not:
            if lit in pnorm:
                return False
        return True

    return _prefilter


# =============================================================================================
# 6) Buscas por tipo de conteúdo (MD/Excel)
# =============================================================================================
def process_found_paragraph(paragraph: str, search_term: str) -> str:
    """
    Reestrutura parágrafos que usam '|' como agregador:
      - Se houver 2+ ocorrências de '|': mantém o primeiro "cabeçalho" e
        adiciona apenas subtrechos que contenham o termo de busca (normalizado).
      - Caso contrário, retorna o parágrafo original.

    Obs.: mantém acentuação/caixa do texto original (apenas a checagem é normalizada).
    """
    if not search_term:
        return paragraph

    needle = normalize_for_match(search_term)

    if paragraph.count("|") >= 2:
        parts = paragraph.split("|")
        if not parts:
            return paragraph

        rebuilt: List[str] = [parts[0].strip()]
        for sub in parts[1:]:
            s = sub.strip()
            if needle in normalize_for_match(s):
                rebuilt.append(s)

        # se nenhum subtrecho relevante foi encontrado, descarta o parágrafo
        if len(rebuilt) == 1:
            return ""

        result = " ".join(rebuilt)
        return result.replace("|", "").replace("\\", "").replace("\n", "").strip()

    return paragraph


def search_md_content(content: str, query: str) -> List[Dict[str, Any]]:
    """
    Aplica a busca booleana em conteúdo de texto/markdown.
    Retorna dicionários simples para posterior montagem de SearchResult.
    """
    if not content or not query:
        return []

    # 1 parágrafo = 1 linha não vazia
    paragraphs: List[str] = [p.strip() for p in content.split("\n") if p.strip()]

    pred = compile_boolean_predicate(query)
    pre = compile_prefilter(query)  # pré-filtro barato (pode ser None)

    results: List[Dict[str, Any]] = []

    for idx, paragraph in enumerate(paragraphs, start=1):
        pnorm = normalize_for_match(paragraph)

        # 1) pré-filtro barato (quando aplicável)
        if pre is not None and not pre(pnorm):
            continue

        # 2) predicado completo (regex/curingas/aspas/conectores)
        if pred(pnorm):
            processed = process_found_paragraph(paragraph, query)
            if processed and processed.strip():
                results.append({"paragraph_text": processed, "paragraph_number": idx})
        if len(results) >= MAX_OVERALL_SEARCH_RESULTS:
            break

    return results


def search_excel_rows(rows: List[Dict[str, Any]], query: str) -> List[Dict[str, Any]]:
    """
    Aplica a busca booleana em linhas de Excel (primeira coluna textual é a "principal").
    Retorna dicionários simples para posterior montagem de SearchResult.
    """
    if not rows or not query:
        return []

    # normaliza chaves (defensivo – já normalizamos em read_excel_first_sheet)
    rows = [{k.lower(): v for k, v in row.items()} for row in rows]

    # primeira coluna de dados (ordem preservada pelo pandas; se vazio, aborta)
    first_row = rows[0]
    if not first_row:
        return []

    texto_key = list(first_row.keys())[0]  # "primeira coluna"
    pred = compile_boolean_predicate(query)
    pre = compile_prefilter(query)  # pré-filtro barato (pode ser None)

    results: List[Dict[str, Any]] = []

    for row in rows:
        paragraph = str(row.get(texto_key, ""))
        pnorm = normalize_for_match(paragraph)

        # 1) pré-filtro barato (quando aplicável)
        if pre is not None and not pre(pnorm):
            continue

        # 2) predicado completo
        if pred(pnorm):
            processed = process_found_paragraph(paragraph, query)
            if processed and processed.strip():
                number = row.get("paragraph_number")
                results.append({
                    "paragraph_text": processed,
                    "paragraph_number": int(number) if str(number).isdigit() else None,
                    "metadata": row
                })
        if len(results) >= MAX_OVERALL_SEARCH_RESULTS:
            break

    return results


# =============================================================================================
# 7) Façade pública — função principal
# =============================================================================================
def lexical_search_in_files(search_term: str, source: List[str], file_type: str) -> List[Dict[str, Any]]:
    """
    Busca léxica em múltiplos arquivos (MD/TXT ou XLSX) pertencentes a um conjunto de 'books'.

    Parâmetros:
    - search_term: string de consulta com operadores (!, &, |), curingas (*) e frases entre aspas.
    - source: lista com nomes de "books" (sem extensão). Ex.: ["DAC","LO","EC"].
    - file_type: um entre {"md","txt","xlsx"} indicando o tipo de arquivo a usar.

    Retorno:
    - Lista de dicionários compatível com o restante do pipeline (source, text, number, score, metadata).
    """
    if not source:
        raise ValueError("Parâmetro 'source' está vazio.")

    if file_type.lower() not in {"md", "txt", "xlsx"}:
        raise ValueError("Parâmetro 'file_type' deve ser 'md', 'txt' ou 'xlsx'.")

    # Mapeia todos os arquivos disponíveis do tipo pedido
    files = list_files(FILES_SEARCH_DIR, file_type.lower())

    # Constrói mapa {BOOKNAME_UPPER: Path}
    file_map: Dict[str, Path] = {p.stem.upper(): p for p in files}

    # Seleciona os pedidos
    missing: List[str] = []
    selected: List[Path] = []
    for book in source:
        k = (book or "").upper()
        if k in file_map:
            selected.append(file_map[k])
        else:
            missing.append(book)

    if missing:
        logging.warning(f"[lexical_search_in_files] Arquivos não encontrados: {', '.join(missing)}")

    if not selected:
        raise ValueError("Nenhum arquivo correspondente encontrado para os 'source' informados.")

    # Executa por arquivo
    results: List[SearchResult] = []

    for path in selected:
        book = path.stem
        try:
            if file_type.lower() in {"md", "txt"}:
                text = read_text_file(path)
                matches = search_md_content(text, search_term)
                for m in matches:
                    results.append(SearchResult(
                        source=book,
                        text=m.get("paragraph_text", ""),
                        number=m.get("paragraph_number"),
                        score=0.0,
                        metadata=None
                    ))

            elif file_type.lower() == "xlsx":
                rows = read_excel_first_sheet(path)
                matches = search_excel_rows(rows, search_term)
                for m in matches:
                    results.append(SearchResult(
                        source=book,
                        text=m.get("paragraph_text", ""),
                        number=m.get("paragraph_number"),
                        score=0.0,
                        metadata=m.get("metadata")
                    ))

        except Exception as e:
            logging.error(f"[lexical_search_in_files] Erro ao processar {path.name}: {e}", exc_info=True)

    # Limita resultados globais e devolve no formato esperado (dict)
    results = clamp_max_results(results, MAX_OVERALL_SEARCH_RESULTS)
    return [asdict(r) for r in results]


# =============================================================================================
# Notas de manutenção
# ---------------------------------------------------------------------------------------------
# - O pré-filtro barato acelera muito coleções grandes sem comprometer a correção,
#   pois só ativa em CONJUNÇÃO pura (sem OR) e sem curingas nos literais.
# - Para aspas simples como frase exata, duplique a lógica de phrase_pattern para "'…'".
# - Para destacar trechos no `text` (HTML), devolva offsets do regex ao invés de apenas True/False.
# - Se quiser pré-filtros mais sofisticados (com OR), é possível analisar a árvore booleana e
#   construir conjuntos "pelo menos um" para cada cláusula — fica mais complexo, mas viável.
# =============================================================================================
