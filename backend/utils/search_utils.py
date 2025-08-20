"""
Utility functions for search operations.
"""
import logging
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)





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
