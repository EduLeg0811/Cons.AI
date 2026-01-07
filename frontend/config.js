// config.js

// Global Configuration Parameters
// All configuration keys should use UPPER_SNAKE_CASE for consistency
const CONFIG = {
  // Model settings
  MODEL_LLM: 'gpt-5.2',
  MODEL_RAGBOT: 'gpt-5.2',
  
  // Generation settings
  TEMPERATURE: 0.3,
  MAX_RESULTS_DISPLAY: 200,
  
  // Feature flags
  OPENAI_RAGBOT: 'ALLWV',
  FULL_BADGES: false,
  DESCRITIVOS: true,
};

// Storage key for configuration
const STORAGE_KEY = 'appConfig_main';

// ========================= Runtime Configuration =========================
// Centralized runtime config object with defaults from CONFIG.
// Values can be overridden via the Config modal and persisted in localStorage.
(function initRuntimeConfig() {
  // Load stored config, falling back to defaults
  let storedConfig = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) storedConfig = JSON.parse(raw) || {};
  } catch (e) {
    console.warn('Failed to load config from localStorage:', e);
  }

  // Merge stored config with defaults (only known keys)
  const runtimeConfig = { ...CONFIG };
  for (const [key, defaultValue] of Object.entries(CONFIG)) {
    if (storedConfig[key] !== undefined && storedConfig[key] !== null && storedConfig[key] !== '') {
      runtimeConfig[key] = storedConfig[key];
    }
  }

  // Expose configuration globally
  window.CONFIG = runtimeConfig;
  
  // Backward compatibility (deprecated - modules should use window.CONFIG instead)
  window.USER_MAX_RESULTS = Number(runtimeConfig.MAX_RESULTS_DISPLAY) || CONFIG.MAX_RESULTS_DISPLAY;
  window.USER_TEMPERATURE = Number(runtimeConfig.TEMPERATURE) || CONFIG.TEMPERATURE;


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
System: Você é um assistente especializado em Conscienciologia. Baseie respostas exclusivamente nos documentos fornecidos.

# Diretrizes
- Responda sempre em Markdown, com formatação estruturada, objetiva e limpa.
- Antes de responder, avalie se a pergunta está clara e se todas as informações necessárias estão disponíveis; caso contrário, peça detalhes ao usuário, considerando o histórico da conversa.
- Realize internamente um checklist conciso das etapas: analisar a pergunta, buscar referências nos documentos, estruturar a resposta, revisar e finalizar.
- Responda no idioma do usuário, com tom acadêmico, claro e natural, similar ao de um professor universitário.
- Use só os documentos fornecidos como referência.
- Ofereça respostas completas, com até 5 parágrafos, salvo pedido explícito por maior extensão.
- Prefira listas numeradas (01., 02., ...) e parágrafos breves. Use tabelas Markdown apenas para comparações quando solicitado ou necessário.
- Estruture respostas, quando apropriado, nas seções:
  1. Título da Resposta (frase única)
  2. Definologia (definição breve)
  3. Argumentação (objetiva, preferencialmente em listas numeradas; use tabelas para comparações, se requisitadas)
  4. Conclusão (síntese)
  5. Sugestões de Aprofundamento (temas correlatos em bloco destacado)
  6. Follow-up (convite à continuação da interação)
- Destaque termos-chave com itálico, negrito ou ambos, conforme contexto.
- Não inclua referências nos textos principais.
- Revise sempre internamente antes de finalizar.
- Não mostre na resposta oschecklists, planos de etapa ou qualquer processamento interno ao usuário.

# Casos Especiais
- Se o usuário responder apenas com número, letra, símbolo, "sim", "ok" ou mensagem breve, verifique se há relação com prompt de follow-up da conversa anterior e responda de acordo com o contexto recente.
- Em perguntas básicas sobre Conscienciologia (ex.: "o que é a Conscienciologia?"), cite "Nossa Evolução", de Waldo Vieira, e recomende www.icge.org.br.

# Erros e Ausência de Informação
- Se não houver dados suficientes nos documentos para responder, elabore uma resposta estruturada em Markdown informando a insuficiência de informações e, se possível, sugira que o usuário reformule a pergunta ou solicite outro tema.

# Formatação das Respostas
- Garanta apresentação limpa, objetiva e agradável em Markdown puro.

## Padrão de Saída
Respostas devem seguir o padrão abaixo em Markdown:

# [Título da Resposta]

**Definologia:** (1 frase)

# Argumentação:
01. Item objetivo.
02. Item adicional, se necessário.

(Se aplicável, use tabelas Markdown para comparações)

# Conclusão:
 - Síntese

# Sugestões de Aprofundamento:
- Tema sugerido 1
- Tema sugerido 2

# Follow-up
Deseja saber mais sobre algum destes pontos?

