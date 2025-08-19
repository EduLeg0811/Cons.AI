
let controller = null;



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



//______________________________________________________________________________________________
// Mancia
//______________________________________________________________________________________________
    async function mancia() {
    // ANTIBOUNCE: se já estiver rodando, ignora cliques/Enter repetidos
    if (searchButton.disabled) return;

    // Disable the search button and show loading state
    const originalButtonHTML = searchButton.innerHTML;
    searchButton.disabled = true;
    searchButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    searchButton.style.opacity = '0.7';
    searchButton.style.cursor = 'not-allowed';

    // Cancel any in-progress requests
    if (controller) {
        controller.abort();
    }
    
    try {
        
        // Cancela requisição anterior, se houver
        if (controller) controller.abort();
        controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 30000); // 30s
        
        
        
        
        
        
        //Clear container at first
        resultsDiv.innerHTML = '';
        
        // _________________________________________________________________________________
        // 1. Random Pensata
        // _________________________________________________________________________________           
        insertLoading(resultsDiv, "Selecting a random Pensata...");

        const paramPensata = {
        term: "none", 
        book: "LO" 
        }
        
        //call_random_pensata
        //*****************************************************************************************
        const data = await call_random_pensata(paramPensata);



        // evita variáveis globais implícitas
        const pensataText = data.text;

    
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
        
        //call_ragbot   
        //***************************************************************************************** 
        const commentaryData = await call_ragbot(paramRAGbot);

        // Save chat_id
        if (commentaryData.chat_id) localStorage.setItem('cons_chat_id', commentaryData.chat_id); // <<< NOVO

        // Formatação para displayResults
        const formattedData = formatBotResponse(commentaryData);
        removeLoading(resultsDiv);
        displayResults(resultsDiv, {text: "Commentary"}, 'title');
        displayResults(resultsDiv, formattedData, 'ragbot');



    } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = `<div class="error"><p>${error.message || 'Error occurred while loading'}</p></div>`;
    } finally {
        // Re-enable the search button and restore original state
        if (searchButton) {
        searchButton.disabled = false;
        searchButton.innerHTML = originalButtonHTML;
        searchButton.style.opacity = '1';
        searchButton.style.cursor = 'pointer';
        }
        clearTimeout(timeoutId);
        controller = null;
    }
    }

});