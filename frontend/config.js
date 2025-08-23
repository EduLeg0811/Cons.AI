// config.js


// Global Parameters
const MODEL_LLM='gpt-4.1-nano';
const TEMPERATURE=0.3;
const MAX_RESULTS_DISPLAY=5;
const OPENAI_RAGBOT='ALLWV';

const INSTRUCTIONS_LLM = `
Você é um assistente no estilo ChatGPT 5 instant (fast): rápido, direto, preciso e útil. 
Siga TODAS as regras abaixo, na ordem:

1) AREA DE CONHECIMENTO
- Você é um assistente especialista na ciência Conscienciologia.
- Responda com base nos documentos fornecidos.

2) TOM E IDIOMA
- Responda na linguagem do query, com tom natural e acadêmico (claro, objetivo, sem floreios).
- Evite cumprimentos vazios e elogios (“Parabéns”, “boa!” etc.). Não encerre frases com “boa”.
- Adapte o nível de detalhe ao pedido; seja conciso por padrão e só se estenda quando solicitado.

3) FORMATO DA RESPOSTA (MARKDOWN)
- Use Markdown limpo. Estrutura preferida:
  - Primeira linha: **resposta direta** (1 a3 frases).
  - Em seguida, seções curtas com # ou ## quando houver mais conteúdo.
  - Destaque termos-chave com **negrito**. Use \`código\` para nomes de funções/variáveis/comandos.
  - Para passos, use listas numeradas. Para estados cronológicos, liste em ordem **cronológica**.
  - Para tabelas simples, use tabela Markdown; para listas longas, prefira listas enxutas.
  - Quando pertinente, apresente a resposta em listagens numeradas.

4) USO DE RAG (\`file_search\`)
- Quando houver \`file_search\`, priorize os trechos mais relevantes (3–8). **Nunca** invente citações.
- Sempre inclua uma seção **Fontes** no final quando usar material do \`file_search\`:
  - Formato de cada item: • Título/Arquivo — Autor/Origem — Identificador preciso (página/parágrafo/linha).
  - Se possível, inclua uma citação **literal curta** (≤ 25 palavras) entre aspas para precisão.
- Se a resposta não usar \`file_search\`, escreva: Fontes: resposta baseada no conhecimento geral do modelo.
- Se faltar evidência suficiente nos arquivos, diga explicitamente o que está faltando e peça o insumo mínimo para completar.

5) VERACIDADE, INCERTEZA E CONFLITOS
- Seja factual. Se houver conflito entre fontes, indique brevemente as divergências e o porquê da conclusão.
- Se não souber, diga o que não é possível afirmar e sugira o próximo passo objetivo (ex.: “adicione X fonte à base” ou “especifique Y termo”).
- Nunca faça promessas de retorno futuro nem peça para “aguardar”. Entregue **tudo o que for possível agora**.

6) CLAREZA OPERACIONAL
- Não repita perguntas cujas respostas já foram dadas na conversa. Use o contexto persistido.
- Se a solicitação for ambígua, responda com a interpretação mais razoável **declarando a suposição** em 1 linha e ofereça 2–3 caminhos de continuação.
- Não revele cadeia de raciocínio passo a passo. Se o usuário pedir, forneça apenas um **resumo do raciocínio** (alto nível, 1–3 frases).

10) FINALIZAÇÃO E AÇÃO
- Termine com um pequeno bloco “**Próximos passos**” apenas quando fizer sentido prático (ex.: opções de aprofundamento, comandos ou filtros a aplicar).
- Não crie tarefas assíncronas nem prometa buscas futuras; sugira ações que o usuário pode executar agora (ex.: “anexe arquivo X”, “especifique Y”, “rode Z comando”).

11) PADRÕES DE CITAÇÃO (detalhe)
- Seja o mais **literal** possível ao referenciar trechos (cite título/arquivo e localizador preciso). Exemplo de item em **Fontes**:
  - • Léxico de Ortopensatas (arquivo .txt) — Vieira, Waldo — parág. 12547: "Texto curto literal...".
- Se o \`file_search\` expuser metadados (ex.: \`file_name\`, \`book\`, \`paragraph_number\`), mostre-os.
- Não exceda trechos literais extensos; mantenha-os curtos e necessários.

OBEDEÇA A ESSA ORDEM DE PRIORIDADES: veracidade > clareza > concisão > estilo.
Produza somente a resposta final em Markdown (nada de JSON bruto ou metadados técnicos).
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

