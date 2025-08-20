// script_semantical.js

let controller = null;

document.addEventListener('DOMContentLoaded', () => {

    const searchButton = document.getElementById('searchButton');
    const searchInput  = document.getElementById('searchInput');
    const resultsDiv   = document.getElementById('results');

    const downloadPDF      = document.getElementById('downloadPDF');
    const downloadDocx    = document.getElementById('downloadDocx');
    const downloadButtons = document.querySelector('.download-buttons');

    let lastResults = [];  // estado compartilhado

    // —————— listeners de download (uma única vez) ——————
    if (downloadPDF) {
        downloadPDF.addEventListener('click', () => {
            const searchTerm = searchInput.value.trim();
            downloadResults('pdf', lastResults);
        });
    }
    if (downloadDocx) {
        downloadDocx.addEventListener('click', () => {
            const searchTerm = searchInput.value.trim();
            downloadResults('docx', lastResults);
        });
    }

    // Initialize download buttons as hidden
    if (downloadButtons) {
        downloadButtons.style.display = 'none';
    }
    // ————————————————————————————————————————————————

    searchButton.addEventListener('click', () => semantical_search());
    searchInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') semantical_search();
    });

    const apiBaseUrl = resolveApiBaseUrl().base;

    //______________________________________________________________________________________________
    // Semantical Search
    //______________________________________________________________________________________________
    async function semantical_search() {
        // ANTIBOUNCE: evita que uma busca seja disparada se já estiver em andamento
        if (searchButton.disabled) return;
    
        // Disable the search button and show loading state
        const originalButtonHTML = searchButton.innerHTML;
        searchButton.disabled = true;
        searchButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';
        searchButton.style.opacity = '0.7';
        searchButton.style.cursor = 'not-allowed';
    

        // Store the original button state for re-enabling
        const originalButtonState = {
            html: originalButtonHTML,
            opacity: '1',
            cursor: 'pointer'
        };

        let timeoutId = null;

        try {

            // Cancela requisição anterior, se houver
            if (controller) controller.abort();
            controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 30000); // 30s


            // _________________________________________________________________________________
            // Prepare search
            // _________________________________________________________________________________

            // Get the search term
            const term = searchInput.value.trim();
            searchInput.value = '';
            try { searchInput.focus(); } catch {}

            
            // Get selected books
            const selectedBooks = [];
            document.querySelectorAll('input[name="book"]:checked').forEach(checkbox => {
                selectedBooks.push(checkbox.value);
            });
            
            // If no books selected, select LO by default
            const source = selectedBooks.length > 0 ? selectedBooks : ['LO'];
    
            
            // Check if the search term is empty
            if (!term) {
                resultsDiv.innerHTML = '<p class="error">Please enter a search term</p>';
                if (downloadButtons) downloadButtons.style.display = 'none';
                return;
            }

            // Clear display container at start
            resultsDiv.innerHTML = '';

            const flag_definition = false;
            let newTerm = '';

            if (flag_definition) {
                // _________________________________________________________________________________
                // Definition - RAGbot
                // _________________________________________________________________________________

                insertLoading(resultsDiv, "Formulating a synthesis or definition");

                // Parameters
                // ==========
                const chat_id = getOrCreateChatId();

                const paramRAGbot = {
                    query: "TEXTO DE ENTRADA: " + term + ".",
                    model: MODEL_LLM,
                    temperature: TEMPERATURE,
                    top_k: TOP_K,
                    vector_store_id: "OPENAI_ID_ALLWV", // mantém sua lógica
                    instructions: [
                        "Você é um assistente especialista em Conscienciologia, que responde perguntas baseadas em documentos.",
                        "Sua função é a seguinte:",
                        "1) Receber um TEXTO DE ENTRADA;",
                        "2) Entender seu significado na Conscienciologia;",
                        "3) Formular um parágrafo breve e objetivo explicando o que é o termo ou texto de entrada;",
                        "4) Este parágrafo vai servir de entrada para a busca semantica em Vector Store;",
                        "5) Apresente a resposta em um único parágrafo sintético, sem preâmbulos."
                    ].join("\n"),
                    use_session: true,
                    chat_id                     // <<< NOVO
                };

               
                //call_ragbot
                //*****************************************************************************************
                const defJson = await call_ragbot(paramRAGbot);

                // Save chat_id
                if (defJson.chat_id) localStorage.setItem('cons_chat_id', defJson.chat_id);

                // Format response output
                const formatedDef = formatBotResponse(defJson);

                // Display results
                // ================
                removeLoading(resultsDiv);
                displayResults(resultsDiv, "Synthesis", 'title');
                displayResults(resultsDiv, formatedDef, 'simple');

                // If the synthesis is empty, we don't proceed to semantic search
                newTerm = (defJson?.text || '').trim();
                if (!newTerm) {
                    insertLoading(resultsDiv, "Sem síntese suficiente para buscar semelhanças.");
                    removeLoading(resultsDiv);
                    return;
                }

            } else {
                newTerm = term;
            }




            // _________________________________________________________________________________
            // Semantical Search
            // _________________________________________________________________________________

            insertLoading(resultsDiv, "Searching for semantical similarities...");

            // Parameters
            const paramSem = {
                term: term + ": " + newTerm + ".",
                source: source,
                top_k: TOP_K,
                model: MODEL_LLM,
            };


            //call_semantical
            //*****************************************************************************************
            semJson = await call_semantical(paramSem);
                
            // título com termo + contagem (array “flattened”)
            // const titleCount =  `Semantical Search — ${term} (${Array.isArray(semJson) ? semJson.length : 0})`;
            const newTitle =  `Semantical Search    ●    ${term}`;

            removeLoading(resultsDiv);
            displayResults(resultsDiv, newTitle, 'title');
            displayResults(resultsDiv, semJson, "semantical");

            console.log(`********Script_semantical.js - semantical_search*** [semJson]:`, semJson);

            // Estado para download
            lastResults = storeResults(semJson, term, 'semantical');
            if (downloadButtons) {
                const hasResults = Array.isArray(semJson) && semJson.length > 0;
                downloadButtons.style.display = hasResults ? 'block' : 'none';
              }
        
        // _________________________________________________________________________________
        // Error handling
        // _________________________________________________________________________________
        } catch (error) {
            console.error('Error in semantical_search:', error);
            resultsDiv.innerHTML = `<div class="error"><p>${error.message || 'An unexpected error occurred'}</p></div>`;
            if (downloadButtons) downloadButtons.style.display = 'none';

        } finally {
            // Re-enable the search button and restore original state
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

}); // <-- This closes the DOMContentLoaded event listener




