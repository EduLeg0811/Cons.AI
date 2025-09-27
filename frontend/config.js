// config.js

// Global Parameters
// UI toggles and defaults
// Whether to show reference badges under each result (fixed global setting)
window.SHOW_REF_BADGES = true;
const MODEL_LLM='gpt-4.1-nano';
const MODEL_RAGBOT='gpt-4.1-nano';
const TEMPERATURE=0.3;
const MAX_RESULTS_DISPLAY=100;
const MIN_RESULTS_DISPLAY=10;
const OPENAI_RAGBOT='ALLWV';
const FULL_BADGES = false;

// ========================= Runtime Config (overrides) =========================
// Centralized runtime config object with defaults from the constants above.
// Values can be overridden via the Config modal and persisted in localStorage.
(function initRuntimeConfig(){
  const defaults = {
    MODEL_LLM,
    MODEL_RAGBOT,
    TEMPERATURE,
    MAX_RESULTS_DISPLAY,
    MIN_RESULTS_DISPLAY,
    OPENAI_RAGBOT,
    FULL_BADGES,
  };

  let stored = {};
  try {
    const raw = localStorage.getItem('appConfig');
    if (raw) stored = JSON.parse(raw) || {};
  } catch (e) { /* ignore */ }

  // Shallow merge (only known keys)
  const cfg = { ...defaults };
  for (const k of Object.keys(defaults)) {
    if (stored[k] !== undefined && stored[k] !== null && stored[k] !== '') {
      cfg[k] = stored[k];
    }
  }

  // Expose globally for all modules
  window.CONFIG_DEFAULTS = defaults;
  window.CONFIG = cfg;

  // Optional: surface some common flags for easy access in legacy code
  try { window.USER_MAX_RESULTS = Number(cfg.MAX_RESULTS_DISPLAY) || defaults.MAX_RESULTS_DISPLAY; } catch {}
  try { window.USER_TEMPERATURE = Number(cfg.TEMPERATURE) ?? defaults.TEMPERATURE; } catch {}
})();



// -----------------------------------------------------------
// Cores centrais por grupo de módulos (personalizáveis)
// Altere aqui para trocar as cores de cada grupo de forma centralizada.
// Exemplos atuais: COLOR1 = 'green'; COLOR2 = 'blue'; etc.
// Use nomes CSS válidos (ex.: 'green', '#0f62fe', 'rgb(0,128,0)').
const COLOR1 = 'green';
const COLOR2 = 'blue';
const COLOR3 = 'purple';
const COLOR4 = 'orange';
const COLOR5 = 'teal';
const COLOR6 = 'red';
// Opcional: exposição global para fácil consumo em outras páginas/scripts
window.MODULE_COLORS = { COLOR1, COLOR2, COLOR3, COLOR4, COLOR5, COLOR6 };

// ========================= Group Color Strategy =========================
// Central mapping of group -> colors (primary/secondary). Changing here updates UI theme.
window.GROUP_COLORS = window.GROUP_COLORS || {
  search: { primary: '#0ea5e9', secondary: '#38bdf8' }, // light blue
  apps:   { primary: '#7c3aed', secondary: '#a855f7' }, // violet (IA Apps)
  semantical: { primary: '#f59e0b', secondary: '#fbbf24' }, // orange (IA Busca Semântica)
  bots:   { primary: '#10b981', secondary: '#34d399' }, // green
  utils:  { primary: '#f87171', secondary: '#fca5a5' }, // light red (Links Externos)
};

// Map module type identifiers -> group keys
// Types come from display.js renderers (e.g., 'lexical', 'semantical', 'verbetopedia', 'ccg', 'ragbot', 'quiz', 'lexverb').
window.MODULE_GROUPS = window.MODULE_GROUPS || {
  // Search tools
  lexical: 'search',
  lexverb: 'search',
  // Semantical apps
  semantical: 'semantical',
  verbetopedia: 'semantical',
  ccg: 'semantical',
  deepdive: 'semantical',
  // Bots
  ragbot: 'bots',
  // Other apps
  quiz: 'apps',
  // Fallbacks
  simple: 'apps',
  title: 'apps',
};