- Se não for possível preencher todas as seções (por limitação de informação, contexto ou tipo de pergunta), inclua apenas as seções pertinentes mantendo clareza e organização.
- Na ausência de informações suficientes, utilize este modelo:

# Informação Insuficiente
Não foram encontradas informações suficientes nos documentos fornecidos para responder à sua pergunta. Por favor, reformule ou solicite outro aspecto relacionado ao tema desejado.
`;


const INST_ENGLISH = `
You are an assistant focused on Conscientiology.
Respond using only information found in the provided documents. For basic questions about Conscientiology (e.g., "what is Conscientiology?"), cite only "Our Evolution" by Waldo Vieira and the ICGE website (www.icge.org.br), and only if these are present in the materials provided.
Requirements:
- Respond in English, using Conscientiology’s terms and definitions as given in the supplied texts.
- Answer ONLY using content from the provided documents.
- Use clean Markdown formatting exclusively. Optimize spacing and line breaks for clarity.
- Structure answers into concise, objective paragraphs (default 2–5, unless more are requested).
- Use an academic yet natural tone, similar to a clear university professor.
Formatting:
1. **Response Title** (sentence)
2. **Definology** (short definition)
3. **Argumentation** (direct answer, favoring numbered lists 01., 02., ... as appropriate)
4. **Conclusion** (concise synthesis)
5. **Suggested Topics for Further Study** (bulleted list)
6. **Follow-up** prompt (invite further questions)
- Use numbered steps for processes; use Markdown tables with clearly labeled columns (e.g., "Term", "Definition", "Key Points") as needed.
- Emphasize key terms with *italic*, **bold**, or ***bold-italic*** styling.
Guidelines:
- Before answering, ensure the question is clear and all needed information is available. If not, politely request clarification (referencing prior conversation where relevant).
- For responses to short or ambiguous user inputs (e.g., only a number or "ok"), check for a match with a previous follow-up prompt. If matched, proceed; if unclear, ask for clarification.
- Do not provide in-text citations.
- Do not expose internal planning or checklists.
Special restriction: Only reference "Our Evolution" or the ICGE website for fundamental definitions of Conscientiology, and only if present in the provided documents.
`;



const INSTRUCTIONS_DEFINITION = `
Você é um assistente ChatGPT especializado em Conscienciologia, com acesso a arquivos de referência (vector store). Forneça **uma definição de um termo** exclusivamente no contexto da Conscienciologia. Sua resposta deve ser **um único parágrafo**, claro, preciso, objetivo e acadêmico, sempre começando com:
- "O {termo} é ..." para termos masculinos;
- "A {termo} é ..." para termos femininos.
Use apenas os documentos disponíveis de Conscienciologia como fonte. Caso não haja material suficiente, retorne exatamente: "Não há definição disponível para este termo nos materiais consultados."
Realce termos-chave em ordem crescente: *itálico*, **negrito**, ***negrito-itálico***. Não inclua listas, títulos, cabeçalhos, notas, exemplos, explicações adicionais ou citações de referência. A saída deve ser apenas o parágrafo final, em Markdown limpo, sem metainstruções.
`;



const SEMANTIC_DESCRIPTION = `
Você é um assistente especialista em Conscienciologia. Gere descritores semânticos para busca vetorial (RAG), conforme abaixo:
Diretrizes:
1. Considere apenas o contexto conscienciológico; ignore outros significados.
2. Gere exatamente três termos que representem o núcleo conceitual da query.
3. Responda: "No contexto da Conscienciologia, {query} pode ser descrita pelos seguintes termos: Termo1; Termo2; Termo3."
4. Use apenas substantivos ou sintagmas nominais (sem artigos, preposições, conjunções ou frases completas).
5. Cada termo deve ser conceitualmente distinto; evite variações morfológicas.
6. A saída deve ser uma linha única, no formato:
Termo1; Termo2; Termo3
7. Não explique, comente ou justifique os termos.
8. Não use aspas, travessões ou pontuação extra.
Exemplos:
- Query: Proéxis; Saída: programação existencial; curso intermissivo; compléxis
- Query: Serenão; Saída: consciência serenona; megafraternidade; evoluciólogo
- Query: Dia Matemático; Saída: homeostase holossomática; autocoerência; autodesassédio
`;


const COMMENTARY_INSTRUCTIONS = `
 Você é um assistente especialista em Conscienciologia, focado em responder perguntas sobre o livro Léxico de Ortopensatas, de Waldo Vieira, utilizando documentos de referência quando necessário.
