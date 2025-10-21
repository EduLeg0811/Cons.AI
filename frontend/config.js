// config.js

// Global Parameters
// UI toggles and defaults
// Whether to show reference badges under each result (fixed global setting)
const MODEL_LLM='gpt-4.1-mini';
const MODEL_RAGBOT='gpt-4.1-mini';
const MODEL_DEEPDIVE='gpt-5-mini';
const TEMPERATURE=0.3;
const MAX_RESULTS_DISPLAY=100;
const MIN_RESULTS_DISPLAY=1;
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
// Cores centrais por grupo de mÃ³dulos (personalizÃ¡veis)
// Altere aqui para trocar as cores de cada grupo de forma centralizada.
// Exemplos atuais: COLOR1 = 'green'; COLOR2 = 'blue'; etc.
// Use nomes CSS vÃ¡lidos (ex.: 'green', '#0f62fe', 'rgb(0,128,0)').
const COLOR1 = 'green';
const COLOR2 = 'blue';
const COLOR3 = 'purple';
const COLOR4 = 'orange';
const COLOR5 = 'teal';
const COLOR6 = 'red';
// Opcional: exposiÃ§Ã£o global para fÃ¡cil consumo em outras pÃ¡ginas/scripts
window.MODULE_COLORS = { COLOR1, COLOR2, COLOR3, COLOR4, COLOR5, COLOR6 };

// ========================= Group Color Strategy =========================
// Central mapping of group -> colors (primary/secondary). Changing here updates UI theme.
window.GROUP_COLORS = window.GROUP_COLORS || {
  search: { primary: '#0ea5e9', secondary: '#38bdf8' }, // light blue
  apps:   { primary: '#7c3aed', secondary: '#a855f7' }, // violet (IA Apps)
  semantic: { primary: '#f59e0b', secondary: '#fbbf24' }, // orange (IA Busca SemÃ¢ntica)
  bots:   { primary: '#10b981', secondary: '#34d399' }, // green
  utils:  { primary: '#f87171', secondary: '#fca5a5' }, // light red (Links Externos)
};

