// Global variables
let lastResults = null;
let currentSearchType = '';
let currentSearchTerm = '';

/**
 * Initialize download buttons for a specific search type
 * @param {string} searchType - Type of search (lexical, semantical, verbetopedia, mancia, ragbot)
 * @param {string} searchTerm - Current search term
 */
function initDownloadButtons(searchType, searchTerm = '') {
    currentSearchType = searchType;
    currentSearchTerm = searchTerm;
    
    const downloadDocx = document.getElementById('downloadDocx');
    const downloadButtons = document.querySelector('.download-buttons');
    
    // Remove existing event listeners to avoid duplicates
    if (downloadDocx) {
        const newDownloadDocx = downloadDocx.cloneNode(true);
        downloadDocx.parentNode.replaceChild(newDownloadDocx, downloadDocx);
        newDownloadDocx.addEventListener('click', handleDocxDownload);
    }
    
    // Show/hide download buttons container based on results
    if (downloadButtons) {
        const hasResults = lastResults && 
                         ((Array.isArray(lastResults) && lastResults.length > 0) || 
                          (lastResults.results && lastResults.results.length > 0));
        downloadButtons.style.display = hasResults ? 'block' : 'none';
    }
}

/**
 * Handle DOCX download button click
 */
async function handleDocxDownload() {
    if (!lastResults || (Array.isArray(lastResults) ? lastResults.length === 0 : !lastResults.results || lastResults.results.length === 0)) {
        alert("No results to download.");
        return;
    }
    
    const button = this;
    const originalHtml = button?.innerHTML;
    
    if (button) {
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';
        button.disabled = true;
    }
    
    try {
        await downloadResults('docx', lastResults, currentSearchTerm, currentSearchType);
    } catch (error) {
        console.error('Download failed:', error);
        alert('Download failed. Please try again.');
    } finally {
        if (button) {
            button.innerHTML = originalHtml;
            button.disabled = false;
        }
    }
}

/**
 * Update results and initialize download buttons
 * @param {Object|Array} data - Search results data
 * @param {string} term - Search term
 * @param {string} searchType - Type of search
 * @returns {Object} The stored results
 */
function updateResults(data, term, searchType) {
    lastResults = data;
    currentSearchTerm = term;
    currentSearchType = searchType;
    initDownloadButtons(searchType, term);
    return lastResults;
}

// Initialize download buttons when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const downloadDocx = document.getElementById('downloadDocx');
        if (downloadDocx) {
            downloadDocx.addEventListener('click', handleDocxDownload);
        }
    });
} else {
    const downloadDocx = document.getElementById('downloadDocx');
    if (downloadDocx) {
        downloadDocx.addEventListener('click', handleDocxDownload);
    }
}

// Make functions available globally
window.downloadUtils = {
    initDownloadButtons,
    updateResults,
    downloadResults
};

//______________________________________________________________________________________________
// Store results in a consistent format for download
//______________________________________________________________________________________________
function storeResults(data, term, search_type) {
    let allResults = [];
  
    let arr = [];
    if (Array.isArray(data))               arr = data;
    else if (Array.isArray(data?.results)) arr = data.results;
    else if (data?.resultsBySource)        arr = Object.values(data.resultsBySource).flat();
  
    if (Array.isArray(arr)) {
      // Caso 1: dados já "flattened"
      allResults = arr.map(item => ({
        ...item,
        source: (typeof normSourceName === 'function')
          ? normSourceName(item.source || item.file || 'Results')
          : _normSrc(item.source || item.file || 'Results'),
        title: item.title || item.meta?.title || "Sem título",
        content: item.content || item.text || "",
        order: item.metadata?.order || 999, // Default to high number to push to end if no order specified
        ...item.meta
      }));
    } else if (arr?.resultsBySource) {
      // Caso 2: dados agrupados por fonte
      Object.entries(arr.resultsBySource).forEach(([source, items]) => {
        items.forEach(item => {
          allResults.push({
            ...item,
            source: (typeof normSourceName === 'function')
              ? normSourceName(source)
              : _normSrc(source),
            title: item.meta?.title || `Result from ${source}`,
            content: item.content || item.text || "",
            order: item.metadata?.order || 999, // Default to high number to push to end if no order specified
            ...item.meta
          });
        });
      });
    }
  
    // Sort results by order property if it exists
    allResults.sort((a, b) => (a.order || 999) - (b.order || 999));
  
    // Armazena resultados de forma padronizada
    lastResults = {
      search_type: search_type,
      term: term,
      results: allResults
    };
  
    return lastResults;
}

  
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  // mapeia letras para classes que capturam versões acentuadas
  const DIAC_MAP = {
    'a': '[aàáâãäåAÀÁÂÃÄÅ]',
    'e': '[eèéêëEÈÉÊË]',
    'i': '[iìíîïIÌÍÎÏ]',
    'o': '[oòóôõöOÒÓÔÕÖ]',
    'u': '[uùúûüUÙÚÛÜ]',
    'c': '[cçCÇ]',
    'n': '[nñNÑ]'
  };
  function toDiacriticPattern(term) {
    return term.split('').map(ch => DIAC_MAP[ch] || DIAC_MAP[ch.toLowerCase()] || escapeRegExp(ch)).join('');
  }
  
  /** Destaque semântico com acento-agnóstico; suporta termos compostos */
  function highlightTerm(html, term) {
    if (!html || !term) return html;
    const parts = term.split(/\s+/).filter(Boolean);
    if (!parts.length) return html;
  
    const alts = parts.map(p => toDiacriticPattern(p));
    const rx = new RegExp(`(${alts.join('|')})`, 'gi');
  
    return html.replace(rx, '<mark>$1</mark>');
  }
  
  
  
  
  
  function normSourceName(src) {
    if (!src) return 'Results';
    let s = String(src);
    // tira diretórios (Windows/Linux)
    s = s.split(/[\\/]/).pop();
    // tira extensão .md / .markdown (case-insensitive)
    s = s.replace(/\.(md|markdown)$/i, '');
    return s;
  }





 

