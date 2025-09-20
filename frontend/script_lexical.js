// script_lexical.js

let controller = null;
      
// registra os listeners UMA única vez
document.addEventListener('DOMContentLoaded', () => {
  const searchButton = document.getElementById('searchButton');
  const searchInput  = document.getElementById('searchInput');
  const resultsDiv   = document.getElementById('results');
  
  // Initialize download buttons
  window.downloadUtils.initDownloadButtons('lexical');

  searchButton.addEventListener('click', lexical_search);
  searchInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') lexical_search();
  });



  //______________________________________________________________________________________________
  // Lexical Search
  //______________________________________________________________________________________________
  async function lexical_search() {


    
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
        
        // Validação de termo - sai cedo, mas ainda passa pelo finally
        if (!term) {
            resultsDiv.innerHTML = '<p class="error">Please enter a search term</p>';
            return;
        }

        // Get selected books
        const selectedBooks = [];
        document.querySelectorAll('input[name="book"]:checked').forEach(checkbox => {
            selectedBooks.push(checkbox.value);
        });
        
        // If no books selected, select LO by default
        const source = selectedBooks.length > 0 ? selectedBooks : ['LO'];

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
            file_type: 'md'
        };
        const responseData = await call_lexical (parameters);
        //*****************************************************************************************
       

        // Get max results from input or use default
        const rawMaxResults = document.getElementById("maxResults")?.value ?? getMaxResultsCap();
        const maxResults = normalizeMaxResults(rawMaxResults);


       // Restrict display to first maxResults PER SOURCE (NEW)
        if (responseData.results && Array.isArray(responseData.results)) {
            responseData.results = limitResultsPerSource(responseData.results, maxResults);
        } else {
            responseData.results = [];
        }

       
        // Display results
        const newTitle = `Lexical Search    ●    ${term}`;
        removeLoading(resultsDiv);
        //displayResults(resultsDiv, newTitle, 'title');
        displayResults(resultsDiv, responseData, "lexical");


        console.log('********script_lexical.js - lexical*** [responseData]:', responseData);





        // =======================================================================================
        // Assemble Download Data
        // =======================================================================================

        // Extrair as fontes únicas
        let uniqueSources = responseData.results.map(result => result.source);
        uniqueSources = [...new Set(uniqueSources)];

        const groupResults = document.getElementById('groupResults').checked;

        const downloadData = {
            search_term: term,
            search_type: 'lexical',
            source_array: uniqueSources,
            max_results: maxResults,
            group_results_by_book: groupResults,
            definologia: null,
            descritivo: null,
            lexical: responseData.results,
            semantical: null
        };

        // Update results using centralized function
        window.downloadUtils.updateResults(downloadData);

         // =======================================================================================


        
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

