let controller = null;

document.addEventListener('DOMContentLoaded', () => {
    const resultsDiv   = document.getElementById('results');
    const searchButton = document.getElementById('pensataButton');
  
    // Initialize download buttons
    window.downloadUtils.initDownloadButtons('mancia');

    searchButton.addEventListener('click', mancia);

    // Garante que nunca dispare submit se for parar dentro de <form>
    searchButton.setAttribute('type', 'button');

    // Reset LLM data
    resetLLM();

//______________________________________________________________________________________________
// Mancia
//______________________________________________________________________________________________
    async function mancia() {

       

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
            
            
            //Clear container at first
            resultsDiv.innerHTML = '';
            
            // _________________________________________________________________________________
            // 1. Random Pensata
            // _________________________________________________________________________________           
            insertLoading(resultsDiv, "Sorteando uma Pensata do LO...");

            
            
            //call_random_pensata
            //*****************************************************************************************
            const paramPensata = {
                term: "none", 
                book: "LO" 
            }
            const pensJson = await call_random_pensata(paramPensata);
            //*****************************************************************************************
        
            pensJson.ref = "Léxico de Ortopensatas, 2019"

            removeLoading(resultsDiv);
            //showTitle(resultsDiv, "Pensata Sorteada");
            showSimple(resultsDiv, pensJson);
            

            // Extrai text da resposta
            const pensataText = pensJson.text;



        // _________________________________________________________________________________
        // 2. Commentary   
        // _________________________________________________________________________________         

        insertLoading(resultsDiv, "Analisando e formulando o comentário...");
        

        //call_ragbot   
        //***************************************************************************************** 
    
        const paramRAGbot = {
            query: "Comente a seguinte Pensata: " + pensataText,
            model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
            temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
            vector_store_names: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
            instructions: COMMENTARY_INSTRUCTIONS,               
        };

         const commentaryData = await call_llm(paramRAGbot);
        if (commentaryData.chat_id) localStorage.setItem('cons_chat_id', commentaryData.chat_id); 
        
        //***************************************************************************************** 
       
                
        // Display results
        removeLoading(resultsDiv);
        //showTitle(resultsDiv, "Comentário");
        showSimple(resultsDiv, commentaryData);

        const downloadData = prepareDownloadData(pensataText, commentaryData, "Bibliomancia");

        // Update results for download (show button only when ready)
        if (window.downloadUtils && window.downloadUtils.updateResults) {
            window.downloadUtils.updateResults(downloadData, "Bibliomancia", 'mancia');
        }

    } catch (error) {
        console.error('Error in mancia:', error);
        resultsDiv.innerHTML = `<div class="error"><p>${error.message || 'An unexpected error occurred'}</p></div>`;
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

});




 // Prepare results for download
 function prepareDownloadData(pensataText, commentaryData, term) {
    // Ensure we have valid text for both items
    const pensataContent = pensataText || "";
    const commentaryContent = commentaryData?.results?.[0]?.text || "";
    
    return {
        results: [{
            text: pensataContent,
            source: "Pensata Sorteada",
            type: "mancia",
            metadata: {
                title: "Pensata Sorteada",
                content: pensataContent,
                order: 1  // Ensure this comes first
            }
        }, {
            text: commentaryContent,
            source: "Comentário",
            type: "mancia",
            metadata: {
                title: "Comentário",
                content: commentaryContent,
                order: 2  // Ensure this comes second
            }
        }],
        search_type: "mancia",
        term: term || "Pensata e Comentário"
    };
}