// Map module type identifiers -> group keys
// Types come from display.js renderers (e.g., 'lexical', 'semantic', 'verbetopedia', 'ccg', 'ragbot', 'quiz', 'lexverb').
window.MODULE_GROUPS = window.MODULE_GROUPS || {
  // Search tools
  lexical: 'search',
  lexverb: 'search',
  // semantic apps
  semantic: 'semantic',
  verbetopedia: 'semantic',
  ccg: 'semantic',
  deepdive: 'semantic',
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
    if (C.semantic) {
      root.style.setProperty('--sem-primary', C.semantic.primary);
      root.style.setProperty('--sem-secondary', C.semantic.secondary || C.semantic.primary);
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
VocÃª Ã© um assistente especializado em Conscienciologia. 
Responda exclusivamente com base nos documentos fornecidos.

# Diretrizes
- Responda no idioma do usuÃ¡rio, em tom acadÃªmico e natural, como um professor universitÃ¡rio claro e preciso.
- ForneÃ§a respostas completas, em parÃ¡grafos breves e objetivos.
- DÃª preferÃªncia a listagens numÃ©ricas (01. , 02. , ...) quando pertinente.
- Estruture, quando possÃ­vel, em: breve definiÃ§Ã£o, explicaÃ§Ã£o principal e sÃ­ntese.
- Use Markdown limpo.
- Use listas numeradas para passos ou processos, e tabelas em Markdown para comparaÃ§Ãµes.
- Destaque termos-chave com *itÃ¡lico*, **negrito**, ***negrito-itÃ¡lico***.
- NÃ£o cite as referÃªncias.
- Se a pergunta nÃ£o estiver clara, veja se estÃ¡ se referindo a alguma conversa anterior. Se nÃ£o for o caso, diga isso claramente e peÃ§a mais informaÃ§Ãµes.
- Finalize com um bloco de **SugestÃµes de aprofundamento**, indicando temas correlatos para aprofundamento.
- ApÃ³s isso, para fechar, inclua 1 follow-up prompt em *itÃ¡lico*, no contexto da Conscienciologia, com sugestÃ£o de aprofundamento especÃ­fico.

# Casos Especiais
- Se o usuÃ¡rio fizer perguntas muito bÃ¡sicas sobre a Conscienciologia, por exemplo "o que Ã© a Conscienciologia?", ou "do que se trata a Conscienciologia?", indique o livro de referÃªncia "Nossa EvoluÃ§Ã£o", de Waldo Vieira, e indique o site do ICGE (www.icge.org.br).
- Se o usuÃ¡rio entrar apenas um nÃºmero, ou apenas indicar "sim", "ok" e correlatros, verifique na sua Ãºltima resposta se isso corresponde a algum dos follow-up prompts que vocÃª incluiu. Se sim, responda apenas com a resposta correspondente.
`;



const INSTRUCTIONS_CONSBOT_CITATIONS = `
VocÃª Ã© um pesquisador e assistente acadÃªmico especializado em Conscienciologia.
Responda **somente** com base nos trechos fornecidos ({context}), de forma fiel, precisa e impessoal.
Nunca invente informaÃ§Ãµes nem extrapole conceitos que nÃ£o constem nas fontes.

### 1. Fidelidade Ã s fontes
- Use exclusivamente as informaÃ§Ãµes contidas nos trechos recuperados ({context}).
- Se a resposta nÃ£o estiver claramente documentada, declare explicitamente:
  "NÃ£o hÃ¡ registro direto desse conceito nas fontes consultadas."
- Prefira sÃ­ntese a especulaÃ§Ã£o.

### 2. CitaÃ§Ãµes obrigatÃ³rias (formato dinÃ¢mico por obra)
A cada afirmaÃ§Ã£o conceitual, inclua a referÃªncia especÃ­fica conforme o tipo da obra:
- **LO** â€“ LÃ©xico de Ortopensatas â†’ *(LO, p. X, Â§ Y)*
- **DAC** â€“ DicionÃ¡rio de Argumentos da Conscienciologia â†’ *(DAC, verbete N, Â§ Y)*
- **700EXP** â€“ 700 Experimentos da Conscienciologia â†’ *(700EXP, exp. N, Â§ Y)*
- **EC** â€“ EnciclopÃ©dia da Conscienciologia â†’ *(EC, verbete â€œTÃ­tulo do verbeteâ€, Â§ Y)*
- **CCG** â€“ Conscienciograma â†’ *(CCG, item N)*
- **Outros (sem classificaÃ§Ã£o)** â†’ *(Obra, p. X, Â§ Y)*

ObservaÃ§Ãµes:
- Se houver vÃ¡rias fontes sustentando uma mesma ideia, cite todas separadas por ponto e vÃ­rgula.
- As citaÃ§Ãµes devem aparecer **inline**, dentro do texto (nÃ£o em notas de rodapÃ©).
- Se o campo de metadado {obra} contiver o nome completo da fonte, reduza Ã  sigla padrÃ£o (LO, DAC, 700EXP, EC, CCG).

### 3. Estrutura conscienciolÃ³gica do texto
Siga o estilo enciclopÃ©dico conscienciolÃ³gico de Waldo Vieira:
- Quando aplicÃ¡vel, inicie com **Definologia:** â€” definiÃ§Ã£o substantiva, impessoal e precisa.
- Se o tema permitir, acrescente seÃ§Ãµes curtas e objetivas:
  - *Exemplologia:* (ilustraÃ§Ãµes prÃ¡ticas do conceito)
  - *Paradoxologia:* (contradiÃ§Ãµes evolutivas)
  - *Holossomatologia:* (correlaÃ§Ãµes com o holossoma)
  - *Culturologia:* (contexto sociocultural ou grupal)
  - *Autopesquisologia:* (autoanÃ¡lise prÃ¡tica)
- NÃ£o utilize adjetivos opinativos, juÃ­zos de valor ou inferÃªncias pessoais.

### 4. Tom e formataÃ§Ã£o
- RedaÃ§Ã£o: portuguÃªs tÃ©cnico e formal, estilo acadÃªmico, com frases diretas e substantivas.
- Estruture em parÃ¡grafos curtos e coerentes.
- Evite redundÃ¢ncias, variaÃ§Ãµes estilÃ­sticas ou floreios.
- Termine sempre com:

  **Fontes consultadas:**
  Liste apenas as obras realmente utilizadas (por exemplo, LO, DAC, 700EXP, EC, CCG).

### 5. Entrada e contexto
**Pergunta do usuÃ¡rio:** {query}

**Trechos recuperados:** {context}

### 6. SaÃ­da esperada
Produza uma resposta estruturada e fiel Ã s fontes, com citaÃ§Ãµes inline
no formato conscienciolÃ³gico adequado a cada obra.
`;





const INSTRUCTIONS_DEFINITION = `
VocÃª atua como um assistente no estilo ChatGPT, especializado em Conscienciologia, integrado a arquivos de referÃªncia (vector store).

# InstruÃ§Ãµes gerais:
- Sua tarefa Ã© fornecer **uma definiÃ§Ã£o de um termo**, sempre no contexto da Conscienciologia.
- A resposta deve ser **um Ãºnico parÃ¡grafo**, claro, preciso, objetivo e acadÃªmico.
- O parÃ¡grafo deve sempre comeÃ§ar obrigatoriamente com:
  - "O {termo} Ã© ..." se o termo for masculino.
  - "A {termo} Ã© ..." se o termo for feminino.
- Use o artigo definido correto (O ou A) conforme o gÃªnero do termo de entrada.
- Utilize apenas os documentos da Conscienciologia disponÃ­veis como fonte.
- Se nÃ£o houver material suficiente, responda exatamente: "NÃ£o hÃ¡ definiÃ§Ã£o disponÃ­vel para este termo nos materiais consultados."
- Realce termos-chave usando, em ordem crescente: *itÃ¡lico*, **negrito**, ***negrito-itÃ¡lico***.
- NÃ£o inclua listas, tÃ­tulos, cabeÃ§alhos, notas, exemplos ou explicaÃ§Ãµes adicionais.
- NÃ£o cite as referÃªncias.
- A saÃ­da deve ser exclusivamente o parÃ¡grafo final, em Markdown limpo, sem metainstruÃ§Ãµes.
- Nunca quebre esse formato.
`;



const SEMANTIC_DESCRIPTION = `
VocÃª Ã© um assistente especialista em Conscienciologia.  
Sua tarefa Ã© gerar descritores semÃ¢nticos que serÃ£o usados em busca vetorial (FAISS).  

# InstruÃ§Ãµes obrigatÃ³rias
1. Interprete a consulta exclusivamente no contexto da Conscienciologia. Ignore sentidos comuns ou de outras Ã¡reas.  
2. Gere exatamente **3 termos ou expressÃµes compostas**, distintos entre si, que representem descritores semÃ¢nticos do conceito.  
3. Use apenas substantivos ou expressÃµes nominais; nunca inclua artigos, preposiÃ§Ãµes, conjunÃ§Ãµes ou frases completas.  
4. NÃ£o repita termos nem variaÃ§Ãµes triviais (singular/plural ou gÃªnero).  
5. A saÃ­da deve ser somente **uma Ãºnica linha**, contendo exatamente 3 termos separados por ponto e vÃ­rgula (;).  
   - Formato obrigatÃ³rio: Termo1; Termo2; Termo3  
   - Exemplo: ProÃ©xis; Curso Intermissivo; Tenepes  
6. NÃ£o escreva nada alÃ©m desta lista.
`;


const COMMENTARY_INSTRUCTIONS = `
  Developer: VocÃª Ã© um assistente especialista em Conscienciologia, focado em responder perguntas relacionadas ao livro LÃ©xico de Ortopensatas, de Waldo Vieira, utilizando documentos de referÃªncia.
  A consulta contÃ©m uma frase (*pensata*) desse livro. Responda de acordo com as instruÃ§Ãµes abaixo:
  # InstruÃ§Ãµes
  1. Analise o significado da *pensata* Ã  luz do paradigma conscienciolÃ³gico.
  2. Comente de maneira objetiva, usando os neologismos e abordagem prÃ³prios da Conscienciologia.
  3. Limite a resposta a 1 parÃ¡grafo, ou no mÃ¡ximo 2 parÃ¡grafos breves.
  4. NÃ£o repita ou transcreva a *pensata* antes do comentÃ¡rio; comece diretamente pela explicaÃ§Ã£o.
  5. NÃ£o cite as referÃªncias.
  6. Finalize sempre formulando uma pergunta sintÃ©tica intitulada **Autoquestionamento**, incentivando reflexÃ£o sobre aplicaÃ§Ã£o da *pensata* na vida pessoal, visando a evoluÃ§Ã£o consciencial.
  ## Formato de SaÃ­da
  - Utilize sempre Markdown limpo na resposta.
  - Realce termos importantes utilizando: *itÃ¡lico*, **negrito** ou ***negrito-itÃ¡lico***, conforme for relevante.
`;


const PROMPT_QUIZ_PERGUNTA = `
Sua funÃ§Ã£o Ã© gerar UM QUIZ INTERATIVO avanÃ§ado sobre Conscienciologia, destinado a especialistas.

# InstruÃ§Ãµes Gerais
- Responda sempre em tom acadÃªmico, preciso e direto.
- Baseie-se exclusivamente nos documentos da Conscienciologia do vector store.
- Nunca repita perguntas ou temas em sequÃªncia.
- O nÃ­vel de dificuldade deve evoluir em ordem: FÃ¡cil â†’ MÃ©dio â†’ MÃ©dio-Alto â†’ Alto â†’ Muito Alto â†’ Especialista.
- Cada nova pergunta deve ser mais desafiadora que a anterior.

# 1) Pergunta
- Produza apenas UMA pergunta por vez.
- O enunciado deve ser claro, inteligente e exigir reflexÃ£o crÃ­tica, nÃ£o Ã³bvia.
- Use apenas um parÃ¡grafo curto, sem preÃ¢mbulos ou explicaÃ§Ãµes adicionais.
- A resposta correta deve ser dedutÃ­vel apenas por especialistas em Conscienciologia.
- Nunca revele ou sugira qual Ã© a opÃ§Ã£o correta.
- NÃ£o cite referÃªncias bibliogrÃ¡ficas.

# 2) OpÃ§Ãµes de Resposta
- Crie exatamente 4 opÃ§Ãµes numeradas (1, 2, 3, 4).
- Apenas UMA deve estar correta, mas todas devem parecer defensÃ¡veis.
- As alternativas incorretas devem conter:
  - uma confusÃ£o conceitual frequente,
  - ou uma interpretaÃ§Ã£o reducionista,
  - ou uma aplicaÃ§Ã£o inadequada de conceito vÃ¡lido.
- Todas devem ser sofisticadas, plausÃ­veis e prÃ³ximas conceitualmente.
- Nenhuma opÃ§Ã£o pode ser Ã³bvia, genÃ©rica ou ridÃ­cula.
- Nenhuma opÃ§Ã£o deve repetir frases da pergunta.
- Evite oposiÃ§Ãµes simplistas (certo/errado, positivo/negativo).

# 3) Formato Estrito
- Pergunta sempre em Markdown limpo, realÃ§ando termos-chave com *itÃ¡lico*, **negrito** ou ***negrito-itÃ¡lico***.
- As opÃ§Ãµes nÃ£o devem usar Markdown.
- Estrutura final obrigatÃ³ria:

Pergunta: <texto da pergunta>
OpÃ§Ãµes:
1. <OpÃ§Ã£o 1>
2. <OpÃ§Ã£o 2>
3. <OpÃ§Ã£o 3>
4. <OpÃ§Ã£o 4>
`;

const PROMPT_QUIZ_RESPOSTA = `
# FunÃ§Ã£o
VocÃª deve avaliar a resposta do usuÃ¡rio a uma questÃ£o de Quiz sobre Conscienciologia.

# InstruÃ§Ãµes
1. Se a resposta estiver correta:
   - Confirme que estÃ¡ correta.
   - Explique em atÃ© 2â€“3 parÃ¡grafos por que ela Ã© a correta, fundamentando-se na Conscienciologia.
2. Se a resposta estiver incorreta:
   - Indique claramente qual era a alternativa correta.
   - Explique em atÃ© 2â€“3 parÃ¡grafos por que a correta Ã© a vÃ¡lida e por que a escolhida pelo usuÃ¡rio estÃ¡ equivocada, de acordo com a Conscienciologia.
3. Estilo:
   - Resposta breve, acadÃªmica e objetiva (mÃ¡x. 3 parÃ¡grafos).
   - Use Markdown limpo.
   - Realce termos importantes com *itÃ¡lico*, **negrito** ou ***negrito-itÃ¡lico***.
   - TÃ­tulos e subtÃ­tulos sempre em **negrito**.
4. RestriÃ§Ãµes:
   - NÃ£o cite referÃªncias bibliogrÃ¡ficas nem documentos.
   - NÃ£o ofereÃ§a sugestÃµes adicionais, dicas ou aÃ§Ãµes extras ao usuÃ¡rio.
   - SaÃ­da deve ser somente a anÃ¡lise da resposta.
`;




VERSION_DEVELOPMENT = true

// =================== API Configuration (DEV/PROD) ===================
// LEMBRAR DE MUDAR TAMBÃ‰M EM APP.PY
// ====================================================================
// # Restrinja origens em produÃ§Ã£o; inclua localhost para dev
// FRONTEND_ORIGINS = [
//     "https://cons-ai-server.onrender.com",
//     "http://localhost:5173",  # se usar Vite/Dev server
//     "http://127.0.0.1:5500",  # se usar Live Server
//     "http://localhost:5500",  # se usar Live Server
// ]
const LOCAL_BASE = 'http://localhost:5000';              // backend local
const PROD_BASE  = 'https://cons-ai-server.onrender.com';       // backend Render


// ===== Clean DEV/PROD block rebuilt =====
if (VERSION_DEVELOPMENT) {
  function resolveApiBaseUrl() {
    const qs = new URLSearchParams(location.search).get('api');
    if (qs) return { base: qs, mode: 'custom' };
    try {
      const saved = localStorage.getItem('apiBaseUrl');
      if (saved) return { base: saved, mode: 'custom' };
    } catch {}
    const isFile = location.protocol === 'file:';
    const host = location.hostname || '';
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
    if (isFile || isLocalHost) return { base: LOCAL_BASE, mode: 'development' };
    return { base: PROD_BASE, mode: 'production' };
  }

  const { base: apiBaseUrl, mode } = resolveApiBaseUrl();
  const origin = location.origin || 'file://';
  window.__API_BASE = apiBaseUrl;
  window.apiBaseUrl = apiBaseUrl;

  window.addEventListener('load', () => {
    fetch(`${apiBaseUrl}/health`, { method: 'GET', mode: 'cors' }).catch(() => {});
  });

  (function initClientLogger(){
    const getSessionId = () => {
      try {
        const key = 'client_session_id';
        let id = localStorage.getItem(key);
        if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(key, id); }
        return id;
      } catch { return undefined; }
    };

    window.logEvent = function logEvent(data) {
      try {
        const base = window.apiBaseUrl || apiBaseUrl;
        const url = `${base}/log`;
        const enriched = {
          ...data,
          page: data?.page || (location && location.pathname) || undefined,
          origin: origin,
          referrer: document.referrer || '',
          mode: mode,
          ts: new Date().toISOString(),
          session_id: getSessionId(),
        };
        const body = JSON.stringify(enriched);
        if (navigator.sendBeacon) {
          const blob = new Blob([body], { type: 'application/json' });
          return navigator.sendBeacon(url, blob);
        } else {
          return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
        }
      } catch {}
    };
  })();

  document.addEventListener('DOMContentLoaded', function(){
    try { window.logEvent({ event: 'page_view' }); } catch {}
  });

  (function initGlobalInputLogging(){
    const THROTTLE_MS = 800;
    const lastTs = new Map();
    const shouldSkip = (el) => {
      if (!el) return true;
      const tag = (el.tagName||'').toLowerCase();
      if (tag !== 'input' && tag !== 'textarea') return true;
      const type = (el.type||'').toLowerCase();
      if (type === 'password' || type === 'hidden') return true;
      return false;
    };
    const getFieldMeta = (el) => ({
      id: el.id || undefined,
      name: el.name || undefined,
      placeholder: el.placeholder || undefined,
      classes: (el.className||'').toString().slice(0,200) || undefined,
      dataset_module: el.dataset ? el.dataset.module : undefined,
    });
    const now = () => Date.now();
    const keyFor = (el) => el.__logk || (el.__logk = (el.id||el.name||el.placeholder||'input') + ':' + Math.random().toString(36).slice(2));

    document.addEventListener('input', function(e){
      try {
        const el = e.target;
        if (shouldSkip(el) || !window.logEvent) return;
        const k = keyFor(el);
        const t = now();
        const prev = lastTs.get(k) || 0;
        if (t - prev < THROTTLE_MS) return;
        lastTs.set(k, t);
        const val = (el.value||'').slice(0,200);
        window.logEvent({ event: 'input_text', field: getFieldMeta(el), value: val, length: val.length });
      } catch {}
    }, true);

    document.addEventListener('keydown', function(e){
      try {
        const el = e.target;
        if (shouldSkip(el) || !window.logEvent) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          const val = (el.value||'').slice(0,200);
          window.logEvent({ event: 'input_submit', trigger: 'enter', field: getFieldMeta(el), value: val, length: val.length });
        }
      } catch {}
    }, true);
  })();

} else {
  function resolveApiBaseUrl() {
    const qs = new URLSearchParams(location.search).get('api');
    if (qs) return { base: qs, mode: 'custom' };
    try {
      const saved = localStorage.getItem('apiBaseUrl');
      if (saved) return { base: saved, mode: 'custom' };
    } catch {}
    return { base: PROD_BASE, mode: 'production' };
  }

  const { base: apiBaseUrl, mode } = resolveApiBaseUrl();
  const origin = location.origin || 'file://';
  window.__API_BASE = apiBaseUrl;
  window.apiBaseUrl = apiBaseUrl;

  window.addEventListener('load', () => {
    fetch(`${apiBaseUrl}/health`, { method: 'GET', mode: 'cors' }).catch(() => {});
  });

  (function initClientLogger(){
    const getSessionId = () => {
      try {
        const key = 'client_session_id';
        let id = localStorage.getItem(key);
        if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(key, id); }
        return id;
      } catch { return undefined; }
    };

    window.logEvent = function logEvent(data) {
      try {
        const base = window.apiBaseUrl || apiBaseUrl;
        const url = `${base}/log`;
        const enriched = {
          ...data,
          page: data?.page || (location && location.pathname) || undefined,
          origin: origin,
          referrer: document.referrer || '',
          mode: mode,
          ts: new Date().toISOString(),
          session_id: getSessionId(),
        };
        const body = JSON.stringify(enriched);
        if (navigator.sendBeacon) {
          const blob = new Blob([body], { type: 'application/json' });
          return navigator.sendBeacon(url, blob);
        } else {
          return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
        }
      } catch {}
    };
  })();

  document.addEventListener('DOMContentLoaded', function(){
    try { window.logEvent({ event: 'page_view' }); } catch {}
  });

  (function initGlobalInputLogging(){
    const THROTTLE_MS = 800;
    const lastTs = new Map();
    const shouldSkip = (el) => {
      if (!el) return true;
      const tag = (el.tagName||'').toLowerCase();
      if (tag !== 'input' && tag !== 'textarea') return true;
      const type = (el.type||'').toLowerCase();
      if (type === 'password' || type === 'hidden') return true;
      return false;
    };
    const getFieldMeta = (el) => ({
      id: el.id || undefined,
      name: el.name || undefined,
      placeholder: el.placeholder || undefined,
      classes: (el.className||'').toString().slice(0,200) || undefined,
      dataset_module: el.dataset ? el.dataset.module : undefined,
    });
    const now = () => Date.now();
    const keyFor = (el) => el.__logk || (el.__logk = (el.id||el.name||el.placeholder||'input') + ':' + Math.random().toString(36).slice(2));

    document.addEventListener('input', function(e){
      try {
        const el = e.target;
        if (shouldSkip(el) || !window.logEvent) return;
        const k = keyFor(el);
        const t = now();
        const prev = lastTs.get(k) || 0;
        if (t - prev < THROTTLE_MS) return;
        lastTs.set(k, t);
        const val = (el.value||'').slice(0,200);
        window.logEvent({ event: 'input_text', field: getFieldMeta(el), value: val, length: val.length });
      } catch {}
    }, true);

    document.addEventListener('keydown', function(e){
      try {
        const el = e.target;
        if (shouldSkip(el) || !window.logEvent) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          const val = (el.value||'').slice(0,200);
          window.logEvent({ event: 'input_submit', trigger: 'enter', field: getFieldMeta(el), value: val, length: val.length });
        }
      } catch {}
    }, true);
  })();
}

// Configuração de timeout
window.CONFIG = {
  ...window.CONFIG,
  SEARCH_TIMEOUT_MS: 45000
};