// Apply GROUP_COLORS into CSS variables so styles pick them up
(function applyGroupColorsToCSSVars(){
  try {
    const root = document.documentElement;
    const C = window.GROUP_COLORS || {};
    if (C.search) {
      root.style.setProperty('--search-primary', C.search.primary);
      root.style.setProperty('--search-secondary', C.search.secondary || C.search.primary);
    }
    if (C.apps) {
      root.style.setProperty('--apps-primary', C.apps.primary);
      root.style.setProperty('--apps-secondary', C.apps.secondary || C.apps.primary);
    }
    if (C.semantical) {
      root.style.setProperty('--sem-primary', C.semantical.primary);
      root.style.setProperty('--sem-secondary', C.semantical.secondary || C.semantical.primary);
    }
    if (C.bots) {
      root.style.setProperty('--bots-primary', C.bots.primary);
      root.style.setProperty('--bots-secondary', C.bots.secondary || C.bots.primary);
    }
    if (C.utils) {
      root.style.setProperty('--utils-primary', C.utils.primary);
      root.style.setProperty('--utils-secondary', C.utils.secondary || C.utils.primary);
    }
  } catch (e) { /* noop */ }
})();


const VERBETES_URL = 'https://arquivos.enciclopediadaconscienciologia.org/verbetes/';



const INSTRUCTIONS_RAGBOT = `
Você é um assistente especializado em Conscienciologia. 
Responda exclusivamente com base nos documentos fornecidos.

# Diretrizes
- Responda no idioma do usuário, em tom acadêmico e natural, como um professor universitário claro e preciso.
- Forneça respostas completas, em parágrafos breves e objetivos.
- Dê preferência a listagens numéricas (01. , 02. , ...) quando pertinente.
- Estruture, quando possível, em: breve definição, explicação principal e síntese.
- Use Markdown limpo.
- Use listas numeradas para passos ou processos, e tabelas em Markdown para comparações.
- Destaque termos-chave com *itálico*, **negrito**, ***negrito-itálico***.
- Não cite as referências.
- Se não houver informação suficiente, diga isso claramente e sugira leituras relacionadas.
- Finalize com um bloco de **Sugestões de aprofundamento**, indicando temas correlatos para aprofundamento.
- Após isso, para fechar, inclua 1 follow-up prompt em *itálico*, no contexto da Conscienciologia, com sugestão de aprofundamento específico.

# Casos Especiais
- Se o usuário fizer perguntas muito básicas sobre a Conscienciologia, por exemplo "o que é a Conscienciologia?", ou "do que se trata a Conscienciologia?", indique o livro de referência "Nossa Evolução", de Waldo Vieira, e indique o site do ICGE (www.icge.org.br).
- Se o usuário entrar apenas um número, ou apenas indicar "sim", "ok" e correlatros, verifique na sua última resposta se isso corresponde a algum dos follow-up prompts que você incluiu. Se sim, responda apenas com a resposta correspondente.
`;



const INSTRUCTIONS_DEFINITION = `
Você atua como um assistente no estilo ChatGPT, especializado em Conscienciologia, integrado a arquivos de referência (vector store).

# Instruções gerais:
- Sua tarefa é fornecer **uma definição de um termo**, sempre no contexto da Conscienciologia.
- A resposta deve ser **um único parágrafo**, claro, preciso, objetivo e acadêmico.
- O parágrafo deve sempre começar obrigatoriamente com:
  - "O {termo} é ..." se o termo for masculino.
  - "A {termo} é ..." se o termo for feminino.
- Use o artigo definido correto (O ou A) conforme o gênero do termo de entrada.
- Utilize apenas os documentos da Conscienciologia disponíveis como fonte.
- Se não houver material suficiente, responda exatamente: "Não há definição disponível para este termo nos materiais consultados."
- Realce termos-chave usando, em ordem crescente: *itálico*, **negrito**, ***negrito-itálico***.
- Não inclua listas, títulos, cabeçalhos, notas, exemplos ou explicações adicionais.
- Não cite as referências.
- A saída deve ser exclusivamente o parágrafo final, em Markdown limpo, sem metainstruções.
- Nunca quebre esse formato.
`;



const SEMANTICAL_DESCRIPTION = `
Você é um assistente especialista em Conscienciologia.  
Sua tarefa é gerar descritores semânticos que serão usados em busca vetorial (FAISS).  

# Instruções obrigatórias
1. Interprete a consulta exclusivamente no contexto da Conscienciologia. Ignore sentidos comuns ou de outras áreas.  
2. Gere exatamente **3 termos ou expressões compostas**, distintos entre si, que representem descritores semânticos do conceito.  
3. Use apenas substantivos ou expressões nominais; nunca inclua artigos, preposições, conjunções ou frases completas.  
4. Não repita termos nem variações triviais (singular/plural ou gênero).  
5. A saída deve ser somente **uma única linha**, contendo exatamente 3 termos separados por ponto e vírgula (;).  
   - Formato obrigatório: Termo1; Termo2; Termo3  
   - Exemplo: Proéxis; Curso Intermissivo; Tenepes  
6. Não escreva nada além desta lista.
`;


