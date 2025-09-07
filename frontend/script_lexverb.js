// script_lexical.js

let controller = null;
      
// registra os listeners UMA única vez
document.addEventListener('DOMContentLoaded', () => {
  const searchButton = document.getElementById('searchButton');
  const searchInput  = document.getElementById('searchInput');
  const resultsDiv   = document.getElementById('results');
  

  searchButton.addEventListener('click', lexverb);
  searchInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') lexverb();
  });



  //______________________________________________________________________________________________
  // Lexical Search
  //______________________________________________________________________________________________
  async function lexverb() {


    
    // Save original button state for restoration
    const originalButtonState = {
      html: searchButton.innerHTML,
      opacity: searchButton.style.opacity,
      cursor: searchButton.style.cursor
    };

    // Se já estiver desabilitado, evita reentrância por clique/Enter
    if (searchButton?.disabled) return;

    // Desabilita e mostra "searching"
    searchButton.disabled = true;
    //searchButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';
    searchButton.style.opacity = '0.7';
    searchButton.style.cursor = 'not-allowed';

    

    // Cancela requisição anterior, se houver
    if (controller) controller.abort();
    controller = new AbortController();
    let timeoutId = null;
    timeoutId = setTimeout(() => controller.abort(), 30000); // 30s

    try {

        
        // Prepare search    
        // =================
        const term = searchInput.value.trim();
        
        // Validação de termo — sai cedo, mas ainda passa pelo finally
        if (!term) {
            resultsDiv.innerHTML = '<p class="error">Please enter a search term</p>';
            return;
        }

        // Get selected books
        const source = ["ECALL_DEF"];

        // Limpa resultados anteriores
        resultsDiv.innerHTML = '';

        // Loading visual
        insertLoading(resultsDiv, "Searching for: " + term);

        

        //call_lexical
        //*****************************************************************************************
       // Sua lógica original de chamada
        const parameters = {
            term: term,
            source: source,
            file_type: 'xlsx'
        };
        const responseData = await call_lexical (parameters);
        //*****************************************************************************************
       

        // Get max results from input or use default
        const maxResults = parseInt(document.getElementById('maxResults')?.value) || (window.CONFIG?.MAX_RESULTS_DISPLAY ?? MAX_RESULTS_DISPLAY);

        // Restrict display to first maxResults if results exist
        if (responseData.results && Array.isArray(responseData.results)) {
            responseData.results = responseData.results.slice(0, maxResults);
        } else {
            responseData.results = [];
        }

        // Display results
        const newTitle = `Verbetes    ●    ${term}`;
        removeLoading(resultsDiv);
        //displayResults(resultsDiv, newTitle, 'title');
        displayResults(resultsDiv, responseData, "lexverb");

        // Update results using centralized function
        window.downloadUtils.updateResults(responseData, term, 'lexverb');

        
    } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = `<div class="error"><p>${error.message || 'Error occurred during search'}</p></div>`;
    } finally {
        // Restore button state
        if (searchButton) {
            searchButton.disabled = false;
            searchButton.innerHTML = originalButtonState.html;
            searchButton.style.opacity = originalButtonState.opacity;
            searchButton.style.cursor = originalButtonState.cursor;
        }
        clearTimeout(timeoutId);
        controller = null;
    }
  }
});
