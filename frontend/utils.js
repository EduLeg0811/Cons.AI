// utils.js

// Global variable to store the current search term
let currentSearchTerm = '';

// Elements assumed to be in the global scope
const searchInput  = document.getElementById('searchInput');
const downloadPDF   = document.getElementById('downloadPDF');
const downloadDocx = document.getElementById('downloadDocx');




// Global Parameters
const MODEL_LLM='gpt-4.1-nano';
const TEMPERATURE=0.0;
const TOP_K=10;

// =================== API Configuration (DEV/PROD) ===================
// LEMBRAR DE MUDAR TAMBÉM EM APP.PY
// ====================================================================
// # Restrinja origens em produção; inclua localhost para dev
// FRONTEND_ORIGINS = [
//     "https://cons-ai-server.onrender.com",
//     "http://localhost:5173",  # se usar Vite/Dev server
//     "http://127.0.0.1:5500",  # se usar Live Server
//     "http://localhost:5500",  # se usar Live Server
// ]
const LOCAL_BASE = 'http://localhost:5000';              // backend local
const PROD_BASE  = 'https://cons-ai-server.onrender.com';       // backend Render



function resolveApiBaseUrl() {
  // Permite forçar via ?api=https://... ou via localStorage.apiBaseUrl
  const qs = new URLSearchParams(location.search).get('api');
  if (qs) return { base: qs, mode: 'custom' };

  const saved = localStorage.getItem('apiBaseUrl');
  if (saved) return { base: saved, mode: 'custom' };

  const isFile = location.protocol === 'file:'; // se abrir via file://
  const host = location.hostname || '';
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');

  // file:// ou localhost => DEV
  if (isFile || isLocalHost) return { base: LOCAL_BASE, mode: 'development' };

  // padrão => PROD
  return { base: PROD_BASE, mode: 'production' };
}

const { base: apiBaseUrl, mode } = resolveApiBaseUrl();

// Log explícito do modo, base e origem da página
const origin = location.origin || 'file://';
console.log(`[API] mode=${mode} | base=${apiBaseUrl} | origin=${origin}`);

// Badge visual DEV/PROD
try {
  const badge = document.createElement('div');
  badge.textContent = (mode || 'unknown').toUpperCase();
  badge.style.cssText = [
    'position:fixed','right:8px','bottom:8px','padding:4px 6px',
    'font:12px/1.2 monospace','background:#0007','color:#fff',
    'border-radius:4px','z-index:9999','letter-spacing:0.5px'
  ].join(';');
  //document.addEventListener('DOMContentLoaded', () => document.body.appendChild(badge));
} catch {}




// (Opcional) “ping” para acordar backend no Render; em DEV apenas valida CORS
window.addEventListener('load', () => {
  fetch(`${apiBaseUrl}/health`, { method: 'GET', mode: 'cors' }).catch(() => {});
});




// Exporta para debug no console
window.__API_BASE = apiBaseUrl;




 

 // Transform the RAGbot response to match what displayResults expects
 function formatBotResponse(data) {
  return {
  text: data.text,
  citations: data.citations,
  total_tokens_used: data.total_tokens_used || 0,
  type: data.type || 'ragbot',
  model: data.model,
  temperature: data.temperature,
  top_k: data.top_k
};
}



//______________________________________________________________________________________________
// Download Results
//______________________________________________________________________________________________

/**
 * Sends the processed results to the backend and triggers a download.
 * @param {'pdf'|'docx'} format - The desired download format
 * @param {Object|Array} resultsData - The search results to download
 * @param {string} searchTerm - The original search term
 */
