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

    let btn = document.getElementById('downloadDocx');
    const downloadButtons = document.querySelector('.download-buttons');

    // Remove existing event listeners to avoid duplicates by cloning
    if (btn) {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        btn = newBtn;
        btn.addEventListener('click', handleDocxDownload);
    }

    // Normaliza lastResults (se for string JSON, faz parse)
    let normalized = lastResults;
    if (typeof lastResults === "string") {
        try {
            normalized = JSON.parse(lastResults);
        } catch (e) {
            console.error("Erro ao parsear lastResults:", e);
            normalized = null;
        }
    }
    const hasResults = lastResults != null;


    // Toggle visibility for container and/or icon button
    if (downloadButtons) {
        downloadButtons.style.display = hasResults ? 'block' : 'none';
    }
    if (btn) {
        btn.classList.toggle('hidden', !hasResults);
    }
}



/**
 * Handle DOCX download button click
 */
async function handleDocxDownload() {
   
      
    const button = this;
    const originalHtml = button?.innerHTML;
    
    if (button) {
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
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
        // After a successful (or attempted) download, hide until next search completes
        const container = document.querySelector('.download-buttons');
        if (container) {
            container.style.display = 'none';
        }
        const btn = document.getElementById('downloadDocx');
        if (btn) {
            btn.classList.add('hidden');
        }
        // Clear stored results to prevent re-show from init without new results
        lastResults = null;
    }
}

/**
 * Update results and initialize download buttons
 * @param {Object|Array} data - Search results data
 * @param {string} term - Search term
 * @param {string} searchType - Type of search
 * @returns {Object} The stored results
 */
function updateResults(data) {
    const term = data.search_term;
    const searchType = data.search_type;


    // Verificar data contém dados em lexical ou semantical, e apenas se houver dados inicializa o botão de download
    // const data = {
    //     search_term: term,
    //     search_type: 'lexical',
    //     source_array: uniqueSources,
    //     max_results: maxResults,
    //     group_results_by_book: groupResults,
    //     definologia: null,
    //     descritivo: null,
    //     lexical: responseData.results,
    //     semantical: null
    // };

   // Verificar se há resultados em lexical ou semantical antes de inicializar o botão de download
    if ((data.lexical && data.lexical.length > 0) || (data.semantical && data.semantical.length > 0)) {

        lastResults = data;
        currentSearchTerm = term;
        currentSearchType = searchType;
        initDownloadButtons(searchType, term);
        return lastResults;

    } else {
        return null;
    }

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







/**
 * Sends the processed results to the backend and triggers a download.
 * 
 * @param {'pdf'|'docx'} format - The desired download format
 * @param {Object} resultsData - The search results to download, structure varies by search type
 * @param {string} searchTerm - The original search term
 * @param {string} searchType - The type of search
 */
async function downloadResults(format, payload, searchTerm, searchType) {
  // Handle different result structures - could be direct array or object with results array
  const search_term = payload?.term || searchTerm || 'results';
  const search_type = payload?.search_type || searchType || '';
  

  console.log('********bridge.js - download*** [payload]:', payload);
  console.log('********bridge.js - download*** [search_term]:', search_term);
  console.log('********bridge.js - download*** [search_type]:', search_type);
 
  // Sanitize and trim the search term for the filename
  let safeTerm = (search_term || 'results')
    .trim()
    .replace(/[^\w\s-]/g, '')  // Remove special characters
    .replace(/\s+/g, '-')        // Replace spaces with dashes
    .toLowerCase()
    .substring(0, 50);           // Limit length

  // Get the download button and set loading state
  const button = document.querySelector(`#download${format === 'markdown' ? 'Md' : 'Docx'}`);
  const originalHtml = button?.innerHTML;
  
  if (button) {
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    button.disabled = true;
  }

  try {

    // ***************************************************************************************
    // Call Download with the search type
    // ***************************************************************************************
    const response = await call_download(format, payload);
    
    // ***************************************************************************************
        
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
