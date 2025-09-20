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
// semantical_formatResponse  --- call from [bridge.js] <call_semantical>
//______________________________________________________________________________________________
function semantical_formatResponse(responseData, term) {
    
  const count = responseData.length;
  const search_type = "semantical";

  //if source contains "ECALL_DEF", change it to "EC"
  responseData.forEach(item => {
    if (item.source === "ECALL_DEF") {
        item.source = "EC";
    }            
  });

  const formattedResponse = {
    count: count,
    search_type: search_type,
    term: term,
    results: responseData,
  };

return formattedResponse;

}




//______________________________________________________________________________________________
// lexical_formatResponse  --- call from [bridge.js] <call_lexical>
//______________________________________________________________________________________________
function lexical_formatResponse(responseData, term) {
    
  const formattedResponse = responseData;
  
return formattedResponse;

}



//______________________________________________________________________________________________
// llm_formatResponse  --- call from [bridge.js] <call_llm>
//______________________________________________________________________________________________
function llm_formatResponse(responseData) {
    // Group citations by source
    const citationsBySource = responseData.citations
        .replace(/[\[\]]/g, '')  // Remove brackets
        .split(';')              // Split by semicolon
        .map(pair => {
            const [source, page] = pair.split(',').map(s => s.trim());
            return {
                source: source.replace(/\.[^/.]+$/, ''), // Remove file extension
                page: parseInt(page, 10) || 0
            };
        })
        .reduce((acc, {source, page}) => {
            if (!acc[source]) acc[source] = new Set();
            acc[source].add(page);
            return acc;
        }, {});

    // Format the grouped citations
    const formattedCitations = Object.entries(citationsBySource)
        .map(([source, pages]) => 
            `${source}: ${Array.from(pages).sort((a, b) => a - b).join(', ')}`
        )
        .join(' ; ');

    const formattedResponse = {
        text: responseData.text,
        citations: formattedCitations,
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
    if (source === 'ECALL_DEF') {
        realName = 'Enciclopédia da Conscienciologia (Definologia)';
    }        
    if (source === 'PROJ') {
        realName = 'Projeciologia';
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
  
  
    // Common metadata fieldS
    const COMMON_FIELDS = ['title', 'number', 'source'];
  
    // Type-specific field mappings and processing
    const TYPE_CONFIG = {
      ragbot: {
        metadataFields: [...COMMON_FIELDS, 'citations', 'total_tokens_used', 'model', 'temperature']
      },
      lexical: {
        metadataFields: [...COMMON_FIELDS]
      },
      semantical: {
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
  
  




  
// ---------------- Chat ID helpers ----------------
function createUuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getOrCreateChatId() {
  let id = localStorage.getItem('cons_chat_id');
  if (!id) {
    id = createUuid();
    localStorage.setItem('cons_chat_id', id);
  }
  return id;
}

function newConversationId() {
  const id = createUuid();
  localStorage.setItem('cons_chat_id', id);
  return id;
}



// Reset LLM
async function resetLLM() {
  // Abort a requisição ativa (se houver)
  if (window.abortRagbot) {
    try { window.abortRagbot(); } catch {}
  }
  const chat_id = getOrCreateChatId();
  try {
    await fetch(apiBaseUrl + '/ragbot_reset', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id })
    });
  } catch (e) {
    console.warn('Falha ao resetar no servidor (seguindo mesmo assim):', e);
  }
  newConversationId();
 
  // Zera histórico em memória (se exposto)
  if (window.chatHistory && Array.isArray(window.chatHistory)) {
    try { window.chatHistory.length = 0; } catch {}
  }
}




// Opcional: reset no servidor + novo chat_id local, se existir o endpoint /ragbot_reset (limpa tambem Search Box)
async function resetConversation() {
  // Abort a requisição ativa (se houver)
  if (window.abortRagbot) {
    try { window.abortRagbot(); } catch {}
  }
  const chat_id = getOrCreateChatId();
  try {
    await fetch(apiBaseUrl + '/ragbot_reset', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id })
    });
  } catch (e) {
    console.warn('Falha ao resetar no servidor (seguindo mesmo assim):', e);
  }
  newConversationId();
  // Limpeza básica de UI se existir
  const container = document.querySelector('#results');
  if (container) container.innerHTML = '';
  // Limpa mensagens do chat
  const chat = document.getElementById('chatMessages');
  if (chat) chat.innerHTML = '';
  // Zera histórico em memória (se exposto)
  if (window.chatHistory && Array.isArray(window.chatHistory)) {
    try { window.chatHistory.length = 0; } catch {}
  }
  const input = document.getElementById('searchInput');
  if (input) input.value = '';

  // Mensagem de boas-vindas
  if (window.ragbotAddMessage) {
    window.ragbotAddMessage('bot', 'Nova conversa iniciada. Como posso ajudar?');
  }
}

// Se existir um botão com este id, liga automaticamente
document.getElementById('btn-new-conv')?.addEventListener('click', resetConversation);


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
