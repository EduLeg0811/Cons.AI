




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



//______________________________________________________________________________________________
// flattenDataEntries: Recebe um array 'data' e retorna um array de objetos planos
//______________________________________________________________________________________________
function flattenDataEntries(data) {
  if (!Array.isArray(data)) return [];

  return data.map(item => {
    const metadata = item.metadata || {};

    // Helper para pegar campo no item ou no metadata
    const getField = (field) => item[field] ?? metadata[field] ?? null;

    // Score convertido para float se possível
    let score = getField('score');
    score = (score !== null && score !== undefined && !isNaN(parseFloat(score)))
      ? parseFloat(score)
      : null;

    // Texto cru e markdown com fallback
    const rawText = item.page_content || item.text || "";
    const mkText  = metadata.markdown || item.markdown || item.text || "";


    return {
      source: getField('source'),
      score: score,
      paragraph_number: getField('number') || getField('paragraph_number'),
      raw_text: rawText,
      mk_text: mkText,
      title: getField('title'),
      argument: getField('argumento') || getField('argument'),
      section: getField('section'),
      folha: getField('folha'),
      date: getField('date'),
      link: getField('link'),
      area: getField('area'),
      theme: getField('theme'),
      author: getField('author'),
      sigla: getField('sigla'),
      citation: getField('citation'),
      total_token_used: getField('total_token_used'),
      model: getField('model'),
      temperature: getField('temperature')
    };
  });
}


//______________________________________________________________________________________________
// sortData: Agrupa os itens por 'source' e ordena cada grupo com 2 blocos:
// 1) score = 0 → ordenados por number (asc)
// 2) score > 0 → ordenados por score (asc)
//______________________________________________________________________________________________
function sortData(uniqueData) {
  if (!Array.isArray(uniqueData)) return {};

  // 1️⃣ Agrupar por source
  const grouped = uniqueData.reduce((acc, item) => {
    const src = item.source || "Unknown";
    if (!acc[src]) acc[src] = [];
    acc[src].push(item);
    return acc;
  }, {});

  // 2️⃣ Ordenar cada grupo separando blocos
  for (const source in grouped) {
    const group = grouped[source];

    // Bloco A: score = 0 → ordena por number
    const zeroScoreItems = group
      .filter(it => (it.score ?? 0) === 0)
      .sort((a, b) => {
          const numA = Number(a.paragraph_number) || Number.POSITIVE_INFINITY;
          const numB = Number(b.paragraph_number) || Number.POSITIVE_INFINITY;
          
          return numA - numB;
      });

    // Bloco B: score > 0 → ordena por score crescente
    const scoredItems = group
      .filter(it => (it.score ?? 0) !== 0)
      .sort((a, b) => {
          const scoreA = Number(a.score) || Number.POSITIVE_INFINITY;
          const scoreB = Number(b.score) || Number.POSITIVE_INFINITY;
          
          return scoreA - scoreB;
      });

    // Junta blocos mantendo a ordem desejada
    grouped[source] = [...zeroScoreItems, ...scoredItems];
  }

  return grouped;
}