async function downloadResults(format, resultsData) {
    // Handle different result structures - could be direct array or object with results array

    const term = resultsData?.term || '';
    const type = resultsData?.search_type || '';

    const resultsArray = Array.isArray(resultsData) ? resultsData : 
                        (resultsData?.results || []);
    
    if (resultsArray.length === 0) {
        alert("No results to download.");
        return;
    }

    // Get the appropriate button based on format
    const button = document.getElementById(format === 'markdown' ? 'downloadMd' : 'downloadDocx');
    if (!button) {
        console.error('Download button not found');
        return;
    }

    const originalHtml = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';
    button.disabled = true;
    
    // Sanitize and trim the search term for the filename
    let safeTerm = (term || 'results')
        .trim()
        .replace(/[^\w\s-]/g, '')  // Remove special characters
        .replace(/\s+/g, '-')        // Replace spaces with dashes
        .toLowerCase()
        .substring(0, 50);           // Limit length

    try {
        const response = await fetch(`${apiBaseUrl}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                format: format,
                term: term,
                type: type,
                results: resultsArray
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Get the blob data
        const blob = await response.blob();
        
        // Try to get filename from Content-Disposition header, fallback to generated name
        let filename = `${safeTerm}.${format}`;
        const contentDisposition = response.headers.get('Content-Disposition');
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1].replace(/['"]/g, '');
            }
        }

        // Create and trigger download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

    } catch (error) {
        console.error('Download failed:', error);
        alert('Failed to download file. Please try again.');
    } finally {
        // Restore button state
        if (button) {
            button.innerHTML = originalHtml;
            button.disabled = false;
        }
    }
}
//   Flexibilidade: se no futuro você adicionar metadados (scores, citações), basta incluí-los no JSON que o frontend envia.

//   {
//     "format": "markdown" | "docx",
//     "term": "<termo de busca>",
//     "results": [
//       {
//         "text": "...",
//         "source": "...",
//         "paragraph_number": 5,
//         "score": 0.12,
//         "file_citations": "...",
//         "search_type": "lexical" | "semantical" | ...
//       },
//       …
//     ]
//   }

// Comportamento:
// Não chama search_in_files nem simple_search.
// Agrupa o array results por source.
// Gera o .md ou o .docx a partir desse agrupamento.
  

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

// Opcional: reset no servidor + novo chat_id local, se existir o endpoint /ragbot_reset
async function resetConversation() {
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
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
}

// Se existir um botão com este id, liga automaticamente
document.getElementById('btn-new-conv')?.addEventListener('click', resetConversation);





//______________________________________________________________________________________________
// Store results in a consistent format for download
//______________________________________________________________________________________________
function storeResults(data, term, search_type) {
  let allResults = [];

  let arr = [];
  if (Array.isArray(data))               arr = data;
  else if (Array.isArray(data?.results)) arr = data.results;
  else if (data?.resultsBySource)        arr = Object.values(data.resultsBySource).flat();

  
  if (Array.isArray(arr)) {
    // Caso 1: dados já "flattened"
    allResults = arr.map(item => ({
      ...item,
      source: (typeof normSourceName === 'function')
        ? normSourceName(item.source || item.file || 'Results')
        : _normSrc(item.source || item.file || 'Results'),
      title: item.title || item.meta?.title || "Sem título",
      content: item.content || item.text || "",
      ...item.meta
    }));
  } else if (arr?.resultsBySource) {
    // Caso 2: dados agrupados por fonte
    Object.entries(arr.resultsBySource).forEach(([source, items]) => {
      items.forEach(item => {
        allResults.push({
          ...item,
          source: (typeof normSourceName === 'function')
            ? normSourceName(source)
            : _normSrc(source),
          title: item.meta?.title || `Result from ${source}`,
          content: item.content || item.text || "",
          ...item.meta
        });
      });
    });
  }

  // Armazena resultados de forma padronizada
  lastResults = {
    search_type: search_type,
    term: term,
    results: allResults
  };

  return lastResults;
}




function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// mapeia letras para classes que capturam versões acentuadas
const DIAC_MAP = {
  'a': '[aàáâãäåAÀÁÂÃÄÅ]',
  'e': '[eèéêëEÈÉÊË]',
  'i': '[iìíîïIÌÍÎÏ]',
  'o': '[oòóôõöOÒÓÔÕÖ]',
  'u': '[uùúûüUÙÚÛÜ]',
  'c': '[cçCÇ]',
  'n': '[nñNÑ]'
};
function toDiacriticPattern(term) {
  return term.split('').map(ch => DIAC_MAP[ch] || DIAC_MAP[ch.toLowerCase()] || escapeRegExp(ch)).join('');
}

/** Destaque semântico com acento-agnóstico; suporta termos compostos */
function highlightTerm(html, term) {
  if (!html || !term) return html;
  const parts = term.split(/\s+/).filter(Boolean);
  if (!parts.length) return html;

  const alts = parts.map(p => toDiacriticPattern(p));
  const rx = new RegExp(`(${alts.join('|')})`, 'gi');

  return html.replace(rx, '<mark>$1</mark>');
}





function normSourceName(src) {
  if (!src) return 'Results';
  let s = String(src);
  // tira diretórios (Windows/Linux)
  s = s.split(/[\\/]/).pop();
  // tira extensão .md / .markdown (case-insensitive)
  s = s.replace(/\.(md|markdown)$/i, '');
  return s;
}