// script_deepdive.js


let controller = null;

      
// registra os listeners UMA única vez
document.addEventListener('DOMContentLoaded', () => {
  const searchButton = document.getElementById('searchButton');
  const searchInput  = document.getElementById('searchInput');
  const resultsDiv   = document.getElementById('results');
  

  
    // Initialize download buttons
    window.downloadUtils.initDownloadButtons('deepdive');

  searchButton.addEventListener('click', deepdive_search);
  searchInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') deepdive_search();
  });




    

//______________________________________________________________________________________________
// Deep Dive Search
//______________________________________________________________________________________________
async function deepdive_search() {

    // Reset LLM data
    await resetLLM();

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
    searchButton.style.opacity = '0.7';
    searchButton.style.cursor = 'not-allowed';

    // Cancela requisição anterior, se houver
    if (controller) controller.abort();
    controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), 30000); // 30s



    try {

        // Prepare search    
        // =================
        const term = searchInput.value.trim();
        
        // Validação de termo - sai cedo, mas ainda passa pelo finally
        if (!term) {
            resultsDiv.innerHTML = '<p class="error">Please enter a search term</p>';
            return;
        }

        // Prepare respHistory object
        let respHistory = {
            definologia: {},
            descritivo: {},
            lexical: [],
            semantical: [],
        };

        // Lê parâmetros iniciais
        const rawMaxResults = document.getElementById("maxResults")?.value ?? getMaxResultsCap();
        const maxResults = normalizeMaxResults(rawMaxResults);

        // Livros selecionados do módulo Deepdive
        const settings = getDeepdiveSettings();
        const books = settings.books || [];
        
        // If no books selected, select LO by default
        const source = books.length > 0 ? books : ['LO'];
        

        // FIXED SELECTED BOOKS
        // const selectedBooks = [];
        // document.querySelectorAll('input[name="book"]:checked').forEach(checkbox => {
        //     selectedBooks.push(checkbox.value);
        // });
        // const source = selectedBooks.length > 0 ? selectedBooks : ['LO'];
        // const source = ['LO','DAC','EC','CCG'];

        console.log("<<<script_deepdive.js - deepdive*** [books]:", source); 
        

        // Inicializa display
        resultsDiv.innerHTML = '';

        let chat_id = null;

        // =======================================================================================
        // 2. Definologia
        // =======================================================================================

        insertLoading(resultsDiv, "Definindo o termo: " + term);   

        const paramRAGbotDef = {
            query: term,
            model: (window.CONFIG?.MODEL_RAGBOT ?? MODEL_RAGBOT),
            temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
            vector_store_id: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
            instructions: INSTRUCTIONS_DEFINITION,                 
        };
       
        const defJson = await call_llm(paramRAGbotDef);
        
        if (defJson.chat_id) chat_id = defJson.chat_id;


        // Exibe definologia
        removeLoading(resultsDiv);
        defJson.ref = "Definição"
        displayResults(resultsDiv, defJson, 'simple');

        // Monta respHistory.definologia
        respHistory.definologia = {
            text: defJson.text || null,
            citations: defJson.citations || [],
            model: defJson.model,
            temperature: defJson.temperature,
            tokens: defJson.total_tokens_used
        };


        // =======================================================================================
        // 1. Descritivo
        // =======================================================================================
              
        insertLoading(resultsDiv, "Descritivos de " + term);    

        const paramRAGbotDesc = {
            query: "TEXTO DE ENTRADA: " + term + ".",
            model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
            temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
            vector_store_id: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
            instructions: SEMANTICAL_DESCRIPTION,
            use_session: true,
            chat_id: chat_id        
        };
       
        const descJson = await call_llm(paramRAGbotDesc);
        
        if (descJson.chat_id) chat_id = descJson.chat_id;
        
        // Monta termo expandido (Descritivos)
        newTerm = term + ': ' + descJson.text;
          
        console.log('<<< script_deepdive.js ---- descJson: ', descJson);
       
        respHistory.descritivo = {
            text: descJson.text,
            citations: descJson.citations || [],
            model: descJson.model,
            temperature: descJson.temperature,
            tokens: descJson.total_tokens_used
        };

        // Exibe descritivos
        removeLoading(resultsDiv);
        descJson.ref = "Descritivos"
        displayResults(resultsDiv, descJson, 'simple');

      

        // =======================================================================================
        // 3. Lexical
        // =======================================================================================
        insertLoading(resultsDiv, "Busca Léxica");

       

        //call_lexical
        //***************************************************
        // Sua lógica original de chamada
        const parameters = {
            term: term,
            source: source,
            file_type: 'md'
        };
        const respLexical = await call_lexical (parameters);
        //***************************************************

        // Restrict display to first maxResults PER SOURCE (NEW)
        if (respLexical.results && Array.isArray(respLexical.results)) {
            respLexical.results = limitResultsPerSource(respLexical.results, maxResults);
        } else {
            respLexical.results = [];
        }

        // Monta respHistory.lexical (já limitado por fonte)
        respHistory.lexical = Array.isArray(respLexical.results) 
            ? respLexical.results 
            : [];



 
        
        // // CASO ESPECIAL TEMPORÁRIO : EC lexical = ECALL_DEF.xlsx
        // // ------------------------------------------------------

        // if (source.includes('EC')) {
            

        //     //call_lexical (lexverb)
        //     //*****************************************************************************************
        //     const paramLexverb = {
        //         term: term,
        //         source: ["ECALL_DEF"],
        //         file_type: 'xlsx'
        //     };
        //     const respLexverb = await call_lexical (paramLexverb);
        //     //*****************************************************************************************

        //     // Get max results from input or use default
        //     const rawMaxResults = document.getElementById("maxResults")?.value ?? getMaxResultsCap();
        //     const maxResults = normalizeMaxResults(rawMaxResults);

        //     // Restrict display to first maxResults if results exist
        //     if (respLexverb.results && Array.isArray(respLexverb.results)) {
        //         respLexverb.results = respLexverb.results.slice(0, maxResults);
        //     } else {
        //         respLexverb.results = [];
        //     }

        //     // Une os resultados de respLexical e respLexverb
        //     respLexical.results = [...respLexical.results, ...respLexverb.results];

        // }

        console.log('<<< script_deepdive.js ---- respLexical: ', respLexical);

        // Exibe lexical
        removeLoading(resultsDiv);
        displayResults(resultsDiv, 'Busca Léxica    ●    ' + term, 'title');
        displayResults(resultsDiv, respLexical, 'deepdive');

        
        // Monta respHistory.lexical (já limitado por fonte)
        respHistory.lexical = Array.isArray(respLexical.results) 
        ? respLexical.results 
        : [];




        // =======================================================================================
        // 4. Semantical
        // =======================================================================================
        insertLoading(resultsDiv, "Busca Semantica");

        //call_semantical
        //*************************************************
        const paramSem = {
            term: newTerm,
            source: source,
            model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
        };
        const semJson = await call_semantical(paramSem);
        //*************************************************

        
        // Restrict display to first maxResults PER SOURCE (NEW)
        if (semJson.results && Array.isArray(semJson.results)) {
            semJson.results = limitResultsPerSource(semJson.results, maxResults);
        } else {
            semJson.results = [];
        }

        // Monta respHistory.semantical (já limitado por fonte)
        respHistory.semantical = Array.isArray(semJson.results) 
            ? semJson.results 
            : [];

        // Exibe semantical
        removeLoading(resultsDiv);
        displayResults(resultsDiv, `Busca Semântica    ●    ${term}`, 'title');
        displayResults(resultsDiv, semJson, 'deepdive');



        // =======================================================================================
        // Assemble Download Data
        // =======================================================================================

        // Extrair as fontes únicas
        let uniqueSources = respHistory.semantical.map(result => result.source);
        uniqueSources = [...new Set(uniqueSources)];

        const downloadData = {
            search_term: term,
            search_type: 'deepdive',
            source_array: uniqueSources,
            max_results: maxResults,
            group_results_by_book: false,
            display_option: 'unified',
            definologia: respHistory.definologia,
            descritivo: respHistory.descritivo,
            lexical: respHistory.lexical,
            semantical: respHistory.semantical
        };

        // Update results using centralized function
        window.downloadUtils.updateResults(downloadData);

         // =======================================================================================



    } catch (error) {
        console.error('DEEPDIVE EXCEPTION:', error);
        throw error;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        searchButton.disabled = false;
        searchButton.innerHTML = originalButtonState.html;
        searchButton.style.opacity = originalButtonState.opacity;
        searchButton.style.cursor = originalButtonState.cursor;
    }
}

});



//______________________________________________________________________________________________
// Limita resultados por fonte
//______________________________________________________________________________________________
 function limitResultsPerSource(results, maxResults) {
    const grouped = {};
    const limited = [];

    for (const item of results) {
        const src = item.source || "Unknown";
        if (!grouped[src]) grouped[src] = [];
        if (grouped[src].length < maxResults) {
            grouped[src].push(item);
            limited.push(item);
        }
    }
    return limited;
}