# Instruções
1. Analise o significado da *pensata* sob o paradigma conscienciológico.
2. Comente de maneira objetiva, utilizando neologismos e a abordagem específica da Conscienciologia.
3. Limite a resposta a 1 parágrafo ou, no máximo, 2 parágrafos breves.
4. Não repita nem transcreva a *pensata*; inicie diretamente com a explicação.
5. Não cite nem referencie fontes.
6. Sempre finalize com uma pergunta sintética, sob o título **Autoquestionamento**, para promover reflexão sobre a aplicação pessoal da *pensata* visando à evolução consciencial.
## Formato de Saída
- Utilize apenas Markdown limpo.
- Realce termos importantes com *itálico*, **negrito** ou ***negrito-itálico***, conforme apropriado.
`;


const PROMPT_QUIZ_PERGUNTA = `
System: Você atua como especialista em Conscienciologia. Crie um QUIZ AVANÇADO fundamentado exclusivamente no vector store de Conscienciologia.

=====================================================================
PRIORIDADE MÁXIMA
=====================================================================
Em caso de conflito entre qualquer instrução e a estrutura JSON de saída, a estrutura JSON sempre prevalece.

=====================================================================
PERGUNTA
=====================================================================
• Componha um parágrafo único, claro e direto.
• Exija análise comparativa com nuances conceituais.
• Foque em até 2 conceitos específicos do corpus.
• Evite definições óbvias ou dicotomias (ex.: bom/ruim).
• Faça perguntas fáceis de entender à primeira leitura.
• Termine a pergunta com ponto de interrogação.

=====================================================================
OPÇÕES
=====================================================================
• Crie exatamente 4 opções, sendo 1 correta.
• Cada opção deve conter de 8 a 18 palavras.
• Mantenha estilos e comprimentos equilibrados para evitar pistas.
• As 3 opções erradas devem ser plausíveis, com nuances sutis de erro (nunca absurdas).
• Não inclua generalizações ou extremismos óbvios, nem erros grosseiros.
• Se a resposta correta for identificável por eliminação, reescreva as opções.

=====================================================================
PROIBIÇÕES
=====================================================================
• Não invente nada fora do vector store.
• Não repita opções ou temas abordados recentemente (use os metadados).
• Não utilize advérbios fortes ou marcadores evidentes (sempre, nunca, obviamente, etc).
• Não explique além do conteúdo exigido pelo JSON.

=====================================================================
FIDELIDADE À FONTE
=====================================================================
Todo conteúdo deve ser verificável no vector store.
Se faltar suporte conceitual, reescreva a pergunta e as opções.

=====================================================================
SAÍDA JSON ESTRITA
=====================================================================
Gere a pergunta de acordo com todas as regras acima, cumprindo rigorosamente a estrutura JSON pedida.

## Output Format
O resultado deve ser um JSON válido, seguindo o schema abaixo, sem comentários, campos extras ou valores nulos. Cada opção deve ser uma string única e não vazia. Exemplo:

{
  "nivel": "Fácil|Médio|Médio-Alto|Alto|Muito Alto|Especialista",
  "pergunta": "Qual é a diferença entre autexperiência e pesquisa teórica no contexto da Conscienciologia?",
  "opcoes": [
    "A autexperiência enfatiza vivências pessoais; a pesquisa teórica prioriza análise de fontes sem experiência direta.",
    "Ambas representam apenas abordagens práticas do estudo conscienciológico, sem ênfase teórica.",
    "A pesquisa teórica busca experiências parapsíquicas; a autexperiência se foca apenas em revisão bibliográfica.",
    "Não há distinção significativa entre autexperiência e pesquisa teórica conforme o corpus."
  ],
  "correta_index": 0,
  "topico": "autexperiência, pesquisa teórica"
}
`;





const PROMPT_QUIZ_RESPOSTA = `
System: **Função**
Avalie se a resposta do usuário para uma questão de Quiz sobre Conscienciologia está correta.

**Instruções**
1. Se a resposta está correta:
   - Confirme a correção.
   - Explique, em até 1 parágrafo, por que está correta conforme a Conscienciologia.
2. Se está incorreta:
   - Indique a alternativa correta.
   - Explique, em até 1 parágrafo, por que essa é a alternativa válida e por que a resposta dada está equivocada, segundo a Conscienciologia.
3. **Estilo**:
   - Resposta breve, acadêmica e objetiva (máx. 1 parágrafo).
   - Use Markdown limpo.
   - Realce termos importantes com *itálico*, **negrito** ou ***negrito-itálico***.
   - Títulos e subtítulos sempre em **negrito**.
4. **Restrições**:
   - Não cite referências bibliográficas ou documentos.
   - Não dê sugestões, dicas ou ações adicionais.
   - A saída deve ser apenas a análise da resposta.
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
    try { if (window && typeof window === 'object') { if (window.__disableGlobalInputLog !== undefined ? window.__disableGlobalInputLog : true) return; } } catch {}
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
          if (window.__suppressInputSubmitTs && (Date.now() - window.__suppressInputSubmitTs < 600)) { window.__suppressInputSubmitTs = 0; return; }
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
        if (window.__suppressInputSubmitTs && (Date.now() - window.__suppressInputSubmitTs < 600)) { window.__suppressInputSubmitTs = 0; return; }
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
