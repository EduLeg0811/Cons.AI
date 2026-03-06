from __future__ import annotations

from pathlib import Path
import zipfile

from modules.bibliography.biblioRefVerbete import (
    SUFIXO_BIBLIO_VERBETE_BEE,
    SUFIXO_BIBLIO_VERBETE_NEW,
    SUFIXO_BIBLIO_VERBETE_SIMPLES,
    _norm,
    build_ref_verbete,
    dedupe_requested_titles,
    parse_requested_titles,
    read_xlsx_as_dicts,
)


def _col_letter(idx: int) -> str:
    out = ""
    n = idx + 1
    while n > 0:
        n, rem = divmod(n - 1, 26)
        out = chr(65 + rem) + out
    return out


def _write_minimal_xlsx(path: Path, rows: list[list[str]]) -> None:
    shared_strings: list[str] = []
    shared_map: dict[str, int] = {}

    def ss_idx(value: str) -> int:
        value = str(value)
        if value not in shared_map:
            shared_map[value] = len(shared_strings)
            shared_strings.append(value)
        return shared_map[value]

    sheet_rows_xml: list[str] = []
    for r_idx, row in enumerate(rows, start=1):
        cells_xml: list[str] = []
        for c_idx, value in enumerate(row):
            ref = f"{_col_letter(c_idx)}{r_idx}"
            index = ss_idx(value)
            cells_xml.append(f'<c r="{ref}" t="s"><v>{index}</v></c>')
        sheet_rows_xml.append(f'<row r="{r_idx}">{"".join(cells_xml)}</row>')

    shared_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        f'count="{len(shared_strings)}" uniqueCount="{len(shared_strings)}">'
        + "".join(f"<si><t>{s}</t></si>" for s in shared_strings)
        + "</sst>"
    )

    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(sheet_rows_xml)}</sheetData>'
        "</worksheet>"
    )

    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>'
        "</workbook>"
    )

    workbook_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        'Target="worksheets/sheet1.xml"/>'
        "</Relationships>"
    )

    root_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="xl/workbook.xml"/>'
        "</Relationships>"
    )

    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/sharedStrings.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        "</Types>"
    )

    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", root_rels_xml)
        zf.writestr("xl/workbook.xml", workbook_xml)
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)
        zf.writestr("xl/sharedStrings.xml", shared_xml)


def test_norm_split_and_dedupe_rules():
    assert _norm("  Ação   Evolutiva!?  ") == "acao evolutiva"

    parsed = parse_requested_titles("A, B; C\nD\r\nE")
    assert parsed == ["A", "B", "C", "D", "E"]

    deduped = dedupe_requested_titles(["Abandono ao Idoso", "abandono ao ídoso", "Outro"])
    assert deduped == ["Abandono ao Idoso", "Outro"]


def test_read_xlsx_as_dicts_with_shared_strings(tmp_path: Path):
    xlsx_path = tmp_path / "EC.xlsx"
    _write_minimal_xlsx(
        xlsx_path,
        [
            ["titulo", "numero", "ref_list", "ref_biblio"],
            ["Verbete Teste", "12", "RL", "RB"],
        ],
    )

    rows = read_xlsx_as_dicts(xlsx_path)
    assert len(rows) == 1
    assert rows[0]["titulo"] == "Verbete Teste"
    assert rows[0]["numero"] == "12"
    assert rows[0]["ref_list"] == "RL"
    assert rows[0]["ref_biblio"] == "RB"


