from __future__ import annotations

from pathlib import Path
from typing import Dict, List
import unicodedata

import pandas as pd


BOOKS_WV_PATH = Path(__file__).resolve().parents[2] / "files" / "Biblio" / "BooksWV.xlsx"
REQUIRED_COLUMNS = ("titulo", "sigla", "simples", "bee")

_books_cache: pd.DataFrame | None = None


def _normalize_text(value: str) -> str:
    text = str(value or "").replace("\u00a0", " ").strip()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return text.casefold()


def _normalize_sigla(value: str) -> str:
    return str(value or "").replace("\u00a0", "").strip().upper()


def _load_books_df() -> pd.DataFrame:
    global _books_cache

    if _books_cache is not None:
        return _books_cache.copy()

    if not BOOKS_WV_PATH.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {BOOKS_WV_PATH}")

    df = pd.read_excel(BOOKS_WV_PATH, engine="openpyxl")
    missing = [col for col in REQUIRED_COLUMNS if col not in df.columns]
    if missing:
        raise ValueError(f"Colunas ausentes em BooksWV.xlsx: {', '.join(missing)}")

    df = df[list(REQUIRED_COLUMNS)].copy()
    df["titulo"] = df["titulo"].fillna("").astype(str).str.replace("\u00a0", " ").str.strip()
    df["sigla"] = df["sigla"].map(_normalize_sigla)
    df["simples"] = df["simples"].fillna("").astype(str).str.strip()
    df["bee"] = df["bee"].fillna("").astype(str).str.strip()

    # Garante apenas livros válidos para exibição/seleção.
    df = df[(df["titulo"] != "") & (df["sigla"] != "")]
    _books_cache = df.reset_index(drop=True)
    return _books_cache.copy()


def get_books_wv() -> List[Dict[str, str]]:
    df = _load_books_df()
    return [{"titulo": row["titulo"], "sigla": row["sigla"]} for _, row in df.iterrows()]


def build_biblio_wv(book_title: str = "", style: str = "simples", book_sigla: str = "") -> Dict[str, str]:
    selected_title = str(book_title or "").strip()
    selected_sigla = _normalize_sigla(book_sigla)
    if not selected_title and not selected_sigla:
        raise ValueError("O nome ou a sigla do livro é obrigatório.")

    style_norm = str(style or "").strip().lower()
    if style_norm == "bee":
        style_col = "bee"
    elif style_norm == "simples":
        style_col = "simples"
    else:
        raise ValueError("Estilo inválido. Use 'simples' ou 'bee'.")

    df = _load_books_df()
    matches = df[df["sigla"] == selected_sigla] if selected_sigla else pd.DataFrame()
    if matches.empty and selected_title:
        target = _normalize_text(selected_title)
        matches = df[df["titulo"].map(_normalize_text) == target]

    if matches.empty:
        not_found = selected_sigla or selected_title
        raise ValueError(f"Livro não encontrado: {not_found}")

    row = matches.iloc[0]
    bibliography = str(row.get(style_col, "")).strip()
    if not bibliography:
        raise ValueError(f"Bibliografia '{style_col}' não encontrada para o livro selecionado.")

    return {
        "titulo": str(row["titulo"]),
        "sigla": str(row["sigla"]),
        "style": style_col,
        "bibliografia": bibliography,
    }
