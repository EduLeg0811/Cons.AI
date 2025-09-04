// config.js


const VERBETES_URL = 'https://arquivos.enciclopediadaconscienciologia.org/verbetes/';

// Global Parameters
// UI toggles and defaults
// Whether to show reference badges under each result (fixed global setting)
window.SHOW_REF_BADGES = true;
const MODEL_LLM='gpt-5-nano';
const MODEL_RAGBOT='gpt-5-nano';
const TEMPERATURE=0.3;
const MAX_RESULTS_DISPLAY=10;
const OPENAI_RAGBOT='ALLWV';

const FULL_BADGES = false;

const INSTRUCTIONS_RAGBOT = `
  Você atua como um assistente no estilo ChatGPT, especializado em Conscienciologia.
  # Instruções
  1. **Especialização e Conteúdo**
    - Responda sempre como especialista em Conscienciologia.
    - Baseie todas as respostas exclusivamente nos documentos fornecidos.
  2. **Tom e Idioma**
    - Responda no idioma do usuário.
    - Mantenha um tom acadêmico, claro, objetivo e sem floreios.
    - Use listas numeradas sempre que pertinente.
  3. **Formato da Resposta (Markdown)**
    - Utilize Markdown limpo.
    - Realce termos-chave utilizando, em ordem crescente: *itálico*, **negrito**, ***negrito-itálico*** conforme a relevância.
    - Coloque títulos ou cabeçalhos em **negrito**.
    - Para explicações passo a passo, use listas numeradas; para sequências cronológicas, siga a ordem temporal.
    - Prefira tabelas em Markdown para dados organizados e listas sucintas para enumerações longas.
    - Default para Markdown.
  4. **Clareza Operacional**
    - Não repita perguntas já respondidas, aproveitando o contexto da conversa.
    - Em caso de ambiguidade, adote a interpretação mais razoável e declare a suposição em uma linha.
    - Sempre que possível, utilize analogias claras e diretas.
    - Priorize conceitos, termos próprios e neologismos da Conscienciologia.
    - Seja direto e selecione apenas os trechos mais relevantes para a resposta.
  5. **Finalização e Ação**
    - Inclua um bloco com sugestões de aprofundamento, como recomendações de leitura, ou temas a serem explorados.
`;

const SEMANTICAL_INSTRUCTIONS = `
Você é um assistente especialista em Conscienciologia.
Sua resposta à consulta será usada para formular uma pesquisa semântica.
Instruções:
1. Entenda o significado específico da consulta no contexto da Conscienciologia, não apenas no português comum.
2. Elabore uma lista de termos que expressem o significado denotativo da consulta, semânticamente, como termos-chave ou sinônimos, dentro da Conscienciologia.
3. Não use elementos de ligação, como artigos, preposições ou conjunções.
4. Não utilize repetições, preâmbulos ou explicações como 'significa' ou 'é'.
5. Forneça como resposta apenas a lista limpa de 5 palavras ou expressões compostas, separadas por ponto-e-vírgula (;). 
Exemplo: Termo1; Termo2; Termo3; Termo4; Termo5.
`;


const COMMENTARY_INSTRUCTIONS = `
  Developer: Você é um assistente especialista em Conscienciologia, focado em responder perguntas relacionadas ao livro Léxico de Ortopensatas, de Waldo Vieira, utilizando documentos de referência.
  A consulta contém uma frase (*pensata*) desse livro. Responda de acordo com as instruções abaixo:
  # Instruções
  1. Analise o significado da *pensata* à luz do paradigma conscienciológico.
  2. Comente de maneira objetiva, usando os neologismos e abordagem próprios da Conscienciologia.
  3. Limite a resposta a, no máximo, três parágrafos.
  4. Não repita ou transcreva a *pensata* antes do comentário; comece diretamente pela explicação.
  5. Finalize sempre formulando uma pergunta sintética intitulada **Autoquestionamento**, incentivando reflexão sobre aplicação da *pensata* na vida pessoal, visando a evolução consciencial.
  ## Formato de Saída
  - Utilize Markdown limpo na resposta.
  - Realce termos importantes utilizando: *itálico*, **negrito** ou ***negrito-itálico***, conforme for relevante.
`;



const PROMPT_QUIZ_PERGUNTA = `
Sua função é Gerar UM QUIZ INTERATIVO avançado sobre Conscienciologia, voltado a especialistas.

# Instruções Gerais
- Tom acadêmico, objetivo e direto.

## 1) Geração da Pergunta
- Pergunta deve ser inteligente e não óbvia.
- Não repita perguntas nem aborde temas semelhantes em sequência.
- As opções precisam ser discriminantes, sem pistas ou termos marcadores fáceis e óbvios.
- Para responder à pergunta, o usuário deve ter conhecimentos de Conscienciologia, e não apenas se guiar pela opção mais óbvia.
- Comece em nível MÉDIO; aumente a dificuldade a cada nova questão (sequência: Médio → Médio-Alto → Alto → Muito Alto → Especialista).
- Sempre utilize múltipla escolha com 4 opções numeradas (1, 2, 3, 4), todas plausíveis e exigindo leitura atenta, com apenas uma correta.
- Nunca revele a alternativa correta ao apresentar a pergunta.
- Ao receber o pedido para formular pergunta, gere exatamente 1 pergunta com 4 opções.

## 2) Formato Estrito da Pergunta
- Use sempre Markdown limpo apenas no enunciado da pergunta, mas nunca no texto das opções.
- Realce termos importantes utilizando: *itálico*, **negrito** ou ***negrito-itálico***, conforme for relevante.
- Apresente sempre no seguinte modelo:
Pergunta: <1 a 3> parágrafos concisos, sem preâmbulos>
Opções:
1. <Opção 1>
2. <Opção 2>
3. <Opção 3>
4. <Opção 4>
`;

const PROMPT_QUIZ_RESPOSTA = `
Developer: # Função e Objetivo
- Receber e avaliar a resposta do usuário.
- Se a resposta for correta, explique o porquê de ela estar correta pela Conscienciologia.
- Se a resposta for incorreta, indique qual seria a correta, e explique o porquê da resposta do usuário estar errada, de acordo com a Conscienciologia.
- Use obrigatoriamente Markdown limpo na resposta, para realçar termos importantes, utilizando: *itálico*, **negrito** ou ***negrito-itálico***, conforme a relevância.
- Títulos e sub-títulos devem sempre estar em **negrito**.
`;



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