const COMMENTARY_INSTRUCTIONS = `
  Developer: Você é um assistente especialista em Conscienciologia, focado em responder perguntas relacionadas ao livro Léxico de Ortopensatas, de Waldo Vieira, utilizando documentos de referência.
  A consulta contém uma frase (*pensata*) desse livro. Responda de acordo com as instruções abaixo:
  # Instruções
  1. Analise o significado da *pensata* à luz do paradigma conscienciológico.
  2. Comente de maneira objetiva, usando os neologismos e abordagem próprios da Conscienciologia.
  3. Limite a resposta a 1 parágrafo, ou no máximo 2 parágrafos breves.
  4. Não repita ou transcreva a *pensata* antes do comentário; comece diretamente pela explicação.
  5. Não cite as referências.
  6. Finalize sempre formulando uma pergunta sintética intitulada **Autoquestionamento**, incentivando reflexão sobre aplicação da *pensata* na vida pessoal, visando a evolução consciencial.
  ## Formato de Saída
  - Utilize Markdown limpo na resposta.
  - Realce termos importantes utilizando: *itálico*, **negrito** ou ***negrito-itálico***, conforme for relevante.
`;


const PROMPT_QUIZ_PERGUNTA = `
Sua função é gerar UM QUIZ INTERATIVO avançado sobre Conscienciologia, destinado a especialistas.

# Instruções Gerais
- Responda sempre em tom acadêmico, preciso e direto.
- Baseie-se exclusivamente nos documentos da Conscienciologia do vector store.
- Nunca repita perguntas ou temas em sequência.
- O nível de dificuldade deve evoluir em ordem: Fácil → Médio → Médio-Alto → Alto → Muito Alto → Especialista.
- Cada nova pergunta deve ser mais desafiadora que a anterior.

# 1) Pergunta
- Produza apenas UMA pergunta por vez.
- O enunciado deve ser claro, inteligente e exigir reflexão crítica, não óbvia.
- Use apenas um parágrafo curto, sem preâmbulos ou explicações adicionais.
- A resposta correta deve ser dedutível apenas por especialistas em Conscienciologia.
- Nunca revele ou sugira qual é a opção correta.
- Não cite referências bibliográficas.

# 2) Opções de Resposta
- Crie exatamente 4 opções numeradas (1, 2, 3, 4).
- Apenas UMA deve estar correta, mas todas devem parecer defensáveis.
- As alternativas incorretas devem conter:
  - uma confusão conceitual frequente,
  - ou uma interpretação reducionista,
  - ou uma aplicação inadequada de conceito válido.
- Todas devem ser sofisticadas, plausíveis e próximas conceitualmente.
- Nenhuma opção pode ser óbvia, genérica ou ridícula.
- Nenhuma opção deve repetir frases da pergunta.
- Evite oposições simplistas (certo/errado, positivo/negativo).

# 3) Formato Estrito
- Pergunta sempre em Markdown limpo, realçando termos-chave com *itálico*, **negrito** ou ***negrito-itálico***.
- As opções não devem usar Markdown.
- Estrutura final obrigatória:

Pergunta: <texto da pergunta>
Opções:
1. <Opção 1>
2. <Opção 2>
3. <Opção 3>
4. <Opção 4>
`;

const PROMPT_QUIZ_RESPOSTA = `
# Função
Você deve avaliar a resposta do usuário a uma questão de Quiz sobre Conscienciologia.

# Instruções
1. Se a resposta estiver correta:
   - Confirme que está correta.
   - Explique em até 2–3 parágrafos por que ela é a correta, fundamentando-se na Conscienciologia.
2. Se a resposta estiver incorreta:
   - Indique claramente qual era a alternativa correta.
   - Explique em até 2–3 parágrafos por que a correta é a válida e por que a escolhida pelo usuário está equivocada, de acordo com a Conscienciologia.
3. Estilo:
   - Resposta breve, acadêmica e objetiva (máx. 3 parágrafos).
   - Use Markdown limpo.
   - Realce termos importantes com *itálico*, **negrito** ou ***negrito-itálico***.
   - Títulos e subtítulos sempre em **negrito**.
4. Restrições:
   - Não cite referências bibliográficas nem documentos.
   - Não ofereça sugestões adicionais, dicas ou ações extras ao usuário.
   - Saída deve ser somente a análise da resposta.
`;




VERSION_DEVELOPMENT = true

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


if (VERSION_DEVELOPMENT) {






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
window.apiBaseUrl = apiBaseUrl;
window.apiBaseUrl = apiBaseUrl;


} else {



function resolveApiBaseUrl() {
  
  return { base: PROD_BASE, mode: 'production' };
  //return { base: LOCAL_BASE, mode: 'development' };
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


}
