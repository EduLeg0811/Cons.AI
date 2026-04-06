import logging
import random
import re
from pathlib import Path

from modules.lexical_search.lexical_utils import read_excel_first_sheet
from utils.config import FILES_SEARCH_DIR

logger = logging.getLogger(__name__)


#Sorteia uma frase do livro Léxico de Ortopensatas
#========================================================
def get_random_paragraph(filename: str, term: str) -> dict:
    try:
        # Convert to Path object and resolve any relative paths
        base_dir = Path(FILES_SEARCH_DIR).resolve()
        requested_path = base_dir / filename
        xlsx_path = requested_path.with_suffix('.xlsx') if requested_path.suffix else requested_path.with_suffix('.xlsx')
        md_path = requested_path.with_suffix('.md') if requested_path.suffix else requested_path.with_suffix('.md')
        file_path = xlsx_path if xlsx_path.exists() else requested_path
     
        
        if not file_path.exists():
            if md_path.exists():
                file_path = md_path
                logger.info(f"Trying with .md extension: {file_path}")

            if not file_path.exists():
                raise FileNotFoundError(f"File not found: {file_path}")

        if file_path.suffix.lower() == '.xlsx':
            rows = read_excel_first_sheet(file_path)
            valid_rows = [row for row in rows if str(row.get("text", "")).strip()]

            if not valid_rows:
                raise ValueError(f"No valid paragraphs found in file: {filename}")

            selected_row = random.choice(valid_rows)
            selected_paragraph = str(selected_row.get("text", "")).strip()
            cleaned_paragraph = re.sub(r'^\d+[\.\s]*', '', selected_paragraph).strip()

            return {
                "paragraph": cleaned_paragraph,
                "paragraph_number": selected_row.get("paragraph_number", ""),
                "total_paragraphs": len(valid_rows),
                "pagina": str(selected_row.get("pagina", "")).strip(),
                "source": file_path.name
            }

        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read().replace('\r\n', '\n')

        paragraphs = [p.strip() for p in content.split('\n') if p.strip()]

        if not paragraphs:
            raise ValueError(f"No valid paragraphs found in file: {filename}")

        total_paragraphs = len(paragraphs)
        random_index = random.randint(0, total_paragraphs - 1)
        selected_paragraph = paragraphs[random_index]
        cleaned_paragraph = re.sub(r'^\d+[\.\s]*', '', selected_paragraph).strip()

        return {
            "paragraph": cleaned_paragraph,
            "paragraph_number": random_index + 1,
            "total_paragraphs": total_paragraphs,
            "pagina": "",
            "source": file_path.name
        }

    except Exception as error:
        logger.error(f"Error in get_random_paragraph: {str(error)}")
        raise  # Re-raise the exception to be handled by the caller
       

