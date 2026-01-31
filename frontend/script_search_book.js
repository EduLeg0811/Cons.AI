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
// Search Book (função principal com validação e lógica completa)
//______________________________________________________________________________________________
async function search_book() {
    const searchInput = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('results');
    const term = searchInput.value.trim();

    // Contar palavras e validar
    const wordCount = term.split(/\s+/).filter(word => word.length > 0).length;
    if (wordCount > 3 && !window.__skipWordCountValidation) {
        showMessageWithButtons(resultsDiv, 'Este módulo é para busca simples de palavras nos livros. Para fazer perguntas ou conversar com a IA, use os módulos ConsGPT, ConsLM ou ConsBot', 'info');
        return;
    }
    
    // Reseta flag se existir
    if (window.__skipWordCountValidation) {
        window.__skipWordCountValidation = false;
    }
    
    // Validação de termo
    if (!term) {
        resultsDiv.innerHTML = '<p class="error">Please enter a search term</p>';
        return;
    }

    // Início da lógica de busca (antiga search_book_internal)
    //console.log('<<< search_book >>>');

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
        // term já foi validado acima

        // Prepare respHistory object
        let respHistory = {
            definologia: {},
            descritivo: {},
            lexical: [],
        };
       
      
        // =======================================================================================
        // 1. Recupera dados gravados no modulo    
        const settings = JSON.parse(localStorage.getItem(window.STORAGE_KEY) || "{}");
        const maxResults = settings.maxResults || 10;
        const module = settings.module || 'book';
        const books = settings.books || [];
        const flag_grouping = settings.groupResults || false;


        // If no book selected or no search type selected, ask for selection
        if (books.length === 0) {
            showMessage(resultsDiv, 'Selecione pelo menos um livro e um tipo de busca.', 'error');
            return;
        }
        
        const source = books;
        const fullBadges = window.CONFIG ? !!window.CONFIG.FULL_BADGES : false;

       
        // Inicializa display
        resultsDiv.innerHTML = '';

        let chat_id = null;

                
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
    


        // =======================================================================================
        // 5 Monta e ordena os vetores de dados (lexical & semantic)
        // =======================================================================================

        // Junta os itens de lexical e semantic de cada source]
        let lexicalAndSemantic = [ ...(respHistory.lexical || []),
        ];
        

        // flatten data
        const flattenedData = flattenDataEntries(lexicalAndSemantic);

        // Elimina duplicatas
        const uniqueData = delDuplicateItems(flattenedData);
        
        // Para cada fonte, ordena os itens por 1) score, 2) number
        // Rotina tambem elimina as duplicatas
       const sortedData = sortData(uniqueData);

        
        // =======================================================================================
        // Display Results
        // =======================================================================================
        removeLoading(resultsDiv);
        const container = document.getElementById('results');
        showSortedData(container, sortedData, term, flag_grouping);

        //console.log("<< script_search_book >>  --- sortedData FINAL", sortedData);



        // =======================================================================================
        // Assemble Download Data
        // =======================================================================================

        // Extrair as fontes únicas
        let uniqueSources = [
            ...respHistory.lexical.map(r => r.source),
          ];
          uniqueSources = [...new Set(uniqueSources)];
          
        const downloadData = {
            search_term: term,
            source_array: uniqueSources,
            max_results: maxResults,
            group_results_by_book: false,
            display_option: 'simple',
            lexical: respHistory.lexical,
        };

        // Update results using centralized function
        window.downloadUtils.updateResults(downloadData);



         // =======================================================================================
         // LOGS
         // =======================================================================================
         try {
          // Determinar trigger (enter ou click)
          const trigger = (event && event.type === 'click') ? 'click' : 'enter';
          
          window.logEvent({
            event: 'search_performed',
            module: 'book',
            trigger: trigger,
            term: term.trim(),
            meta: {
                sources: source,
                max_results: maxResults,
                grouping: flag_grouping,
                term_length: term.trim().length
            }
            });
         } catch (e) {
            console.error('Failed to log search_performed event:', e);
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




// ______________________________________________________________________________________________
// Função personalizada para exibir mensagem com botões
// ______________________________________________________________________________________________
function showMessageWithButtons(container, message, type = 'info') {
    const classes = {
        error: 'msg-error',
        info: 'msg-info',
        success: 'msg-success'
    };
   container.innerHTML = `
    <div class="search-message ${classes[type] || ''}">
        <div>${message}</div>
        <div style="margin-top: 15px; display: flex; flex-direction: column; gap: 10px;">

            <button onclick="window.location.href='index.html'" class="search-button" style="background: #10b981; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; width: 100%;">
                Conversar com a IA
            </button>

            <button onclick="proceedWithSearch()" class="search-button" style="background: #0ea5e9; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; width: 100%;">
                Continuar com a pesquisa nos livros
            </button>
       
        </div>
    </div>
`;
}

// ______________________________________________________________________________________________
// Função global para prosseguir com a busca
// ______________________________________________________________________________________________
window.proceedWithSearch = function() {
    const searchInput = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('results');
    const term = searchInput.value.trim();
    
    // Limpa a mensagem de aviso
    resultsDiv.innerHTML = '';
    
    // Continua com a busca original (chamando search_book novamente, mas agora sem validação)
    // Para evitar loop infinito, vamos criar uma flag global
    window.__skipWordCountValidation = true;
    search_book();
};

});