// script_ragbot.js
document.addEventListener('DOMContentLoaded', () => {
    const searchButton = document.getElementById('searchButton');
    const searchInput = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('results');
    const downloadPDF = document.getElementById('downloadPDF');
    const downloadDocx = document.getElementById('downloadDocx');
    const downloadButtons = document.querySelector('.download-buttons');
    
    
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


    searchButton.addEventListener('click', ragbot);
    searchInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') ragbot();
    });



    
    async function ragbot() {
        const term = searchInput.value.trim();
        // Clear input for next insertion
        searchInput.value = '';
        try { searchInput.focus(); } catch {}
        
        resultsDiv.innerHTML = '';
        
        if (!term) {
            resultsDiv.innerHTML = '<p class="error">Please enter a term</p>';
            return;
        }
        
        // Loading
        insertLoading(resultsDiv, "Waiting for Cons.AI to respond...");
    

        try {

            const chat_id = getOrCreateChatId();

            const paramRAGbot = {
                query: term,
                model: MODEL_LLM,
                temperature: TEMPERATURE,
                top_k: TOP_K,
                vector_store_names: "ALLWV",
                instructions: [
                  "Você é um assistente especialista em Conscienciologia, que responde perguntas baseadas em documentos.",
                  "Responda de forma direta e objetiva.",
                  "Quando pertinente, organize as informações em forma de listagens numeradas.",
                  "Utilize marcação Markdown para formatar a resposta, a fim de realçar as partes mais relevantes."
                ].join("\n"),
                use_session: true,
                chat_id                    // <<< NOVO
              };
              
            
            const response = await fetch(apiBaseUrl + '/ragbot', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(paramRAGbot)
            });
            const responseData = await response.json();
            if (responseData.chat_id) localStorage.setItem('cons_chat_id', responseData.chat_id); // <<< NOVO

           
            // Transform the response to match what displayResults expects
            const formattedData = formatBotResponse(responseData);
     
            console.log(`| Function: ragbot | Formatted RAGBot data:`, formattedData);
            
            // Clear and display
            removeLoading(resultsDiv);
            displayResults(resultsDiv, {text: "Cons.AI Oracle"}, 'title');
            displayResults(resultsDiv, formattedData, "ragbot");
            
        } catch (error) {
            console.error('Search error:', error);
            resultsDiv.innerHTML = `<div class="error"><p>${error.message || 'Error occurred'}</p></div>`;
        }
    }
});