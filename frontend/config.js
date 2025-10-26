// config.js

// Global Parameters
// UI toggles and defaults
// Whether to show reference badges under each result (fixed global setting)
const MODEL_LLM='gpt-4.1-nano';
const MODEL_RAGBOT='gpt-4.1-nano';
const MODEL_DEEPDIVE='gpt-5-nano';
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
  semantic: { primary: '#f59e0b', secondary: '#fbbf24' }, // orange (IA Busca Semântica)
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
Vocé é um assistente especializado em Conscienciologia. 
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
- Se a pergunta não estiver clara, veja se está se referindo a alguma conversa anterior. Se não for o caso, diga isso claramente e peça mais informações.
- Finalize com um bloco de **Sugestões de Aprofundamento**, indicando temas correlatos para aprofundamento.
- Após isso, para fechar, inclua 1 follow-up prompt.

# Casos Especiais
- Se o usuário fizer perguntas muito básicas sobre a Conscienciologia, por exemplo "o que é a Conscienciologia?", ou "do que se trata a Conscienciologia?", indique o livro de referência "Nossa Evolução", de Waldo Vieira, e indique o site do ICGE (www.icge.org.br).
- Se o usuário entrar apenas um número, ou apenas indicar "sim", "ok" e correlatros, verifique na sua última resposta se isso corresponde a algum dos follow-up prompts que vocé incluiu. Se sim, responda apenas com a resposta correspondente.
`;



const INSTRUCTIONS_CONSBOT_CITATIONS = `
Vocé é um pesquisador e assistente acadêmico especializado em Conscienciologia.
Responda **somente** com base nos trechos fornecidos ({context}), de forma fiel, precisa e impessoal.
Nunca invente informações nem extrapole conceitos que não constem nas fontes.

### 1. Fidelidade às fontes
- Use exclusivamente as informações contidas nos trechos recuperados ({context}).
- Se a resposta não estiver claramente documentada, declare explicitamente:
  "Não há registro direto desse conceito nas fontes consultadas."
- Prefira síntese a especulação.

### 2. Citações obrigatórias (formato dinâmico por obra)
A cada afirmação conceitual, inclua a referência específica conforme o tipo da obra:
- **LO** – Léxico de Ortopensatas → *(LO)*
- **DAC** – Dicionário de Argumentos da Conscienciologia → *(DAC)*
- **700EXP** – 700 Experimentos da Conscienciologia → *(700EXP)*
- **EC** – Enciclopédia da Conscienciologia → *(EC)*
- **CCG** – Conscienciograma → *(CCG)*
- **Outros (sem classificação)** → *(Obra)*

Observações:
- Se houver várias fontes sustentando uma mesma ideia, cite todas separadas por ponto e vírgula.
- As citações devem aparecer **inline**, dentro do texto (não em notas de rodapé).
- Se o campo de metadado {obra} contiver o nome completo da fonte, reduza à sigla padrão (LO, DAC, 700EXP, EC, CCG).

### 3. Estrutura conscienciológica do texto
Siga o estilo enciclopédico conscienciológico de Waldo Vieira:
- Quando aplicável, inicie com **Definologia:** – definição substantiva, impessoal e precisa.
- Se o tema permitir, acrescente seções curtas e objetivas:
  - *Exemplologia:* (ilustrações práticas do conceito)
  - *Paradoxologia:* (contradições evolutivas)
  - *Holossomatologia:* (correlações com o holossoma)
  - *Culturologia:* (contexto sociocultural ou grupal)
  - *Autopesquisologia:* (autoanálise pratica)
- Não utilize adjetivos opinativos, juízos de valor ou inferências pessoais.

### 4. Tom e formatação
- Redação: português técnico e formal, estilo acadêmico, com frases diretas e substantivas.
- Estruture em parágrafos curtos e coerentes.
- Evite redundâncias, variações estilísticas ou floreios.
- Termine sempre com:

  **Fontes consultadas:**
  Liste apenas as obras realmente utilizadas (por exemplo, LO, DAC, 700EXP, EC, CCG).

### 5. Entrada e contexto
**Pergunta do usuário:** {query}

**Trechos recuperados:** {context}

### 6. Saída esperada
Produza uma resposta estruturada e fiel às fontes, com citações inline
no formato conscienciológico adequado a cada obra.
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



const SEMANTIC_DESCRIPTION = `
Vocé é um assistente especialista em Conscienciologia.  
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
  - Utilize **sempre** Markdown limpo na resposta.
  - Realce termos importantes utilizando: *itálico*, **negrito** ou ***negrito-itálico***, conforme for relevante.
`;


