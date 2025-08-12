// script_semantical.js


document.addEventListener('DOMContentLoaded', () => {
const searchButton = document.getElementById('searchButton');
const searchInput  = document.getElementById('searchInput');
const resultsDiv   = document.getElementById('results');
const downloadPDF      = document.getElementById('downloadPDF');
const downloadDocx    = document.getElementById('downloadDocx');
const downloadButtons = document.querySelector('.download-buttons');

let lastResults = [];  // estado compartilhado
let isSearching = false;
let controller = null;

// —————— download listeners ——————
if (downloadPDF) {
    downloadPDF.addEventListener('click', () => {
        const searchTerm = searchInput.value.trim();
        downloadResults('markdown', lastResults, searchTerm);
    });
}
if (downloadDocx) {
    downloadDocx.addEventListener('click', () => {
        const searchTerm = searchInput.value.trim();
        downloadResults('docx', lastResults, searchTerm);
    });
}

// Initialize download buttons as hidden
if (downloadButtons) {
    downloadButtons.style.display = 'none';
}
// ————————————————————————————————————————————————

searchButton.addEventListener('click', () => !isSearching && semantical_search());
searchInput.addEventListener('keypress', e => {
    if (e.key === 'Enter' && !isSearching) semantical_search();
});

async function semantical_search() {
    if (isSearching) return; // Prevent multiple simultaneous searches
        
    // Set searching state
    isSearching = true;
    const originalButtonHTML = searchButton.innerHTML;
        
    // Disable the search button and show loading state
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

    // Cancel any in-progress requests
    if (controller) {
        controller.abort();
    }
    controller = new AbortController();
    const timeoutId = setTimeout(() => {
        if (controller) {
            controller.abort();
            showError('Request timed out after 30 seconds');
        }
    }, 30000);

    try {
        const term = searchInput.value.trim();
        searchInput.value = '';
        try { searchInput.focus(); } catch {}
            
        resultsDiv.innerHTML = '';
            
        if (!term) {
            resultsDiv.innerHTML = '<p class="error">Please enter a search term</p>';
            if (downloadButtons) downloadButtons.style.display = 'none';
            return;
        }
        // Clear container at start
        resultsDiv.innerHTML = '';
    
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
            "5) Apresente a resposta sintética, sem repetições ou preâmbulos desnecessários."
            ].join("\n"),
            use_session: true,
            chat_id                     // <<< NOVO
        };
            

        console.log('Sending RAGbot request for term:', term);

        // Update the fetch call to use the AbortController
        const responseDef = await fetch(apiBaseUrl + '/ragbot', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(paramRAGbot),
            signal: controller.signal
        });

        // Clear the timeout
        clearTimeout(timeoutId);

        const defJson = await responseDef.json();
        if (defJson.chat_id) localStorage.setItem('cons_chat_id', defJson.chat_id);
            
        if (!responseDef.ok) {
            removeLoading(resultsDiv);
            console.error('RAGbot HTTP error:', responseDef.status, defJson);
            resultsDiv.innerHTML = '<p class="error">Falha ao gerar a síntese. Tente novamente.</p>';
            if (downloadButtons) downloadButtons.style.display = 'none';
            return;
            }
            
            const newTerm = (defJson?.text || '').trim();
            const formatedDef = formatBotResponse(defJson);
            
            console.log('<<<<<Semantical - performSearch>>>>> Definition results:', newTerm);
            removeLoading(resultsDiv);
            displayResults(resultsDiv, { text: "Synthesis" }, 'title');
            displayResults(resultsDiv, formatedDef, 'simple');
            
            // Se a síntese vier vazia, não seguimos para a busca semântica
            if (!newTerm) {
            insertLoading(resultsDiv, "Sem síntese suficiente para buscar semelhanças.");
            removeLoading(resultsDiv);
            if (downloadButtons) downloadButtons.style.display = 'none';
            return;
            }
            

            
                
            // _________________________________________________________________________________
            // Semantical Search
            // _________________________________________________________________________________
            insertLoading(resultsDiv, "Searching for semantical similarities...");
                

            try {
                const responseSem = await fetch(apiBaseUrl + '/semantical_search', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ 
                        term: newTerm,
                        book: "LO",
                        top_k: 50,
                        temperature: 0.0
                    }),
                    signal: controller.signal  // Add abort signal to second request
                });
                
                if (!responseSem.ok) {
                    throw new Error(`HTTP error! status: ${responseSem.status}`);
                }
                
                const semJson = await responseSem.json();
                clearTimeout(timeoutId);
                
                // Validação da estrutura esperada
                if (!semJson || !Array.isArray(semJson.results)) {
                    console.error('SemanticalSearch payload inesperado:', semJson);
                    removeLoading(resultsDiv);
                    resultsDiv.insertAdjacentHTML('afterbegin',
                        `<div class="error">Resposta inesperada da busca semântica.</div>`);
                    if (downloadButtons) downloadButtons.style.display = 'none';
                    return;
                }

                // Tratamento para vazio (sem assert que “quebra a UX”)
                if (semJson.results.length === 0) {
                    console.warn('SemanticalSearch: nenhum resultado para:', term);
                    removeLoading(resultsDiv);
                    displayResults(resultsDiv, { text: "Semantical Search" }, 'title');
                    resultsDiv.insertAdjacentHTML('beforeend', `
                    <div class="empty-state">
                    <p><strong>Nenhum resultado semântico encontrado para</strong>: <em>${term}</em>.</p>
                    <p>Tente variar o termo, usar sinônimos ou ampliar o contexto.</p>
                    </div>`);
                    if (downloadButtons) downloadButtons.style.display = 'none';
                    return; // encerra aqui para não tentar renderizações abaixo
                }

                // Render normal quando há resultados
                console.table(semJson.results, ['source', 'paragraph_number', 'score', 'text']);

                const formattedSem = { results: semJson.results };

                removeLoading(resultsDiv);
                displayResults(resultsDiv, { text: "Semantical Search" }, 'title');
                displayResults(resultsDiv, formattedSem, "semantical");

                // Estado para download
                lastResults = semJson;
                if (downloadButtons) {
                    downloadButtons.style.display = 'block';
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log('Search was cancelled');
                    return;
                }
                console.error('Search error:', error);
                resultsDiv.innerHTML = `<div class="error"><p>${error.message || 'Error occurred during search'}</p></div>`;
                if (downloadButtons) downloadButtons.style.display = 'none';
            }
        } catch (error) {
            console.error('Error in semantical_search:', error);
            resultsDiv.innerHTML = `<div class="error"><p>${error.message || 'An unexpected error occurred'}</p></div>`;
        } finally {
            // Re-enable the search button and restore original state
            isSearching = false;
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
