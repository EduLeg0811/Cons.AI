// script_semantical.js


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
        downloadPDF.addEventListener('click', () =>
        downloadResults('pdf', lastResults)
        );
    }
    if (downloadDocx) {
        downloadDocx.addEventListener('click', () =>
        downloadResults('docx', lastResults)
        );
    }
    
     // Initialize download buttons as hidden
    if (downloadButtons) {
        downloadButtons.style.display = 'none';
    }
    // ————————————————————————————————————————————————

    searchButton.addEventListener('click', verbetopedia);
    searchInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') verbetopedia();
    });
    


// ====================== Functions ======================

    async function verbetopedia() {
        const term = searchInput.value.trim();
        
        if (!term) {
            resultsDiv.innerHTML = '<p class="error">Please enter a search term or paragraph</p>';
            if (downloadButtons) downloadButtons.style.display = 'none';
            return;
        }

        // Clear container at start
        resultsDiv.innerHTML = '';
        
        try {

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
                vector_store_id: "OPENAI_ID_ALLWV",
                instructions: [
                  "Você é um assistente especialista em Conscienciologia, que responde perguntas baseadas em documentos.",
                  "Sua função é a seguinte:",
                  "1) Receber um TEXTO DE ENTRADA;",
                  "2) Entender seu significado na Conscienciologia;",
                  "3) Formular um parágrafo breve e objetivo explicando o que é o termo ou texto de entrada;",
                  "4) Este parágrafo vai servir de entrada para a busca semantica em Vector Store;",
                  "5) Apresente a resposta apenas com esse parágrafo sintético, sem repetições ou preâmbulos desnecessários."
                ].join("\n"),
                use_session: true,
                chat_id                     // <<< NOVO
              };
              
            const responseDef = await fetch(apiBaseUrl + '/ragbot', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(paramRAGbot)
            });
            const defJson = await responseDef.json();
            if (defJson.chat_id) localStorage.setItem('cons_chat_id', defJson.chat_id);   // <<< NOVO

            newTerm = defJson.text;

            const formattedDef = formatBotResponse(defJson);
            console.log(`| Function: verbetopedia | Formatted RAGBot data:`, formattedDef); 
            removeLoading(resultsDiv);
            displayResults(resultsDiv, {text: "Synthesis"}, 'title');
            displayResults(resultsDiv, formattedDef, 'simple');

            
                
            // _________________________________________________________________________________
            // Semantical Search
            // _________________________________________________________________________________
            insertLoading(resultsDiv, "Searching for suggested verbetes (semantical similarities)");

            paramSemantical = {
                term: newTerm,
                book: "LO",
                top_k: 50,
                temperature: 0.0
            }

            const responseSem = await fetch(apiBaseUrl + '/semantical_search', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(paramSemantical) 
            });
            const semJson = await responseSem.json();

            if (!responseSem.ok) {
                console.error('SemanticalSearch HTTP error:', responseSem.status, semJson);
                removeLoading(resultsDiv);
                resultsDiv.insertAdjacentHTML('afterbegin',
                `<div class="error">Falha na busca semântica (HTTP ${responseSem.status}).</div>`);
                if (downloadButtons) downloadButtons.style.display = 'none';
                return;
            }
            
            if (!semJson || !Array.isArray(semJson.results)) {
                console.error('SemanticalSearch payload inesperado:', semJson);
                removeLoading(resultsDiv);
                resultsDiv.insertAdjacentHTML('afterbegin',
                `<div class="error">Resposta inesperada da busca semântica.</div>`);
                if (downloadButtons) downloadButtons.style.display = 'none';
                return;
            }
            
            if (semJson.results.length === 0) {
                console.warn('Verbetopedia: nenhum resultado para:', newTerm);
                removeLoading(resultsDiv);
                displayResults(resultsDiv, { text: "Suggested Verbetes" }, 'title');
                resultsDiv.insertAdjacentHTML('beforeend', `
                <div class="empty-state">
                    <p><strong>Nenhum verbete sugerido</strong> para: <em>${newTerm}</em>.</p>
                    <p>Tente ajustar o texto de entrada ou ampliar o contexto.</p>
                </div>`);
                if (downloadButtons) downloadButtons.style.display = 'none';
                return;
            }
            
            console.table(semJson.results, ['source', 'paragraph_number', 'score', 'text']);
            const formattedSem = { results: semJson.results };
            
            removeLoading(resultsDiv);
            displayResults(resultsDiv, { text: "Suggested Verbetes" }, 'title');
            displayResults(resultsDiv, formattedSem, "semantical");
            
            lastResults = semJson;
            if (downloadButtons) downloadButtons.style.display = 'block';
  

        } catch (error) {
            console.error('Search error:', error);
            resultsDiv.innerHTML = `<div class="error"><p>${error.message || 'Error occurred'}</p></div>`;
            downloadButtons.style.display = 'none';
        }

    }

});

