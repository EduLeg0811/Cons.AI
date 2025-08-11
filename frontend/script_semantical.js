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

    searchButton.addEventListener('click', semantical_search);
    searchInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') semantical_search();
    });
    
  

// ====================== Functions ======================

    /**
     * Performs a semantical search and displays the results.
     * 
     * Expected API Response Structure:
     * {
     *   "results": [
     *     {
     *       "text": "semantically related text",
     *       "source": "filename.md",
     *       "score": 0.92,                    // Semantic similarity score (0.0 to 1.0)
     *       "paragraph_number": 45           // Optional
     *     },
     *     ...
     *   ],
     *   "search_type": "semantical",
     *   "term": "search term",
     *   "book": "LO",
     *   "temperature": 0.0,
     *   "total_results": 50,
     *   "source_counts": {
     *     "LO.md": 35,
     *     "HSRP.md": 15
     *   }
     * }
     */
    async function semantical_search() {
        const term = searchInput.value.trim();

        resultsDiv.innerHTML = '';
        
        if (!term) {
            resultsDiv.innerHTML = '<p class="error">Please enter a search term</p>';
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

            const responseDef = await fetch(apiBaseUrl + '/ragbot', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(paramRAGbot)
            });    
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
                

            const responseSem = await fetch(apiBaseUrl + '/semantical_search', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    term: newTerm,
                    book: "LO",
                    top_k: 50,
                    temperature: 0.0
                }) 
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
                <p><strong>Nenhum resultado semântico encontrado</strong> para: <em>${term}</em>.</p>
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
            console.error('Search error:', error);
            resultsDiv.innerHTML = `<div class="error"><p>${error.message || 'Error occurred'}</p></div>`;
            downloadButtons.style.display = 'none';
        }
    }
    
});



