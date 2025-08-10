import logging
import os
from typing import Dict, List
from utils.config import FILES_SEARCH_DIR



#______________________________________________________________________________________
# Lexical Search
#______________________________________________________________________________________
def lexical_search_in_files(search_term: str, books: List[str]) -> Dict[str, List[str]]:
    """
    Performs a case-insensitive search for a term across specified markdown files in the SOURCE_DIR directory.
    
    This function:
    1. Scans the SOURCE_DIR for markdown files that match the provided book names
    2. For each matching file, reads its content and searches for the specified term
    3. Returns a dictionary where:
       - Keys are file paths
       - Values are lists of paragraphs containing the search term
    4. Raises a ValueError if no matching files are found
    
    Parameters:
        search_term (str): The term to search for in the markdown files
        books (List[str]): List of book names to search in (without .md extension)
    
    Returns:
        Dict[str, List[str]]: A dictionary mapping file paths to lists of matching paragraphs
    
    Raises:
        ValueError: If no matching files are found in the directory
    
    Example:
        >>> lexical_search_in_files("example", ["LO", "DAC"])
        {
            "path/to/LO.md": ["This is an example paragraph.", "Another example."],
            "path/to/DAC.md": ["Yet another example here."]
        }
    """
    results = {}
    found_books = set()
    
    # Get all markdown files in the directory
    all_files = _list_markdown_files(FILES_SEARCH_DIR)
    
    # Create a mapping of base filenames (without extension) to full paths
    file_map = {os.path.splitext(os.path.basename(f))[0].upper(): f for f in all_files}
    
    # Find which requested books exist
    matching_files = []
    for book in books:
        book_upper = book.upper()
        if book_upper in file_map:
            matching_files.append(file_map[book_upper])
            found_books.add(book_upper)
    
    # Check if any books were found
    if not matching_files:
        missing_books = ", ".join(books)
        error_msg = f"No matching files found for books: {missing_books}"
        logging.error(error_msg)
        raise ValueError(error_msg)
    
    # Log any requested books that weren't found
    not_found = set(b.upper() for b in books) - found_books
    if not_found:
        logging.warning(f"Could not find files for books: {', '.join(not_found)}")
    
    # Process each matching file
    for file_path in matching_files:
        try:
            # Read file content
            content = _read_markdown_file(file_path)
            
            # Search in content
            matches = _search_in_content(content, search_term)
            if matches:  # Only add to results if there are matches
                results[file_path] = matches
                
        except Exception as e:
            logging.error(f"Error processing file {file_path}: {str(e)}")
            continue
    
    return results





#=============================================================================================
# --- Função para processar parágrafos encontrados ---

# Esta função processa um parágrafo encontrado para reestruturá-lo
# com base na presença do caractere "|" e do termo de busca.
# Se o parágrafo contiver duas ou mais ocorrências de "|":
# - O parágrafo é dividido usando "|" como separador.
# - Um novo parágrafo é construído pegando o primeiro subtrecho
#   e adicionando cada subtrecho que contenha o termo de busca original,
#   separados por um espaço.
# Se a condição não for atendida, o parágrafo original é retornado.
def process_found_paragraph(paragraph: str, search_term: str) -> str:
    """
    Processa um parágrafo encontrado para reestruturá-lo com base em "|" e no termo de busca.

    Args:
        paragraph: O parágrafo encontrado.
        search_term: O termo que foi buscado.

    Returns:
        O parágrafo reestruturado ou o parágrafo original se a condição não for atendida.
    """
    if not search_term:
        return paragraph
        
    # Converte o termo de busca para minúsculas uma única vez
    search_term_lower = search_term.lower()
    
    # Verifica se o parágrafo contém duas ou mais ocorrências de "|"
    if paragraph.count("|") >= 2:
        subtrechos = paragraph.split("|")
        if not subtrechos:
            return paragraph  # Retorna o original se a divisão resultar em lista vazia

        # Pega o primeiro subtrecho e remove espaços extras
        novo_paragrafo_partes = [subtrechos[0].strip()]

        # Verifica cada subtrecho (a partir do segundo) para a presença do termo
        for subtrecho in subtrechos[1:]:
            subtrecho_limpo = subtrecho.strip()
            # Verifica se o termo de busca está presente (ignorando capitalização)
            if search_term_lower in subtrecho_limpo.lower():
                novo_paragrafo_partes.append(subtrecho_limpo)  # Adiciona o subtrecho se contiver o termo

        # Junta as partes do novo parágrafo com espaço
        resultado = " ".join(novo_paragrafo_partes)
        resultado = resultado.replace("|", "")
        resultado = resultado.replace("\\", "")
        resultado = resultado.replace("\n", "")
        resultado = resultado.strip()   

        return resultado
    else:
        # Se não houver pelo menos dois caracteres "|", retorna o parágrafo original
        return paragraph










#=============================================================================================
def _list_markdown_files(source_dir: str = FILES_SEARCH_DIR) -> List[str]:
    """
    List all markdown files in the specified directory.
    
    Args:
        source_dir (str): Directory path to search for markdown files.
                         Defaults to SOURCE_DIR.
    
    Returns:
        List[str]: List of full file paths to all .md files in the directory.
    """
    try:
        

        md_path = os.path.abspath(source_dir)
        
        # List all markdown files
        files = [
            os.path.join(md_path, f)
            for f in os.listdir(md_path)
            if f.lower().endswith(".md")
        ]
        
        # Debug: List all files in the directory
        all_files = os.listdir(md_path)
        logging.info(f"<<<<<_list_markdown_files>>>>> All files in directory ({len(all_files)}): {all_files}")
        
        return files
        
    except Exception as e:
        logging.error(f"Error in _list_markdown_files: {str(e)}")
        raise

#=============================================================================================
def _read_markdown_file(path: str, encodings: tuple = ("utf-8", "cp1252")) -> str:
    """
    Read the contents of a markdown file, trying multiple encodings.
    
    Args:
        path (str): Path to the markdown file.
        encodings (tuple): Tuple of encodings to try when reading the file.
                         Defaults to ("utf-8", "cp1252").
    
    Returns:
        str: The content of the file as a string.
        
    Raises:
        UnicodeDecodeError: If the file cannot be decoded with any of the specified encodings.
    """
    for enc in encodings:
        try:
            with open(path, "r", encoding=enc) as f:
                return f.read()
            
        except UnicodeDecodeError:
            logging.error(f"<<<<<_read_markdown_file>>>>> Error decoding {path} with encoding {enc}")
            continue
    raise UnicodeDecodeError(f"Não foi possível decodificar {path}")

#=============================================================================================
def _search_in_content(content: str, search_term: str) -> List[str]:
    """
    Search for a term within the content and return matching paragraphs.
    
    Args:
        content: The text content to search within
        search_term: The term to search for (case-insensitive)
        
    Returns:
        List[str]: A list of processed paragraphs containing the search term
    """
    if not content or not search_term:
        return []
        
    # Split content into paragraphs (separated by single newline)
    paras = [p.strip() for p in content.split("\n") if p.strip()]
    
    # Convert search term to lowercase once for case-insensitive search
    search_term_lower = search_term.lower()

    logging.info(f"<<<<_search_in_content>>>>> Searching for {search_term_lower} in {len(paras)}  paragraphs")

    # Process and filter paragraphs
    results = []
    for paragraph in paras:
        if search_term_lower in paragraph.lower():
            processed = process_found_paragraph(paragraph, search_term)
            if processed and processed.strip():
                results.append(processed)

    return results