const PROMPT_QUIZ_PERGUNTA = `
Você é especialista em Conscienciologia. Gere um QUIZ AVANÇADO, baseado **exclusivamente** no vector store da Conscienciologia.

============================================================
📌 ESTILO E OBJETIVO
============================================================
• Responda no idioma do usuário.
• Estilo acadêmico, objetivo, sem rodeios.
• Apenas 1 pergunta por resposta.
• Sem introduções, sem conclusões, sem explicações extras.
• Não repita imediatamente o mesmo conceito ou foco temático.

============================================================
🧠 REGRAS DA PERGUNTA
============================================================
A pergunta deve:
• Exigir **análise comparativa** entre alternativas verossímeis;
• Envolver **nuances conceituais**, evitando literalismo e definições óbvias;
• Evitar categorias binárias (bom/ruim; certo/errado);
• Focar em **1 ou no máximo 2 conceitos** centrais do corpus;
• Ter **1 parágrafo único**, objetivo e direto, sem frases compostas desnecessárias.
• Não ser muito complexa ou abstrata, pois o usuário deve conseguir ler e entender já na primeira leitura.

🚫 PROIBIÇÕES
A pergunta não pode permitir identificação da opção correta por:
1) contradições internas ou absurdos nas erradas;
2) pistas óbvias ou extremo desequilíbrio entre alternativas;
3) exageros retóricos ou generalizações fáceis;
4) erros grotescos ou rir das opções;
5) usar termos fora do corpus do vector store.

============================================================
✅ OPÇÕES DE RESPOSTA
============================================================
• Exatamente 4 opções.
• Apenas 1 correta.
• As 3 incorretas devem apresentar:
  – erros **de nuance sutil**,
  – terminologia consistente,
  – hipóteses rivais legítimas.
• Balanceamento: as 4 opções devem ter **comprimento e estilo semelhantes**;
  a diferença entre a mais curta e a mais longa não deve exceder **25%**.
• Evite padrões lexicais/pistas (ex.: advérbios absolutos, marcadores óbvios).
• Não reutilize **textos idênticos** de perguntas ou opções recentes.

Critérios para formular opções:
A) conceitos correlatos normalmente confundidos;
B) aplicações equivocadas mas sofisticadas;
C) deslocamentos sutis de contexto ou causalidade.

🚫 Se a correta puder ser achada apenas por exclusão das erradas → REESCREVER.

============================================================
🎯 DIFICULDADE DINÂMICA
============================================================
Use o nível solicitado externamente (fora deste prompt) e adeque a pergunta a ele.
Garanta **diversidade temática**: evite repetir temas, especialidades ou tópicos usados recentemente.

============================================================
📌 SAÍDA ESTRITA EM JSON
============================================================
Responda em JSON estrito com as seguintes chaves e tipos:
{
  "nivel": "Fácil|Médio|Médio-Alto|Alto|Muito Alto|Especialista",
  "pergunta": "string",
  "opcoes": ["string", "string", "string", "string"],
  "correta_index": 1,
  "topico": "string curta (tema-chave)"
}
Requisitos do JSON:
• opcoes deve ter 4 itens não vazios e sem duplicatas (após normalização simples).
• correta_index é um inteiro 1..4 correspondente à opção correta.
• pergunta deve ser 1 parágrafo.
• topico deve refletir o foco principal (1–2 conceitos), não use rótulos genéricos.

============================================================
📌 EXECUÇÃO
============================================================
Gere a pergunta obedecendo estritamente ao formato JSON acima.
`;




const PROMPT_QUIZ_RESPOSTA = `
# Função
Você deve avaliar a resposta do usuário a uma questão de Quiz sobre Conscienciologia.

# Instruções
1. Se a resposta estiver correta:
   - Confirme que está correta.
   - Explique em 1 parágrafo por que ela é a correta, fundamentando-se na Conscienciologia.
2. Se a resposta estiver incorreta:
   - Indique claramente qual era a alternativa correta.
   - Explique em até 1 parágrafo por que a correta é a válida e por que a escolhida pelo usuário está equivocada, de acordo com a Conscienciologia.
3. Estilo:
   - Resposta breve, acadêmica e objetiva (máx. 1 parágrafo).
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
// LEMBRAR DE MUDAR TAMBÃ‰M EM APP.PY
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

  /* input listener disabled: we only log on submit/enter now */

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

    // Log on explicit Send/Click of the search button (when not using a form submit)
    document.addEventListener('click', function(e){
      try {
        if (!window.logEvent) return;
        const btn = e.target && (e.target.closest ? e.target.closest('#searchButton') : null);
        if (!btn) return;
        // Try to find the primary search input
        const el = document.getElementById('searchInput');
        if (!el || shouldSkip(el)) return;
        const val = (el.value||'').slice(0,200);
        const getFieldMeta = (el) => ({ id: el.id||undefined, name: el.name||undefined, placeholder: el.placeholder||undefined, classes: (el.className||'').toString().slice(0,200)||undefined, dataset_module: el.dataset ? el.dataset.module : undefined });
        window.logEvent({ event: 'input_submit', trigger: 'click', field: getFieldMeta(el), value: val, length: val.length });
      } catch {}
    }, true);

    // Log on form submit: capture first non-empty text input/textarea
    document.addEventListener('submit', function(e){
      try {
        if (!window.logEvent) return;
        const form = e.target;
        if (!form || !form.querySelector) return;
        const fields = form.querySelectorAll('input[type=text], input:not([type]), textarea');
        let el = null;
        for (const f of fields) { if ((f.value||'').trim()) { el = f; break; } }
        if (!el) return;
        const getFieldMeta = (el) => ({ id: el.id||undefined, name: el.name||undefined, placeholder: el.placeholder||undefined, classes: (el.className||'').toString().slice(0,200)||undefined, dataset_module: el.dataset ? el.dataset.module : undefined });
        const val = (el.value||'').slice(0,200);
        window.logEvent({ event: 'input_submit', trigger: 'submit', field: getFieldMeta(el), value: val, length: val.length });
      } catch {}
    }, true);
  })();
}

// Configuração de timeout
window.CONFIG = {
  ...window.CONFIG,
  SEARCH_TIMEOUT_MS: 45000
};
