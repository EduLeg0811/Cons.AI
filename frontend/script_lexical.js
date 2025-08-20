// script_lexical.js

let controller = null;

document.addEventListener('DOMContentLoaded', () => {
    const searchButton = document.getElementById('searchButton');
    const searchInput  = document.getElementById('searchInput');
    const resultsDiv   = document.getElementById('results');
    const downloadPDF   = document.getElementById('downloadPDF');
    const downloadDocx = document.getElementById('downloadDocx');
    const downloadButtons = document.querySelector('.download-buttons');

   
    let lastResults = [];
    
  // registra os listeners UMA única vez
 // In script_lexical.js, update the download button listeners
if (downloadPDF) {
  downloadPDF.addEventListener('click', () => {
    downloadResults('pdf', lastResults);
  });
}
if (downloadDocx) {
  downloadDocx.addEventListener('click', () => {
    downloadResults('docx', lastResults);
  });
}

    searchButton.addEventListener('click', lexical_search);
    searchInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') lexical_search();
    });

    // Initialize download buttons as hidden
    if (downloadButtons) {
        downloadButtons.style.display = 'none';
    }



//______________________________________________________________________________________________
// Lexical Search
//______________________________________________________________________________________________
    async function lexical_search() {
        // Elementos (mantendo seu padrão)
        const searchButton   = document.getElementById('searchButton');
        const searchInput    = document.getElementById('searchInput');
        const resultsDiv     = document.getElementById('results');
        const downloadButtons = document.querySelector('.download-buttons');
    
        // Se já estiver desabilitado, evita reentrância por clique/Enter
        if (searchButton?.disabled) return;
    
        // Desabilita e mostra "loading"
        const originalButtonHTML = searchButton.innerHTML;
        searchButton.disabled = true;
        searchButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';
        searchButton.style.opacity = '0.7';
        searchButton.style.cursor = 'not-allowed';
    
        let timeoutId = null;
    
        try {
            // Cancela requisição anterior, se houver
            if (controller) controller.abort();
            controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 30000); // 30s
        
            const term = searchInput.value.trim();
            
            // Validação de termo — sai cedo, mas ainda passa pelo finally
            if (!term) {
                resultsDiv.innerHTML = '<p class="error">Please enter a search term</p>';
                if (downloadButtons) downloadButtons.style.display = 'none';
                return; // ← safe: botão será reabilitado no finally

           
            }// Get selected books
            const selectedBooks = [];
            document.querySelectorAll('input[name="book"]:checked').forEach(checkbox => {
                selectedBooks.push(checkbox.value);
            });
            
            // If no books selected, select LO by default
            const source = selectedBooks.length > 0 ? selectedBooks : ['LO'];
    
            // Limpa resultados anteriores
            resultsDiv.innerHTML = '';
    

            // Loading visual
            insertLoading(resultsDiv, "Searching for: " + term);
    
            // Sua lógica original de chamada
            const parameters = {
                "term": term,
                "source": source
            };
    

            //call_lexical
            //*****************************************************************************************
            const responseData = await call_lexical (parameters);

            const newTitle =  `Lexical Search    ●    ${term}`;

            removeLoading(resultsDiv);
            displayResults(resultsDiv, newTitle, 'title');
            displayResults(resultsDiv, responseData, "lexical");
    
            // Estado para download
            lastResults = storeResults(responseData, term, 'lexical');
            if (downloadButtons) {
                const hasResults = !!(responseData.results && responseData.results.length > 0);
                downloadButtons.style.display = hasResults ? 'block' : 'none';
            }
    
        } catch (error) {
            console.error('Search error:', error);
            resultsDiv.innerHTML = `<div class="error"><p>${error.message || 'Error occurred during search'}</p></div>`;
            if (downloadButtons) downloadButtons.style.display = 'none';
        } finally {
            // Reabilita o botão SEMPRE (inclusive em returns antecipados)
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






// ________________________________________________________________________________________
// NOVAS FUNCOS DE FORMATAÇÃO DOS DADOS PARA O DISPLAY
// ________________________________________________________________________________________

// Helpers locais
function _normSrc(s) {
  return String(s || 'Results').split(/[\\/]/).pop().replace(/\.md$/i, '');
}
function _numOrUndef(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function _pickKnownMeta(it, fallbackSrc) {
  // Campos “conhecidos”
  const base = {
    source: it.book || it.source || it.file || fallbackSrc || 'Results',
    book: it.book,
    paragraph_number: it.paragraph_number,
    autor: it.autor,
    title: it.title,
    tematologia: it.tematologia,
    especialidade: it.especialidade,
    date: it.date,
    link_wv: it.link_wv,
    number: it.number,
    score: _numOrUndef(it.score), // pode vir ausente no lexical
  };
  // Extras dinâmicos: copia chaves que não são conteúdo principal
  const skip = new Set([
    'text','display_md','source','file','paragraph_number','score',
    'autor','title','tematologia','especialidade','date','link_wv','number'
  ]);
  for (const k in it) {
    if (!skip.has(k) && Object.prototype.hasOwnProperty.call(it, k)) {
      const val = it[k];
      // Copia somente tipos seriais simples (evita objetos aninhados pesados)
      if (val == null) continue;
      if (['string','number','boolean'].includes(typeof val)) base[k] = val;
    }
  }
  return base;
}

// ________________________________________________________________________________________
// 1) dictionarize(responseData): normaliza e agrupa por fonte
// ________________________________________________________________________________________
function dictionarize_lexical(responseData) {
  const resultsBySource = {};
  const hasGrouped   = responseData && typeof responseData.grouped === 'object' && Object.keys(responseData.grouped).length;
  const hasProcessed = Array.isArray(responseData?.processed_results) && responseData.processed_results.length;
  const hasResults   = Array.isArray(responseData?.results) && responseData.results.length;

  if (!hasGrouped && !hasProcessed && !hasResults) {
    return { sourceNames: [], resultsBySource };
  }

  const pushItem = (src, it) => {
    if (!resultsBySource[src]) resultsBySource[src] = [];
    const text = typeof it.text === 'string' ? it.text : '';
    const display_md = typeof it.display_md === 'string' ? it.display_md : '';
    const meta = _pickKnownMeta(it, src);

    resultsBySource[src].push({
      // conteúdo prioriza display_md; cai para text
      content: display_md || text || '',
      text,
      display_md,
      // campos usados na ordenação/badges
      paragraph: meta.paragraph_number,
      score: meta.score,
      // meta explícita completo (com extras)
      meta
    });
  };

  if (hasGrouped) {
    for (const [srcKey, arr] of Object.entries(responseData.grouped)) {
      const src = _normSrc(srcKey);
      (Array.isArray(arr) ? arr : []).forEach(it => it && pushItem(src, it));
    }
  } else {
    const flat = hasProcessed ? responseData.processed_results : responseData.results;
    (flat || []).forEach(it => {
      if (!it) return;
      const src = _normSrc(it.source || it.file || 'Results');
      pushItem(src, it);
    });
  }

  // Ordem das fontes (respeita sources_sorted quando vier)
  let sourceNames;
  if (Array.isArray(responseData?.sources_sorted) && responseData.sources_sorted.length) {
    const normalizedMap = Object.fromEntries(Object.keys(resultsBySource).map(k => [_normSrc(k), k]));
    sourceNames = responseData.sources_sorted
      .map(s => _normSrc(s))
      .filter(s => normalizedMap[s])
      .map(s => normalizedMap[s]);
    Object.keys(resultsBySource).forEach(k => { if (!sourceNames.includes(k)) sourceNames.push(k); });
  } else {
    sourceNames = Object.keys(resultsBySource);
  }

  return { sourceNames, resultsBySource };
}
