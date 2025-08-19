"""
Utility functions for search operations.
"""
import logging
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)




def serialize_response(doc):
    md = getattr(doc, "metadata", {}) or {}
    # normaliza/serializa 'date' se vier datetime
    d = md.get("date")
    if hasattr(d, "isoformat"):
        d = d.isoformat()
    # score pode estar no metadata (injetado em search_operations)
    score = md.get("score")
    score = float(score) if score is not None else None

    return {
        "text": (getattr(doc, "page_content", "") or "").strip(),
        "source": md.get("source") or "",
        "paragraph_number": md.get("paragraph_number"),
        "score": score,
        # meta opcionais – só inclui se existirem
        "autor": md.get("autor"),
        "display_md": md.get("display_md"),
        "title": md.get("title"),
        "tematologia": md.get("tematologia"),
        "especialidade": md.get("especialidade"),
        "date": d,
        "link_wv": md.get("link_wv"),
        "number": md.get("number"),
    }



def format_search_response(
    results: List[Dict[str, Any]],
    search_type: str,
    term: str,
    source: str = None,
    books: List[str] = None,
    **additional_fields
) -> Dict[str, Any]:
    """
    Format a standardized search response.
    
    Args:
        results: List of search results
        search_type: Type of search ('lexical' or 'semantical')
        term: The search term that was used
        source: Source of the search (for semantical)
        books: List of books searched (for lexical)
        additional_fields: Any additional fields to include in the response
        
    Returns:
        Formatted response dictionary
    """
    response = {
        'results': results,
        'search_type': search_type,
        'term': term,
        'total_results': len(results),
        **additional_fields
    }
    
    if source is not None:
        response['source'] = source
    if books is not None:
        response['books'] = books
    
    # Log the results for debugging
    logger.info(f"Returning {len(results)} {search_type} results for term: {term}")
    for i, r in enumerate(results[:3]):  # Log first 3 results
        # conversão segura só para log
        try:
            score_val = float(r.get('score')) if r.get('score') is not None else 0.0
        except (TypeError, ValueError):
            score_val = 0.0

        logger.info(
            f"Result {i+1} source: {r.get('source')}, "
            f"score: {score_val:.4f}, "
            f"para: {r.get('paragraph_number', 'N/A')}"
        )

    
    return response





def get_search_headers(search_type: str) -> Dict[str, str]:
    """
    Get standard headers for search responses.
    
    Args:
        search_type: Type of search ('lexical' or 'semantical')
        
    Returns:
        Dict with standard response headers
    """
    return {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Api-Version': '1.0',
        'X-Search-Type': search_type
    }



def handle_search_error(error: Exception, context: str = "search") -> Tuple[Dict[str, Any], int, Dict[str, str]]:
    """
    Handle search errors consistently.
    
    Args:
        error: The exception that was raised
        context: Context for the error (e.g., 'lexical search', 'semantical search')
        
    Returns:
        Tuple of (error_response, status_code, headers)
    """
    error_type = error.__class__.__name__
    error_details = str(error)
    
    if isinstance(error, ValueError):
        status_code = 400
        error_message = f"Invalid request parameters: {error_details}"
    else:
        status_code = 500
        error_message = f"An error occurred during {context}"
    
    logger.error(f"{error_message}: {error}", exc_info=True)
    
    error_response = {
        'error': error_message,
        'error_type': error_type,
        'details': error_details if status_code == 400 else 'Internal server error'
    }
    
    return error_response, status_code, get_search_headers('error')
