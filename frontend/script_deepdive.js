// script_deepdive.js


let controller = null;

      
// registra os listeners UMA única vez
document.addEventListener('DOMContentLoaded', () => {
  const searchButton = document.getElementById('searchButton');
  const searchInput  = document.getElementById('searchInput');
  const resultsDiv   = document.getElementById('results');
  

  
    // Initialize download buttons
    window.downloadUtils.initDownloadButtons('deepdive');

  searchButton.addEventListener('click', deepdive_search);
  searchInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') deepdive_search();
  });




    

//______________________________________________________________________________________________
// Deep Dive Search
//______________________________________________________________________________________________
async function deepdive_search() {

    // Reset LLM data
    resetLLM();

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
    searchButton.style.opacity = '0.7';
    searchButton.style.cursor = 'not-allowed';

    // Cancela requisição anterior, se houver
    if (controller) controller.abort();
    controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), 30000); // 30s



    try {

        // Prepare search    
        // =================
        const term = searchInput.value.trim();
        
        // Validação de termo — sai cedo, mas ainda passa pelo finally
        if (!term) {
            resultsDiv.innerHTML = '<p class="error">Please enter a search term</p>';
            return;
        }

        // Prepare respHistory object
        let respHistory = {
            definologia: {},
            descritivo: {},
            lexical: [],
            semantical: []
        };

        //Lê parametros iniciais
        const rawMaxResults = document.getElementById('maxResults')?.value;
        const maxResults = window.normalizeMaxResults
            ? window.normalizeMaxResults(rawMaxResults)
            : (parseInt(rawMaxResults, 10) || (window.CONFIG?.MAX_RESULTS_DISPLAY ?? MAX_RESULTS_DISPLAY));

        const selectedBooks = [];
        document.querySelectorAll('input[name="book"]:checked').forEach(checkbox => {
            selectedBooks.push(checkbox.value);
        });
        const source = selectedBooks.length > 0 ? selectedBooks : ['LO'];


        // Inicializa display
        resultsDiv.innerHTML = '';

        




        // =======================================================================================
        // 2. Definologia
        // =======================================================================================

        insertLoading(resultsDiv, "Definindo " + term);   

        const paramRAGbotDef = {
            query: 'Escreva 1 parágrafo explicando a definição de '+ term + ' no contexto da Conscienciologia. A saída deve ser fornecida no formato: O (A) X é ...',
            model: (window.CONFIG?.MODEL_RAGBOT ?? MODEL_RAGBOT),
            temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
            vector_store_id: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
            instructions: INSTRUCTIONS_RAGBOT,                 
        };
       
        const defJson = await call_llm(paramRAGbotDef);

        // Exibe definologia
        removeLoading(resultsDiv);
        defJson.ref = "Definição"
        displayResults(resultsDiv, defJson, 'simple');

        // Monta respHistory.definologia
        respHistory.definologia = {
            text: defJson.text || null,
            citations: defJson.citations || [],
            model: defJson.model,
            temperature: defJson.temperature,
            tokens: defJson.total_tokens_used
        };


        // =======================================================================================
        // 1. Descritivo
        // =======================================================================================
              
        insertLoading(resultsDiv, "Descritivos de " + term);    

        const paramRAGbotDesc = {
            query: "TEXTO DE ENTRADA: " + term + ".",
            model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
            temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
            vector_store_id: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
            instructions: SEMANTICAL_INSTRUCTIONS,         
        };
       
        const descJson = await call_llm(paramRAGbotDesc);
        
        // Monta termo expandido (Descritivos)
        newTerm = term + ': ' + descJson.text;
          
        console.log('<<< script_deepdive.js ---- descJson: ', descJson);
       
        respHistory.descritivo = {
            text: descJson.text,
            citations: descJson.citations || [],
            model: descJson.model,
            temperature: descJson.temperature,
            tokens: descJson.total_tokens_used
        };

        // Exibe descritivos
        removeLoading(resultsDiv);
        descJson.ref = "Descritivos"
        displayResults(resultsDiv, descJson, 'simple');

      


        // =======================================================================================
        // 3. Lexical
        // =======================================================================================
        insertLoading(resultsDiv, "Busca Léxica");

        // Busca lexical
        const respLexical = await call_lexical({ term, source, file_type: 'md' });

        // Restrict display to first maxResults PER SOURCE (NEW)
        if (respLexical.results && Array.isArray(respLexical.results)) {
            respLexical.results = limitResultsPerSource(respLexical.results, maxResults);
        } else {
            respLexical.results = [];
       }

        // Monta respHistory.lexical
        respHistory.lexical = Array.isArray(respLexical.results) 
            ? respLexical.results.slice(0, maxResults) 
            : [];


        // Exibe lexical
        removeLoading(resultsDiv);
        displayResults(resultsDiv, 'Lexical Search    ●    ' + term, 'title');
        displayResults(resultsDiv, respLexical, 'lexical');




        // =======================================================================================
        // 4. Semantical
        // =======================================================================================
        insertLoading(resultsDiv, "Busca Semantica");

        // Busca semantical
        const semJson = await call_semantical({
            term: newTerm,
            source,
            model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
        });

        
       // Restrict display to first maxResults PER SOURCE (NEW)
       if (semJson.results && Array.isArray(semJson.results)) {
        semJson.results = limitResultsPerSource(semJson.results, maxResults);
       } else {
            semJson.results = [];
       }


        // Monta respHistory.semantical
        respHistory.semantical = Array.isArray(semJson.results) 
            ? semJson.results.slice(0, maxResults) 
            : [];

        // Exibe semantical
        removeLoading(resultsDiv);
        displayResults(resultsDiv, `Semantical Search    ●    ${term}`, 'title');
        displayResults(resultsDiv, semJson, 'semantical');




        // =======================================================================================
        // Assemble Download Data
        // =======================================================================================

        // Extrair as fontes Ãºnicas
        let uniqueSources = respHistory.semantical.map(result => result.source);
        uniqueSources = [...new Set(uniqueSources)];

        const groupResults = document.getElementById('groupResults').checked;

        const downloadData = {
            search_term: term,
            search_type: 'deepdive',
            source_array: uniqueSources,
            max_results: maxResults,
            group_results_by_book: groupResults,
            definologia: respHistory.definologia,
            descritivo: respHistory.descritivo,
            lexical: respHistory.lexical,
            semantical: respHistory.semantical
        };

        // Update results using centralized function
        window.downloadUtils.updateResults(downloadData);

         // =======================================================================================



    } catch (error) {
        console.error('DEEPDIVE EXCEPTION:', error);
        throw error;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        searchButton.disabled = false;
        searchButton.innerHTML = originalButtonState.html;
        searchButton.style.opacity = originalButtonState.opacity;
        searchButton.style.cursor = originalButtonState.cursor;
    }
}

});



