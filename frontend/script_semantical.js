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

    // Reset LLM data
    resetLLM();

    //______________________________________________________________________________________________
    // Semantical Search
    //______________________________________________________________________________________________
    async function semantical_search() {

        

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
           
            
            // Livros selecionados do módulo Semantical
            const settings = getSemanticalSettings();
            const books = settings.books || [];
            console.log("<<<script_semantical.js - semantical*** [books]:", books); 
            // → ["EC", "DAC"]
            
            // If no books selected, select LO by default
            const source = books.length > 0 ? books : ['LO'];

            console.log("<<<script_semantical.js - semantical*** [source]:", source); 

            // Clear previous results
            resultsDiv.innerHTML = '';

           
            // _________________________________________________________________________________
            // Descritivos - RAGbot
            // _________________________________________________________________________________

            insertLoading(resultsDiv, "Definindo neologismos...");

            

            //call_ragbot
            //*****************************************************************************************
            // 
            
            const paramRAGbot = {
                query: term,
                model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
                temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
                vector_store_id: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT), 
                instructions: SEMANTICAL_DESCRIPTION,
            };
            
            const descJson = await call_llm(paramRAGbot);
          
            //*****************************************************************************************

            descJson.ref = "Descritivos"

            // Display results
            // ================
            removeLoading(resultsDiv);
            //displayResults(resultsDiv, "Synthesis", 'title');
            displayResults(resultsDiv, descJson, 'simple');

            // If the synthesis is empty, we don't proceed to semantic search
            if (!descJson?.text) {
                removeLoading(resultsDiv);
                console.error('Neologism definition error:');
                return;
            }

            // Assemble new term from synthesis
            const newTerm = term + ": " + descJson?.text.trim().toLowerCase() + ".";

            // _________________________________________________________________________________
            // Semantical Search
            // _________________________________________________________________________________

            insertLoading(resultsDiv, "Buscando semelhanças semânticas...");

            
            //call_semantical
            //*****************************************************************************************
             const paramSem = {
                term: newTerm,
                source: source,
                model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
            };
            
            const semJson = await call_semantical(paramSem);

            //*****************************************************************************************
                
            // Get max results from input or use default
            const rawMaxResults = document.getElementById("maxResults")?.value ?? getMaxResultsCap();
            const maxResults = normalizeMaxResults(rawMaxResults);
            
           
            // Restrict display to first maxResults PER SOURCE (NEW)
            if (semJson.results && Array.isArray(semJson.results)) {
                semJson.results = limitResultsPerSource(semJson.results, maxResults);
            } else {
                semJson.results = [];
            }

            console.log("<<<script_semantical.js - semantical*** [semJson]:", semJson); 

            // Display results
            const newTitle = `Semantical Search    ●    ${term}`;
            removeLoading(resultsDiv);
            //displayResults(resultsDiv, newTitle, 'title');
            displayResults(resultsDiv, semJson, "semantical");



            // =======================================================================================
            // Assemble Download Data
            // =======================================================================================
            // Extrair as fontes únicas
            let uniqueSources = semJson.results.map(result => result.source);
            uniqueSources = [...new Set(uniqueSources)];

            //const groupResults = document.getElementById('groupResults').checked || false;
            const groupResults = false;

            const downloadData = {
                search_term: term,
                search_type: 'semantical',
                source_array: uniqueSources,
                max_results: maxResults,
                display_option: 'simple',
                group_results_by_book: groupResults,
                definologia: null,
                descritivo: {
                    text: descJson.text, 
                    citations: descJson.citations, 
                    model: descJson.model, 
                    temperature: descJson.temperature, 
                    tokens: descJson.total_tokens_used
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

