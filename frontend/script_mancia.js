document.addEventListener('DOMContentLoaded', () => {
    const searchButton = document.getElementById('pensataButton');
    const resultsDiv = document.getElementById('results');

    // If this page doesn't have the expected elements, do nothing
    if (!searchButton || !resultsDiv) {
        console.warn('[mancia] searchButton or results not found on this page. Skipping init.');
        return;
    }

    console.log('[mancia] init: binding click');
    searchButton.addEventListener('click', mancia);

    // Garante que nunca dispare submit se for parar dentro de <form>
    searchButton.setAttribute('type', 'button');

    async function mancia() {

        //Clear conatiner at first
        resultsDiv.innerHTML = '';
        
        try {

            // _________________________________________________________________________________
            // 1. Random Pensata
            // _________________________________________________________________________________           
            insertLoading(resultsDiv, "Selecting a random Pensata...");

            const paramPensata = {
                term: "none", 
                book: "LO" 
            }
            
            const pensataResp = await fetch(apiBaseUrl + '/random_pensata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paramPensata)
              });        
            const data = await pensataResp.json();

            pensataText = data.text;
            pensataParagraphNumber = data.paragraph_number;
          
            removeLoading(resultsDiv);
            displayResults(resultsDiv, {text: "Pensata"}, 'title');
            displayResults(resultsDiv, data, 'simple');
            


            // _________________________________________________________________________________
            // 2. Commentary   
            // _________________________________________________________________________________            
            insertLoading(resultsDiv, "Waiting for The Oracle");
            
            const chat_id = getOrCreateChatId();

            const paramRAGbot = {
                query: "FRASE: " + pensataText,
                model: MODEL_LLM,
                temperature: TEMPERATURE,
                top_k: TOP_K,
                vector_store_names: "ALLWV",
                instructions: [
                  "Você é um assistente especialista em Conscienciologia, que responde perguntas baseadas em documentos.",
                  "A frase apresentada é uma pensata do livro Léxico de Ortopensatas, do autor Waldo Vieira.",
                  "Comente a frase de forma direta e objetiva, com base na Conscienciologia.",
                  "Se possível, dê exemplos.",
                  "Quando pertinente, organize as informações em forma de listagens numeradas.",
                  "Utilize marcação Markdown para formatar a resposta, a fim de realçar as partes mais relevantes."
                ].join("\n"),
                use_session: true,
                chat_id                     // <<< NOVO
              };
              

            const commentaryResp = await fetch(apiBaseUrl + '/ragbot', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(paramRAGbot)
            });
            const commentaryData = await commentaryResp.json();
            if (commentaryData.chat_id) localStorage.setItem('cons_chat_id', commentaryData.chat_id); // <<< NOVO

            const formattedData = formatBotResponse(commentaryData);

            console.log(">>> Commentary - Parsed JSON:", formattedData);
            console.log(">>> Commentary - Text:", formattedData.text);
            console.log(">>> Commentary - File citations:", formattedData.file_citations);
            console.log(">>> Commentary - Tokens used:", formattedData.total_tokens_used);

            removeLoading(resultsDiv);
            displayResults(resultsDiv, {text: "Commentary"}, 'title');
            displayResults(resultsDiv, formattedData, 'ragbot');



        } catch (error) {
            console.error('Search error:', error);
            resultsDiv.innerHTML = `<div class="error"><p>${error.message || 'Error occurred'}</p></div>`;
        }
    }
});