//______________________________________________________________________________________________
// Download Results
//______________________________________________________________________________________________

/**
 * Sends the processed results to the backend and triggers a download.
 * 
 * @param {'pdf'|'docx'} format - The desired download format
 * @param {Object} resultsData - The search results to download, structure varies by search type:
 *   - For 'lexical' and 'ragbot':
 *     {
 *       results: Array<{
 *         source: string,      // Source document name
 *         text: string,       // Matched text content
 *         page?: number,      // Page number (if available)
 *         score?: number,      // Match score (if available)
 *         metadata?: Object    // Additional metadata
 *       }>,
 *       query: string,        // The search term
 *       type: 'lexical'|'ragbot'
 *     }
 *   
 *   - For 'mancia':
 *     {
 *       results: Array<{
 *         source: string,     // Usually 'mancia' or source name
 *         text: string,       // Commentary text
 *         metadata?: {
 *           author?: string,  // Author of the commentary
 *           date?: string,    // Date of the commentary
 *           // Additional commentary-specific metadata
 *         }
 *       }>,
 *       query: string,       // The pensata text
 *       type: 'mancia'
 *     }
 *   
 *   - For 'semantical' and 'verbetopedia':
 *     {
 *       results: Array<{
 *         source: string,     // Source identifier
 *         text: string,       // Content text
 *         score: number,      // Semantic similarity score
 *         metadata: {
 *           title?: string,   // Entry title
 *           url?: string,     // Source URL (if applicable)
 *           // Additional semantic search metadata
 *         }
 *       }>,
 *       query: string,       // The search term
 *       type: 'semantical'|'verbetopedia'
 *     }
 * @param {string} searchTerm - The original search term
 * @param {string} searchType - The type of search
 */
async function downloadResults(format, resultsData, searchTerm, searchType) {
  // Handle different result structures - could be direct array or object with results array
  const term = resultsData?.term || searchTerm || 'results';
  const type = resultsData?.search_type || searchType || '';
  const resultsArray = Array.isArray(resultsData) ? resultsData : (resultsData?.results || []);
  
  if (resultsArray.length === 0) {
    alert("No results to download.");
    return;
  }

  // Sanitize and trim the search term for the filename
  let safeTerm = (term || 'results')
    .trim()
    .replace(/[^\w\s-]/g, '')  // Remove special characters
    .replace(/\s+/g, '-')        // Replace spaces with dashes
    .toLowerCase()
    .substring(0, 50);           // Limit length

  // Get the download button and set loading state
  const button = document.querySelector(`#download${format === 'markdown' ? 'Md' : 'Docx'}`);
  const originalHtml = button?.innerHTML;
  
  if (button) {
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';
    button.disabled = true;
  }

  try {
    // Call Download with the search type
    const response = await call_download(format, resultsArray, term, type);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const blob = await response.blob();
    
    // Get filename from Content-Disposition header or generate one
    let filename = `${safeTerm}.${format}`;
    const contentDisposition = response.headers.get('Content-Disposition');
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/['"]/g, '');
      }
    }

    // Create and trigger download
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

  } catch (error) {
    console.error('Download failed:', error);
    alert(`Download failed: ${error.message}`);
  } finally {
    // Restore button state
    if (button) {
      button.innerHTML = originalHtml;
      button.disabled = false;
    }
  }
}

//   Flexibilidade: se no futuro você adicionar metadados (scores, citações), basta incluí-los no JSON que o frontend envia.

//   {
//     "format": "markdown" | "docx",
//     "term": "<termo de busca>",
//     "results": [
//       {
//         "text": "...",
//         "source": "...",
//         "paragraph_number": 5,
//         "score": 0.12,
//         "file_citations": "...",
//         "search_type": "lexical" | "semantical" | ...
//       },
//       …
//     ]
//   }

// Comportamento:
// Não chama search_in_files nem simple_search.
// Agrupa o array results por source.
// Gera o .md ou o .docx a partir desse agrupamento.
  

// ---------------- Chat ID helpers ----------------
function createUuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getOrCreateChatId() {
  let id = localStorage.getItem('cons_chat_id');
  if (!id) {
    id = createUuid();
    localStorage.setItem('cons_chat_id', id);
  }
  return id;
}

function newConversationId() {
  const id = createUuid();
  localStorage.setItem('cons_chat_id', id);
  return id;
}

// Opcional: reset no servidor + novo chat_id local, se existir o endpoint /ragbot_reset
async function resetConversation() {
  const chat_id = getOrCreateChatId();
  try {
    await fetch(apiBaseUrl + '/ragbot_reset', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id })
    });
  } catch (e) {
    console.warn('Falha ao resetar no servidor (seguindo mesmo assim):', e);
  }
  newConversationId();
  // Limpeza básica de UI se existir
  const container = document.querySelector('#results');
  if (container) container.innerHTML = '';
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
}

// Se existir um botão com este id, liga automaticamente
document.getElementById('btn-new-conv')?.addEventListener('click', resetConversation);