//______________________________________________________________________________________________
// delDuplicateItems: Remove itens duplicados com base no texto (text, mk_text ou metadata.markdown)
// Normaliza o texto removendo marcações simples de Markdown, acentos e caixa.
// Retorna o array filtrado, mantendo apenas o primeiro item único.
//______________________________________________________________________________________________
function delDuplicateItems(flattenedData) {

  console.log('<<< delDuplicateItems >>> [flattenedData]: ', flattenedData);

  if (!Array.isArray(flattenedData)) return [];

  const seen = new Set();

  const normalizeText = (str) => {
    if (!str) return "";
    // Remove marcações markdown simples
    let cleaned = str.replace(/\*|_|`|~|__|#/g, '');
    // Remove acentos
    cleaned = cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // Converte para minúsculas e remove espaços extras
    return cleaned.toLowerCase().trim();
  };

  return flattenedData.filter(item => {
    const text =
      item.text ||
      item.mk_text ||
      (item.metadata && item.metadata.markdown) ||
      "";

    const normalized = normalizeText(text);

    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}











// Runtime helpers for MAX_RESULTS_DISPLAY
function getMaxResultsCap() {
  const fallback = typeof MAX_RESULTS_DISPLAY === 'number' ? MAX_RESULTS_DISPLAY : 200;
  const cfgValue = Number(window.CONFIG?.MAX_RESULTS_DISPLAY);
  return Number.isFinite(cfgValue) && cfgValue > 0 ? cfgValue : fallback;
}
window.getMaxResultsCap = getMaxResultsCap;

function getMinResultsFloor() {
  const fallback = typeof MIN_RESULTS_DISPLAY === "number" ? MIN_RESULTS_DISPLAY : 1;
  const cfgValue = Number(window.CONFIG?.MIN_RESULTS_DISPLAY);
  const floor = Number.isFinite(cfgValue) && cfgValue > 0 ? cfgValue : fallback;
  return floor;
}
window.getMinResultsFloor = getMinResultsFloor;

function normalizeMaxResults(value) {
  const cap = getMaxResultsCap();
  const floor = getMinResultsFloor();
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return floor;
  const bounded = Math.min(Math.max(parsed, floor), cap);
  return bounded;
}
window.normalizeMaxResults = normalizeMaxResults;

function clearModuleSelectionPills() {
  document.querySelectorAll('.book-pill.active').forEach(pill => {
    pill.classList.remove('active');
  });

  const collapseFn = typeof window.collapseAllPills === 'function' ? window.collapseAllPills : null;
  if (collapseFn) {
    collapseFn();
  } else {
    document.querySelectorAll('.pill.active').forEach(pill => {
      pill.classList.remove('active');
    });
    document.querySelectorAll('.collapse-panel.open').forEach(panel => {
      panel.classList.remove('open');
    });
  }
}
window.clearModuleSelectionPills = clearModuleSelectionPills;

document.addEventListener('DOMContentLoaded', () => {
  try {
    const cap = getMaxResultsCap();
    const floor = getMinResultsFloor();
    document.querySelectorAll('input[data-max-config]').forEach(input => {
      input.setAttribute('max', String(cap));
      input.setAttribute('min', String(floor));
      input.value = String(normalizeMaxResults(input.value));
    });
  } catch (err) {
    console.error('Failed to apply MAX_RESULTS_DISPLAY cap:', err);
  }

  try {
    document.querySelectorAll('.options-trigger').forEach(trigger => {
      trigger.addEventListener('click', () => {
        const panel = document.getElementById('optionsPanel');
        if (!panel) return;
        const isOpening = !panel.classList.contains('open');
        const shouldReset = panel.dataset.resetOnOpen === 'true';
        if (isOpening && shouldReset && typeof clearModuleSelectionPills === 'function') {
          clearModuleSelectionPills();
        }
      }, true);
    });
  } catch (err) {
    console.warn('Failed to bind options trigger listener', err);
  }
});



// ===================================================================
// Função utilitária: limitar resultados por fonte
// ===================================================================
function limitResultsPerSource(results, maxPerSource) {
  if (!Array.isArray(results)) return [];
  const grouped = results.reduce((acc, item) => {
      const src = item.source || 'Unknown';
      if (!acc[src]) acc[src] = [];
      acc[src].push(item);
      return acc;
  }, {});
  return Object.values(grouped).flatMap(arr => arr.slice(0, maxPerSource));
}



//______________________________________________________________________________________________
// llm_formatResponse  --- call from [bridge.js] <call_llm>
//______________________________________________________________________________________________
function llm_formatResponse(responseData) {

    console.log('RAW llm_formatResponse:', responseData);

    const formattedResponse = {
        text: responseData.text,
        citations: responseData.citations,
        total_tokens_used: responseData.total_tokens_used || 0,
        type: responseData.type || 'ragbot',
        model: responseData.model,
        temperature: responseData.temperature,
    };
    
    return formattedResponse;
}


//______________________________________________________________________________________________
// bookName  --- call from [bridge.js] <call_llm>
//______________________________________________________________________________________________
function bookName(source) {

  let realName = source;

    if (source === 'HSR') {
        realName = 'Homo sapiens reurbanisatus';
    }
    if (source === 'HSP') {
        realName = 'Homo sapiens pacificus';
    }   
    if (source === '200TEAT') {
        realName = '200 Teáticas da Conscienciologia';
    }
    if (source === '700EXP') {
        realName = '700 Experimentos da Conscienciologia';
    }   
    if (source === 'TEMAS') {
        realName = 'Temas da Conscienciologia';
    }   
    if (source === 'PROEXIS') {
        realName = 'Manual da Proéxis';
    }   
    if (source === 'TNP') {
        realName = 'Manual da Tenepes';
    }   
    if (source === 'DUPLA') {
        realName = 'Manual da Dupla Evolutiva';
    }        
    if (source === 'LO') {
        realName = 'Léxico de Ortopensatas';
    }        
    if (source === 'EC') {
        realName = 'Enciclopédia da Conscienciologia';
    }        
    if (source === 'DAC') {
        realName = 'Dicionário de Argumentos da Conscienciologia';
    }        
    if (source === 'PROJ') {
        realName = 'Projeciologia';
    }
    if (source === 'CCG') {
        realName = 'Conscienciograma';
    }    
    if (source === 'QUEST') {
        realName = 'Questões Minitertúlia';
    }   
     if (source === 'MINI') {
        realName = 'Anotações Minitertúlia EDU';
    }   
    return realName;
}



//______________________________________________________________________________________________
// extractMetadata
//______________________________________________________________________________________________
function extractMetadata(data, type) {
    // Handle case where data is not an array or is null/undefined
    if (!data) {
      console.warn('extractMetadata: No data provided');
      return {};
    }
  
    // Convert single object to array if needed
    const dataArray = Array.isArray(data) ? data : [data];
    const metadata = {};

    console.log('<<< extractMetadata >>> [data]: ', data);
  
  
    // Common metadata fieldS
    const COMMON_FIELDS = ['title', 'number', 'source'];
  
    // Type-specific field mappings and processing
    const TYPE_CONFIG = {
      ragbot: {
        metadataFields: [...COMMON_FIELDS, 'citations', 'total_tokens_used', 'model', 'temperature', 'verbosity', 'reasoning_effort']
      },
      lexical: {
        metadataFields: [...COMMON_FIELDS]
      },
      semantic: {
        metadataFields: [...COMMON_FIELDS, 'area', 'theme', 'author', 'sigla', 'date', 'link', 'score', 'argumento', 'section', 'folha']
      },
      mancia: {
        metadataFields: [...COMMON_FIELDS, 'citations', 'total_tokens_used', 'model', 'temperature']
      },
      verbetopedia: {
        metadataFields: [...COMMON_FIELDS, 'area', 'theme', 'author', 'sigla', 'date', 'link', 'score']
      },
      ccg: {
        metadataFields: [...COMMON_FIELDS, 'section', 'folha', 'number', 'date', 'score']
      }
    };
  
  
  
    // Get type-specific config
    const config = TYPE_CONFIG[type]
  
    // Process each item in the data array
    dataArray.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
  
      const itemKey = `item_${index}`;
      metadata[itemKey] = {};
  
      // Only include fields that are explicitly defined in metadataFields
      Object.entries(item).forEach(([key, value]) => {
        const isMetadata = config.metadataFields.includes(key);
        const isExcluded = key.startsWith('_') || // Exclude private fields
                         typeof value === 'function'; // Exclude methods
  
        if (isMetadata && !isExcluded) {
          // Handle nested objects and arrays
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            metadata[itemKey][key] = extractMetadata(value, type);
          } else {
            metadata[itemKey][key] = value;
          }
        }
      });
    });
  
    // If there's only one item, return it directly instead of nesting
    const result = Object.keys(metadata).length === 1 ? metadata[Object.keys(metadata)[0]] : metadata;

    return result;
  }
  
  

// Extract the book names from the citations, without the paragraph numbers and the file extensions
function extractBookNames(citations) {

  if (!citations) return '';
  const text = String(citations).trim();
  if (!text) return '';

  const seen = new Set();
  const names = [];

  text
    .split(';')                      // segmentos: "NOME.ext: números"
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(seg => {
      // pega a parte antes de ":" (nome do arquivo/livro)
      let name = seg.split(':')[0].trim();

      // remove extensão e pontuação final
      name = name.replace(/\.(md|pdf|txt|docx)$/i, '').replace(/[.,;:\s]+$/g, '').trim();

      // Caso especial de Lexico de Ortopensatas_x, retira a partir do "_"
      if (name.startsWith('Lexico')) {
        name = name.replace(/_\d+$/, '');
      }

      // colapsa espaços múltiplos
      name = name.replace(/\s+/g, ' ');

      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    });

  return names.join('; ');
}


  
// ---------------- Chat ID helpers ----------------
const CHAT_ID_STORAGE_KEYS = {
  default: 'cons_chat_id',
  ragbot: 'cons_chat_id_ragbot'
};

function resolveChatIdKey(scope = 'default') {
  return CHAT_ID_STORAGE_KEYS[scope] || CHAT_ID_STORAGE_KEYS.default;
}

function createUuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getOrCreateChatId(scope = 'default') {
  const key = resolveChatIdKey(scope);
  let id = localStorage.getItem(key);
  if (!id) {
    id = createUuid();
    localStorage.setItem(key, id);
  }
  return id;
}

function newConversationId(scope = 'default') {
  const id = createUuid();
  const key = resolveChatIdKey(scope);
  localStorage.setItem(key, id);
  return id;
}

function setChatId(id, scope = 'default') {
  const key = resolveChatIdKey(scope);
  localStorage.setItem(key, id);
  return id;
}
window.setChatId = setChatId;


// Reset LLM
async function resetLLM(scope = 'default') {
  const effectiveScope = typeof scope === 'string' ? scope : 'default';

  if (window.abortRagbot) {
    try { window.abortRagbot(); } catch {}
  }
  const chat_id = getOrCreateChatId(effectiveScope);
  try {
    await fetch(apiBaseUrl + '/ragbot_reset', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id })
    });
  } catch (e) {
    console.warn('Falha ao resetar no servidor (seguindo mesmo assim):', e);
  }
  newConversationId(effectiveScope);

  if (window.chatHistory && Array.isArray(window.chatHistory)) {
    try { window.chatHistory.length = 0; } catch {}
  }
}

// Opcional: reset no servidor + novo chat_id local, se existir o endpoint /ragbot_reset (limpa tambem Search Box)
async function resetConversation(scope = 'default') {
  const effectiveScope = typeof scope === 'string' ? scope : 'default';

  if (window.abortRagbot) {
    try { window.abortRagbot(); } catch {}
  }
  const chat_id = getOrCreateChatId(effectiveScope);
  try {
    await fetch(apiBaseUrl + '/ragbot_reset', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id })
    });
  } catch (e) {
    console.warn('Falha ao resetar no servidor (seguindo mesmo assim):', e);
  }
  newConversationId(effectiveScope);
  const container = document.querySelector('#results');
  if (container) container.innerHTML = '';
  const chat = document.getElementById('chatMessages');
  if (chat) chat.innerHTML = '';
  if (window.chatHistory && Array.isArray(window.chatHistory)) {
    try { window.chatHistory.length = 0; } catch {}
  }
  const input = document.getElementById('searchInput');
  if (input) input.value = '';

  // Ragbot: após reset, voltar à tela inicial com sugestões de perguntas
  if (effectiveScope === 'ragbot' && window.ragbotShowInitialQuests) {
    try { window.ragbotShowInitialQuests(); } catch {}
  }
}

document.getElementById('btn-new-conv')?.addEventListener('click', () => resetConversation('ragbot'));

// ---------------- Theme (Light/Dark) ----------------
// Centralized theme handling to keep all pages consistent
// Applies `data-theme` on <html> and persists in localStorage
(function setupTheme() {
  function setTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    const root = document.documentElement;
    root.setAttribute('data-theme', t);
    // Hint to UA for built-in widgets (scrollbar, form controls)
    try { root.style.colorScheme = t; } catch {}
    try { localStorage.setItem('theme', t); } catch {}
  }

  function detectInitialTheme() {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    // fallback to system preference
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch {}
    return 'light';
  }

  function initTheme() {
    setTheme(detectInitialTheme());
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
  }

  // Expose globally for inline handlers
  window.initTheme = initTheme;
  window.toggleTheme = toggleTheme;

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
  } else {
    initTheme();
  }

  // Cross-tab sync
  window.addEventListener('storage', (e) => {
    if (e.key === 'theme' && e.newValue) setTheme(e.newValue);
  });
})();









function showMessage(container, message, type = 'error') {
  const classes = {
      error: 'msg-error',
      info: 'msg-info',
      success: 'msg-success'
  };
  container.innerHTML = `
      <div class="search-message ${classes[type] || ''}">
          ${message}
      </div>
  `;
}

// Intercept Home ('.back-button') clicks: navigate immediately; cleanup fire-and-forget
(function(){
  function isHomeButton(el){ return !!(el && el.classList && el.classList.contains('back-button')); }
  function onClick(ev){
    const a = ev.target && ev.target.closest && ev.target.closest('a');
    if (!a || !isHomeButton(a)) return;
    ev.preventDefault();

    // Abort any in-flight requests synchronously if possible
    try { if (typeof window.abortAllRequests === 'function') window.abortAllRequests(); } catch {}

    // Fire-and-forget cleanup (do not block navigation)
    try { if (typeof resetLLM === 'function') resetLLM('default'); } catch {}
    try { if (typeof resetLLM === 'function') resetLLM('ragbot'); } catch {}

    // Navigate immediately
    const href = a.getAttribute('href') || 'index.html';
    try { window.location.assign(href); } catch { window.location.href = href; }
  }
  document.addEventListener('click', onClick, true);
})();




// Collapse all pills when configuration button is clicked
(function(){
  function onConfigClick(ev){
    const btn = ev.target && ev.target.closest && ev.target.closest('.options-trigger');
    if (!btn) return;
    try {
      // Aguarda 500ms para deixar o painel de config abrir, então retrai os pills
      setTimeout(() => {
        if (typeof window.collapseAllPills === 'function') {
          window.collapseAllPills();
        } else {
          document.querySelectorAll('.pill.active').forEach(p => p.classList.remove('active'));
          document.querySelectorAll('.collapse-panel.open').forEach(p => p.classList.remove('open'));
        }
      }, 500);
    } catch {}
  }
  document.addEventListener('click', onConfigClick, true);
})();