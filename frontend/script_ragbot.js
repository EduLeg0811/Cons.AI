// script_ragbot.js

let controller = null;


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



    //______________________________________________________________________________________________
    // RAGbot
    //______________________________________________________________________________________________
    async function ragbot() {

        // ANTIBOUNCE: evita cliques repetidos enquanto executa
        const btn = document.getElementById('searchButton');
        if (btn?.disabled) return;
      
        // Desabilita e mostra estado de carregamento
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        btn.style.opacity = '0.7';
        btn.style.cursor = 'not-allowed';
      
        let timeoutId = null;
        let lastResults = [];

        
        try {

          // Cancela requisição anterior, se houver
          if (controller) controller.abort();
          controller = new AbortController();
          timeoutId = setTimeout(() => controller.abort(), 30000); // 30s

          // Get the search term
          const term = searchInput.value.trim();
                     
          if (!term) {
            resultsDiv.innerHTML = '<p class="error">Please enter a term</p>';
            return; // vai cair no finally e reabilitar o botão
          }

          // Clear input for next insertion
          searchInput.value = '';
          try { searchInput.focus(); } catch {}
      
          resultsDiv.innerHTML = '';
          // Loading
          insertLoading(resultsDiv, "Waiting for Cons.AI to respond...");
      
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
            chat_id // <<< mantém sua lógica
          };
      

          //call_ragbot
          //*****************************************************************************************
          const responseData = await call_ragbot(paramRAGbot);
        
          
          // Save chat_id
          if (responseData.chat_id) localStorage.setItem('cons_chat_id', responseData.chat_id);

          // Formatação para displayResults
          const formattedData = formatBotResponse(responseData);
      
          // Render
          removeLoading(resultsDiv);
          displayResults(resultsDiv, { text: "Cons.AI Oracle" }, 'title');
          displayResults(resultsDiv, formattedData, "ragbot");
      
        } catch (error) {
          console.error('Search error:', error);
          resultsDiv.innerHTML = `<div class="error"><p>${error.message || 'Error occurred'}</p></div>`;
        } finally {
          // Reabilita SEMPRE
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
          }
          clearTimeout(timeoutId);
          controller = null;
        }
        
      }
      
});