import logging
import random
import re
from pathlib import Path

from utils.config import FILES_SEARCH_DIR

logger = logging.getLogger(__name__)


#Sorteia uma frase do livro Léxico de Ortopensatas
#========================================================
def get_random_paragraph(filename: str, term: str) -> dict:
    try:
        # Convert to Path object and resolve any relative paths
        base_dir = Path(FILES_SEARCH_DIR).resolve()
        file_path = base_dir / filename
        
        logger.info(f"Looking for file at: {file_path}")
        
        if not file_path.exists():
            # Try with .md extension if not present
            if not file_path.suffix and not file_path.with_suffix('.md').exists():
                file_path = file_path.with_suffix('.md')
                logger.info(f"Trying with .md extension: {file_path}")
            
            if not file_path.exists():
                raise FileNotFoundError(f"File not found: {file_path}")

        # Read file with explicit encoding and handle different line endings
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read().replace('\r\n', '\n')

        # Split into non-empty paragraphs
        paragraphs = [p.strip() for p in content.split('\n') if p.strip()]
        
        if not paragraphs:
            raise ValueError(f"No valid paragraphs found in file: {filename}")

        # Select random paragraph
        total_paragraphs = len(paragraphs)
        random_index = random.randint(0, total_paragraphs - 1)
        selected_paragraph = paragraphs[random_index]

        # Clean the paragraph (remove leading numbers if present)
        cleaned_paragraph = re.sub(r'^\d+[\.\s]*', '', selected_paragraph).strip()

        logger.info(f"Term: {term}")
        logger.info(f"Selected paragraph: {cleaned_paragraph}")
        logger.info(f"Selected paragraph number: {random_index + 1}")
        logger.info(f"Total paragraphs: {total_paragraphs}")
        logger.info(f"Filename: {file_path.name}")
 
        return {
            "paragraph": cleaned_paragraph,
            "paragraph_number": random_index + 1,
            "total_paragraphs": total_paragraphs,
            "source": file_path.name
        }

    except Exception as error:
        logger.error(f"Error in get_random_paragraph: {str(error)}")
        raise  # Re-raise the exception to be handled by the caller
       



#Analisa a Pensata
#========================================================  
def comment_pensata(pensata_text: str) -> dict: 

    try:
        

        
        llm_parameters = {
            "query": "Analise e comente o seguinte parágrafo (pensata), extraído do livro Léxico de Ortopensatas, do autor Waldo Vieira. " + pensata_text,
            "model": "gpt-4.1-nano",
            "use_session": False,
            "vector_store_id": "vs_6870595f39dc8191b364854cf46ffc74", #ALLWV
            "top_k": 50,
            "temperature": 0.7,
            "instructions": "Você é um assistente especialista em Conscienciologia, que analisa e faz comentários com base nos documentos fornecidos. Responda de forma direta e objetiva. Se possível, dê exemplos concretos. Utilize marcação markdown para formatação, realçando as partes mais relevantes.",
        }

        commentary = generate_llm_answer(**llm_parameters)

        return commentary

    except Exception as error:
        logger.error(f"Error in comment_pensata: {str(error)}")
        raise  # Re-raise the exception to be handled by the caller
