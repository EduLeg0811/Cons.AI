// script_search_book.js

let controller = null;

      
// registra os listeners UMA única vez
document.addEventListener('DOMContentLoaded', () => {
  const searchButton = document.getElementById('searchButton');
  const searchInput  = document.getElementById('searchInput');
  const resultsDiv   = document.getElementById('results');
  

  
    // Initialize download buttons
    window.downloadUtils.initDownloadButtons('search_book');

    searchButton.addEventListener('click', search_book);
    searchInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            search_book();
        }
    });




    

//______________________________________________________________________________________________
// Search Book
//______________________________________________________________________________________________
async function search_book() {

    

    console.log('<<< search_book >>>');

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

    // Configura timeout
    const TIMEOUT_MS = window.CONFIG?.SEARCH_TIMEOUT_MS ?? 30000;
    let timeoutId = setTimeout(() => {
        controller.abort();
        showMessage(resultsDiv, 'A pesquisa demorou demais e foi cancelada. Tente novamente.', 'error');
    }, TIMEOUT_MS);




    try {

        // =======================================================================================
        // 0. Prepare search    
        // =======================================================================================
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
            semantic: [],
        };
       
      
        // =======================================================================================
        // 1. Recupera dados gravados no modulo    
        const settings = JSON.parse(localStorage.getItem(window.STORAGE_KEY) || "{}");
        const maxResults = settings.maxResults || 10;
        const searchType = settings.searchType || [];
        const module = settings.module || 'book';
        const books = settings.books || [];
        const flag_grouping = settings.groupResults || false;

        // // Livros selecionados e tipo de pesquisa do modulo Search Book
        // let books = [];
        // let flag_grouping = false;

        // if (module === 'book') {
        //     books = settings.books || [];
        //     flag_grouping = settings.groupResults || false;
        // } else if (module === 'verb') {
        //     books = ['EC'];
        //     flag_grouping = false; 
        // } else if (module === 'ccg') {
        //     books = ['CCG'];
        //     flag_grouping = settings.groupResults || false; 
        // } else {
        //     books = [];
        // }

        // console.log('settings: ', settings);
        // console.log('module: ', module);
        // console.log ('window.STORAGE_KEY: ', window.STORAGE_KEY);
        // console.log('books: ', books);
        // console.log('searchType: ', searchType);
        // console.log('maxResults: ', maxResults);
        // console.log('flag_grouping: ', flag_grouping);

        // If no book selected or no search type selected, ask for selection
        if (books.length === 0 || searchType.length === 0) {
            showMessage(resultsDiv, 'Selecione pelo menos um livro e um tipo de busca.', 'error');
            return;
        }
        
        const source = books;
        const fullBadges = window.CONFIG ? !!window.CONFIG.FULL_BADGES : false;

       
        // Inicializa display
        resultsDiv.innerHTML = '';

        let chat_id = null;


        if (searchType.includes('lexical')) {
                
            // =======================================================================================
            // 1. Lexical
            // =======================================================================================
            insertLoading(resultsDiv, "Busca Léxica");

        

            //call_lexical
            //***************************************************
            // Sua lógica original de chamada
            const parameters = {
                term: term,
                source: source,
                maxResults: maxResults,
                flag_grouping: flag_grouping,
                fullBadges: fullBadges,
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


            removeLoading(resultsDiv);
    
        } 

        if (searchType.includes('semantic')) {
        
            // =======================================================================================
            // 2. Descritivo
            // =======================================================================================
                
            insertLoading(resultsDiv, "Descritivos: " + term);    

            const paramRAGbotDesc = {
                query: "TEXTO DE ENTRADA: " + term + ".",
                model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
                temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
                vector_store_id: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
                instructions: SEMANTIC_DESCRIPTION,
                use_session: true,
                chat_id: chat_id        
            };
        
            const descJson = await call_llm(paramRAGbotDesc);
            
            if (descJson.chat_id) chat_id = descJson.chat_id;
            
            // Monta termo expandido (Descritivos)
            const newTerm = term + ': ' + descJson.text;
            
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
            showSimple(resultsDiv, descJson);
            


            // =======================================================================================
            // 4. semantic
            // =======================================================================================
            insertLoading(resultsDiv, "Busca Semantica");

            //call_semantic
            //*************************************************
            const paramSem = {
                term: newTerm,
                source: source,
                model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
            };
            const semJson = await call_semantic(paramSem);
            //*************************************************

            
            // Restrict display to first maxResults PER SOURCE (NEW)
            if (semJson.results && Array.isArray(semJson.results)) {
                semJson.results = limitResultsPerSource(semJson.results, maxResults);
            } else {
                semJson.results = [];
            }

            // Monta respHistory.semantic (já limitado por fonte)
            respHistory.semantic = Array.isArray(semJson.results) 
                ? semJson.results 
                : [];

        }


        // =======================================================================================
        // 5 Monta e ordena os vetores de dados (lexical & semantic)
        // =======================================================================================

        // Junta os itens de lexical e semantic de cada source]
        let lexicalAndSemantic = [
            ...(searchType.includes('lexical') ? respHistory.lexical || [] : []),
            ...(searchType.includes('semantic') ? respHistory.semantic || [] : []),
        ];
        

        // flatten data
        const flattenedData = flattenDataEntries(lexicalAndSemantic);

        // Elimina duplicatas
        const uniqueData = delDuplicateItems(flattenedData);
        
        // Para cada fonte, ordena os itens por 1) score, 2) number
        // Rotina tambem elimina as duplicatas
       const sortedData = sortData(uniqueData);

        // Mostra no console os vetores ordenados
        console.log('lexicalAndSemantic: ', lexicalAndSemantic);
        console.log('sortedData: ', sortedData);

        
        // =======================================================================================
        // Display Results
        // =======================================================================================
        removeLoading(resultsDiv);
        const container = document.getElementById('results');
        showSortedData(container, sortedData, term, flag_grouping);

        console.log("<< script_search_book >>  --- sortedData FINAL", sortedData);


        // =======================================================================================
        // Assemble Download Data
        // =======================================================================================

        // Extrair as fontes únicas
        let uniqueSources = [
            ...respHistory.lexical.map(r => r.source),
            ...respHistory.semantic.map(r => r.source)
          ];
          uniqueSources = [...new Set(uniqueSources)];
          
        const downloadData = {
            search_term: term,
            search_type: searchType,
            descritivo: uniqueSources,
            max_results: maxResults,
            group_results_by_book: false,
            display_option: 'unified',
            definologia: respHistory.definologia,
            descritivo: respHistory.descritivo,
            lexical: respHistory.lexical,
            semantic: respHistory.semantic
        };

        // Update results using centralized function
        window.downloadUtils.updateResults(downloadData);



         // =======================================================================================
         // LOGS
         // =======================================================================================
         try {
          window.logEvent({
            event: 'search_book',
            module: 'book',
            value: term,
            meta: {
                search_type: searchType,
                sources: source,
                max_results: maxResults,
                grouping: flag_grouping
            }
            });
         } catch (e) {
            console.error('Failed to log search_book event:', e);
         }
         // =======================================================================================





    } catch (error) {
        console.error('SEARCH BOOK EXCEPTION:', error);
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