def test_build_ref_verbete_end_to_end(tmp_path: Path):
    xlsx_path = tmp_path / "EC.xlsx"
    _write_minimal_xlsx(
        xlsx_path,
        [
            ["titulo", "numero", "data", "ref_list", "ref_biblio"],
            [
                "Abandono ao Idoso",
                "6362",
                "06.07.2023",
                "**Abandono ao Idoso**: x; n. 6362; 06.07.2023.",
                "**Nicolau**, Cida; ***Abandono ao Idoso*** (n. 6362; 06.07.2023)",
            ],
            [
                "Outro Idoso",
                "6363",
                "01.01.2020",
                "**Outro Idoso**: x; n. 6363; 01.01.2020.",
                "**Nicolau**, Cida; ***Outro Idoso*** (n. 6363; 01.01.2020)",
            ],
            [
                "Abertismo à Consciencioterapia",
                "7000",
                "07.12.2023",
                "**Abertismo à Consciencioterapia**: x; n. 7000; 07.12.2023.",
                "**Arakaki**, Kátia; ***Abertismo à Consciencioterapia*** (n. 7000; 07.12.2023)",
            ],
        ],
    )

    raw_titles = "Abandono ao Idoso, Abandono ao Ídoso; Outro Idoso\nAbertismo a Consciencioterapia\r\nInexistente"
    result = build_ref_verbete(raw_titles, style="simples", xlsx_path=xlsx_path)

    ref_list = result["ref_list"]
    assert ref_list.index("1.  **Abandono ao Idoso**") < ref_list.index("2.  **Abertismo")
    assert ref_list.index("2.  **Abertismo") < ref_list.index("3.  **Inexistente**")
    assert ref_list.index("3.  **Inexistente**") < ref_list.index("4.  **Outro Idoso**")
    assert "**Inexistente**: verbete nao encontrado." in ref_list

    ref_biblio = result["ref_biblio"]
    regular_suffix = SUFIXO_BIBLIO_VERBETE_SIMPLES.format(count=2, plural="verbetes").strip()
    new_suffix = SUFIXO_BIBLIO_VERBETE_NEW.format(count=1, plural="verbete").strip()

    assert "***Abandono ao Idoso*** (n. 6362; 06.07.2023); ***Outro Idoso*** (n. 6363; 01.01.2020)" in ref_biblio
    assert regular_suffix in ref_biblio
    assert new_suffix in ref_biblio
    assert "**Inexistente**: verbete nao encontrado." in ref_biblio


def test_build_ref_verbete_uses_bee_suffix_for_regular_entries(tmp_path: Path):
    xlsx_path = tmp_path / "EC.xlsx"
    _write_minimal_xlsx(
        xlsx_path,
        [
            ["titulo", "numero", "data", "ref_list", "ref_biblio"],
            [
                "Verbete Regular",
                "100",
                "01.01.2020",
                "**Verbete Regular**: x; n. 100; 01.01.2020.",
                "**Autor**, Nome; ***Verbete Regular*** (n. 100; 01.01.2020)",
            ],
        ],
    )

    result = build_ref_verbete("Verbete Regular", style="bee", xlsx_path=xlsx_path)
    regular_suffix = SUFIXO_BIBLIO_VERBETE_BEE.format(count=1, plural="verbete").strip()
    assert regular_suffix in result["ref_biblio"]


def test_build_ref_verbete_new_keeps_new_suffix_independent_of_style(tmp_path: Path):
    xlsx_path = tmp_path / "EC.xlsx"
    _write_minimal_xlsx(
        xlsx_path,
        [
            ["titulo", "numero", "data", "ref_list", "ref_biblio"],
            [
                "Verbete Novo",
                "101",
                "07.12.2023",
                "**Verbete Novo**: x; n. 101; 07.12.2023.",
                "**Autor**, Nome; ***Verbete Novo*** (n. 101; 07.12.2023)",
            ],
        ],
    )

    result = build_ref_verbete("Verbete Novo", style="bee", xlsx_path=xlsx_path)
    new_suffix = SUFIXO_BIBLIO_VERBETE_NEW.format(count=1, plural="verbete").strip()
    bee_suffix = SUFIXO_BIBLIO_VERBETE_BEE.format(count=1, plural="verbete").strip()
    assert new_suffix in result["ref_biblio"]
    assert bee_suffix not in result["ref_biblio"]
