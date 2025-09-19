// script_semantical.js

let controller = null;

document.addEventListener('DOMContentLoaded', () => {

    const searchButton = document.getElementById('searchButton');
    const searchInput = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('results');



    // Initialize download buttons
    window.downloadUtils.initDownloadButtons('semantical');
    
    searchButton.addEventListener('click', semantical_search);
    searchInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') semantical_search();
    });

   

    //______________________________________________________________________________________________
    // Semantical Search
    //______________________________________________________________________________________________
    async function semantical_search() {

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
            
            // Validação de termo sai cedo, mas ainda passa pelo finally
            if (!term) {
                resultsDiv.innerHTML = '<p class="error">Please enter a search term</p>';
                return;
            }
            
            // Get selected books
            let selectedBooks = [];
            document.querySelectorAll('input[name="book"]:checked').forEach(checkbox => {
                selectedBooks.push(checkbox.value);
            });
            
            // If no books selected, select LO by default
            const source = selectedBooks.length > 0 ? selectedBooks : ['LO'];

            // Clear previous results
            resultsDiv.innerHTML = '';

            let newTerm = '';
            let defJson = null;   // <<< declarar fora

           
            // _________________________________________________________________________________
            // Definition - RAGbot
            // _________________________________________________________________________________

            insertLoading(resultsDiv, "Sintetizando os neologismos...");

            

            //call_ragbot
            //*****************************************************************************************
            // 
            const chat_id = getOrCreateChatId();
            
            const paramRAGbot = {
                query: "TEXTO DE ENTRADA: " + term + ".",
                model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
                temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
                vector_store_id: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT), 
                instructions: SEMANTICAL_INSTRUCTIONS,
                use_session: true,
                chat_id
            };
            
            defJson = await call_llm(paramRAGbot);
            if (defJson.chat_id) localStorage.setItem('cons_chat_id', defJson.chat_id);

            //*****************************************************************************************

            defJson.ref = "Descritivos"

            // Display results
            // ================
            removeLoading(resultsDiv);
            //displayResults(resultsDiv, "Synthesis", 'title');
            displayResults(resultsDiv, defJson, 'simple');

            // If the synthesis is empty, we don't proceed to semantic search
            newTerm = (defJson?.text || '').trim();
            if (!newTerm) {
                removeLoading(resultsDiv);
                console.error('Neologism definition error:');
                return;
            }

            // If response did not encounter any description, we don't proceed to semantic search
            if (defJson.text.includes('nenhum resultado')) {
                removeLoading(resultsDiv);
                console.error('Termo não encontrado:');
                return;
            }


            // _________________________________________________________________________________
            // Semantical Search
            // _________________________________________________________________________________

            insertLoading(resultsDiv, "Buscando semelhanças semânticas...");

            
            //call_semantical
            //*****************************************************************************************
             const paramSem = {
                term: term + ": " + newTerm + ".",
                source: source,
                model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
            };
            
            const semJson = await call_semantical(paramSem);

            //*****************************************************************************************
                
            // Get max results from input or use default
            const rawMaxResults = document.getElementById('maxResults')?.value;
        const maxResults = window.normalizeMaxResults
            ? window.normalizeMaxResults(rawMaxResults)
            : (parseInt(rawMaxResults, 10) || (window.CONFIG?.MAX_RESULTS_DISPLAY ?? MAX_RESULTS_DISPLAY));
            
           
       // Restrict display to first maxResults PER SOURCE (NEW)
        if (semJson.results && Array.isArray(semJson.results)) {
            semJson.results = limitResultsPerSource(semJson.results, maxResults);
        } else {
            semJson.results = [];
        }


            // Display results
            const newTitle = `Semantical Search    â—    ${term}`;
            removeLoading(resultsDiv);
            //displayResults(resultsDiv, newTitle, 'title');
            displayResults(resultsDiv, semJson, "semantical");



            // =======================================================================================
            // Assemble Download Data
            // =======================================================================================
            // Extrair as fontes Ãºnicas
            let uniqueSources = semJson.results.map(result => result.source);
            uniqueSources = [...new Set(uniqueSources)];

            const groupResults = document.getElementById('groupResults').checked;

            const downloadData = {
                search_term: term,
                search_type: 'semantical',
                source_array: uniqueSources,
                max_results: maxResults,
                group_results_by_book: groupResults,
                definologia: null,
                descritivo: {
                    text: defJson.text, 
                    citations: defJson.citations, 
                    model: defJson.model, 
                    temperature: defJson.temperature, 
                    tokens: defJson.total_tokens_used
                },
                lexical: null,
                semantical: semJson.results
            };

            // Update results using centralized function
            window.downloadUtils.updateResults(downloadData);

            // =======================================================================================


        } catch (error) {
            console.error('Search error:', error);
            resultsDiv.innerHTML = `<div class="error"><p>${error.name === 'AbortError' ? 'Request timed out' : error.message || 'Error occurred during search'}</p></div>`;
        } finally {
            // Always restore button state
            if (searchButton) {
                searchButton.disabled = false;
                searchButton.innerHTML = originalButtonState.html;
                searchButton.style.opacity = originalButtonState.opacity;
                searchButton.style.cursor = originalButtonState.cursor;
            }
            if (timeoutId) clearTimeout(timeoutId);
            controller = null;
        }
    }
});

