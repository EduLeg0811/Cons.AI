// utils.js

// Global variable to store the current search term
let currentSearchTerm = '';

// Elements assumed to be in the global scope
const searchInput  = document.getElementById('searchInput');
const downloadMd   = document.getElementById('downloadMd');
const downloadDocx = document.getElementById('downloadDocx');



// Global Parameters
const MODEL_LLM='gpt-4.1-nano';
const TEMPERATURE=0.0;
const TOP_K=20;

// =================== API Configuration (DEV/PROD) ===================
// LEMBRAR DE MUDAR TAMBÉM EM APP.PY
// ====================================================================
// # Restrinja origens em produção; inclua localhost para dev
// FRONTEND_ORIGINS = [
//     "https://cons-ai-backend.onrender.com",
//     "http://localhost:5173",  # se usar Vite/Dev server
//     "http://127.0.0.1:5500",  # se usar Live Server
//     "http://localhost:5500",  # se usar Live Server
// ]
const LOCAL_BASE = 'http://localhost:5000';              // backend local
const PROD_BASE  = 'https://cons-ai-backend.onrender.com';       // backend Render

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
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(badge));
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
 * @param {'markdown'|'docx'} format 
 * @param {Array} resultsArray 
 */
async function downloadResults(format, resultsData) {
    const term = searchInput.value.trim();
    
    // Handle different result structures - could be direct array or object with results array
    const resultsArray = Array.isArray(resultsData) ? resultsData : 
                        (resultsData?.results || []);
    
    if (!term || resultsArray.length === 0) {
      alert("Nada para baixar.");
      return;
    }
  
    const button       = format === "markdown" ? downloadMd : downloadDocx;
    const originalHtml = button.innerHTML;
    button.innerHTML   = '<i class="fas fa-spinner fa-spin"></i> Preparando...';
    button.disabled    = true;

    currentTerm = String(term || '').trim();
    if (currentTerm.length > 25) currentTerm = currentTerm.substring(0, 25);
    
  
    try {
      const resp = await fetch(apiBaseUrl + "/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          term: currentTerm,
          results: resultsArray
        })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  
      const blob = await resp.blob();
  
      // tenta extrair filename do header; senão usa fallback
      let filename = `${currentTerm}.${format === "markdown" ? "md" : "docx"}`;
      const cd = resp.headers.get("Content-Disposition") || "";
      const m  = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      if (m && m[1]) filename = m[1];
  
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href    = url;
      a.download= filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
  
    } catch (e) {
      console.error("Download falhou:", e);
      alert("Erro ao baixar o arquivo.");
    } finally {
      button.innerHTML = originalHtml;
      button.disabled  = false;
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
