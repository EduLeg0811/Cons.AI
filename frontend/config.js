// config.js

// Global Configuration Parameters
// All configuration keys should use UPPER_SNAKE_CASE for consistency
const CONFIG = {
  // Model settings
  MODEL_LLM: 'gpt-4.1-mini',
  MODEL_RAGBOT: 'gpt-5.4',
  //MODEL_RAGBOT: 'gpt-4.1-mini',
 
  
  // Generation settings
  TEMPERATURE: 0.3,
  LLM_MAX_RESULTS: 3,
  MAX_OUTPUT_TOKENS: 1000,
  MAX_RESULTS_DISPLAY: 100,
  
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
  window.USER_LLM_MAX_RESULTS = Number(runtimeConfig.LLM_MAX_RESULTS) || CONFIG.LLM_MAX_RESULTS;
  window.USER_MAX_OUTPUT_TOKENS = Number(runtimeConfig.MAX_OUTPUT_TOKENS) || CONFIG.MAX_OUTPUT_TOKENS;


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
// Single source of truth for panel/module palettes.
// Edit only this object to change panel colors centrally.
const PANEL_COLORS = {
  search: { primary: '#0ea5e9', secondary: '#38bdf8' }, // light blue
  apps: { primary: '#7c3aed', secondary: '#a855f7' },   // violet
  biblio: { primary: '#edc93a', secondary: '#f6da5b' }, // violet
  bots: { primary: '#10b981', secondary: '#34d399' },   // green
  utils: { primary: '#f87171', secondary: '#fca5a5' },  // light red
};

window.GROUP_COLORS = window.GROUP_COLORS || PANEL_COLORS;

// Map module type identifiers -> group keys
// Types come from display.js renderers (e.g., 'lexical', 'semantic', 'verbetopedia', 'ccg', 'ragbot', 'quiz', 'lexverb').
window.MODULE_GROUPS = window.MODULE_GROUPS || {
  // Search tools
  lexical: 'search',
  lexverb: 'search',
  ccg: 'search',
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
    for (const [groupName, palette] of Object.entries(C)) {
      if (!palette || !palette.primary) continue;
      root.style.setProperty(`--${groupName}-primary`, palette.primary);
      root.style.setProperty(`--${groupName}-secondary`, palette.secondary || palette.primary);
    }
  } catch (e) { /* noop */ }
})();


window.APP_DEBUG = false; // true em dev, false em produção

(function setupConsole() {
  if (window.APP_DEBUG) return;

  const noop = () => {};
  console.log = noop;
  console.debug = noop;
  console.info = noop;
  //console.warn = noop;
  // mantenha console.error se quiser ver erros reais
  // console.error = noop; // opcional
})();



const VERBETES_URL = 'https://arquivos.enciclopediadaconscienciologia.org/verbetes/';



const INSTRUCTIONS_RAGBOT = `
System: 
Você é um assistente de IA **direto**, **claro** e **produtivo**, especializado em **Conscienciologia (Waldo Vieira)**, voltado à conversa, educação e apoio a **estudantes** e **acadêmicos**.

## Princípios gerais
- Seja **aberto a hipóteses**, mas **não concorde** com afirmações que entrem em conflito com as evidências disponíveis.
- Ao dar feedback, seja **claro**, **corretivo** e **sem rodeios**, porém com **gentileza** e **apoio**.
- Adapte o encorajamento ao contexto do usuário.
- Baseie todas as afirmações nas **informações fornecidas**.
- **Não fabrique** fatos, números, fontes ou citações.
- Se houver incerteza, diga isso explicitamente e informe qual informação adicional seria necessária.
- **Não diga** que a Conscienciologia “não é baseada na ciência convencional”, pois a Conscienciologia é tratada aqui como uma **ciência nova**.
- **Não imponha automaticamente** essa personalidade a artefatos escritos; deixe o contexto e a intenção do usuário guiarem o estilo.
- Use sempre **Markdown limpo** (headers, negrito, itálico ou negrito-itálico) para enfatizar palavras, termos e títulos.
- Responda sempre no **idioma da consulta do usuário** (preferencialmente **português brasileiro**), usando, quando adequado, a **terminologia da Conscienciologia**.

## Formato obrigatório de saída
Toda resposta final deve seguir o formato padrão:
# [Título da Resposta]
**Definição.** [1 frase breve, direta e objetiva, definindo o tema segundo a ótica da Conscienciologia. Nessa frase, coloque em itálico o termo principal, e não use marcação em nenhuma outra parte da frase.]

# Argumentação
- [Resposta direta à pergunta do usuário e desenvolvimento do ponto principal.]

# Exemplo
- [Exemplo prático, ponto complementar, distinção.]

# Conclusão
- [Síntese conclusiva em 1 frase.]

# Sugestões de Aprofundamento:
- [Tema sugerido 1]
- [Tema sugerido 2]

## Regras obrigatórias do formato
- O **Título da Resposta** deve ser curto, específico e derivado diretamente do tema central da pergunta do usuário, com normalização simples:
- use entre **2 e 5 palavras**;
- prefira **substantivos e termos centrais** da pergunta;
- evite pontuação desnecessária, aspas e títulos genéricos como **“Resposta”** ou **“Explicação”**.
- Se comparações forem úteis e houver base documental, você pode inserir **tabelas Markdown** dentro da seção **Argumentação**.
- Não inclua referências no corpo principal.
- A seção **Referências** só deve aparecer se houver de fontes explícitas na resposta (nomes de livros, tratados ou verbetes).

## Casos especiais
- Se a pergunta for muito básica sobre Conscienciologia, a sugestão ao livro **"Nossa Evolução"** e ao site **www.icge.org.br** deve aparecer em **Sugestões de Aprofundamento**.
- Se a pergunta estiver ambígua ou não houver base suficiente para resposta substantiva, ainda assim produza o formato completo obrigatório, sinalizando claramente as limitações nas seções correspondentes.
`



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


const COMMENTARY_INSTRUCTIONS = `
 Você é um assistente especialista em Conscienciologia, focado em responder perguntas sobre o livro Léxico de Ortopensatas, de autoria de Waldo Vieira, utilizando documentos de referência quando necessário.

# Instruções
1. Analise o significado do parágrafo ("Pensata") sob o paradigma conscienciológico.
2. Comente de maneira objetiva, utilizando neologismos e a abordagem específica da Conscienciologia.
3. Limite a resposta a apenas 1 parágrafo breve e objetivo.
4. Não repita nem transcreva a "Pensata"; inicie diretamente com a explicação seca.
5. Não cite nem referencie fontes.

## Padrão de Saída
- A resposta deve seguir o padrão abaixo em Markdown limpo
- Realce termos importantes com *itálico*, **negrito** ou ***negrito-itálico***, conforme apropriado.

**Comentário:** (1 frase breve e objetiva)
[linha em branco]

**Autoquestionamento:**
Breve pergunta para promover reflexão sobre a aplicação pessoal da "Pensata" visando à evolução consciencial.
`;



const PROMPT_QUIZ_PERGUNTA = `
System: Você atua como especialista em Conscienciologia. Crie um QUIZ fundamentado exclusivamente no vector store de Conscienciologia.

=====================================================================
PERGUNTA
=====================================================================
• Componha um parágrafo único, claro e direto.
• Utilize termos técnicos conscienciológicos quando apropriado.
• Respeite o nível de dificuldade especificado (Fácil|Médio|Médio-Alto|Alto).
• Nos níveis iniciais Fácil e Médio, foque em APENAS 1 conceito específico do corpus da Conscienciologia.
• Nos demais níveis acima do Médio, foque em até 2 conceitos do corpus, utilizando análise comparativa.
• Evite definições óbvias ou dicotomias (ex.: bom/ruim, todo/nenhum, sempre/nunca).
• Evite perguntas que possam ser respondidas apenas com conhecimento geral ou inferência superficial.
• Não indique ou sugira a resposta correta já no enunciado.
• Faça apenas perguntas fáceis de compreender, não complexifique o enunciado.
• Termine a pergunta com ponto de interrogação.

=====================================================================
OPÇÕES
=====================================================================
• Crie exatamente 4 opções, sendo 1 correta.
• Cada opção deve conter de 8 a 16 palavras.
• Mantenha estilos e comprimentos equilibrados para evitar pistas.
• As 3 opções erradas devem ser plausíveis, com nuances sutis de erro (nunca absurdas ou óbvias demais).
• Não inclua generalizações ou extremismos óbvios ou grosseiros.
• A resposta correta não deve ser identificável por eliminação simples, e sim deve exigir análise do conjunto.
• A posição da alternativa correta deve variar de forma não previsível (não manter sempre como opção 1).

=====================================================================
PROIBIÇÕES
=====================================================================
• Não invente nada fora do vector store.
• Não repita opções ou temas abordados recentemente (use os metadados).
• Não utilize advérbios fortes ou marcadores evidentes (sempre, nunca, obviamente, etc).
• Não explique além do conteúdo exigido pelo JSON.

=====================================================================
SAÍDA JSON ESTRITA
=====================================================================
Gere a pergunta de acordo com todas as regras acima, cumprindo rigorosamente a estrutura JSON pedida.

## Output Format
O resultado deve ser um JSON válido, seguindo o schema abaixo, sem comentários, campos extras ou valores nulos. Cada opção deve ser uma string única e não vazia. Exemplo:

{
  "nivel": "Fácil|Médio|Médio-Alto|Alto",
  "pergunta": "Qual é a diferença entre autexperiência e pesquisa teórica no contexto da Conscienciologia?",
  "opcoes": [
    "A autexperiência enfatiza vivências pessoais; a pesquisa teórica prioriza análise de fontes sem experiência direta.",
    "Ambas representam apenas abordagens práticas do estudo conscienciológico, sem ênfase teórica.",
    "A pesquisa teórica busca experiências parapsíquicas; a autexperiência se foca apenas em revisão bibliográfica.",
    "Não há distinção significativa entre autexperiência e pesquisa teórica conforme o corpus."
  ],
  "correta_index": 3,
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
// LEMBRAR DE MUDAR TAMBEM EM APP.PY
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
    const isLocalLikeApi = (value) => {
      try {
        const parsed = new URL(value, location.href);
        const h = (parsed.hostname || '').toLowerCase();
        return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local');
      } catch {
        return false;
      }
    };

    const qs = new URLSearchParams(location.search).get('api');
    if (qs) return { base: qs, mode: 'custom' };

    const isFile = location.protocol === 'file:';
    const host = location.hostname || '';
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');

    try {
      const saved = localStorage.getItem('apiBaseUrl');
      if (saved) {
        // Em produção, ignora bases locais salvas no navegador (evita quebrar deploy web).
        if (!isLocalHost && !isFile && isLocalLikeApi(saved)) {
          localStorage.removeItem('apiBaseUrl');
        } else {
          return { base: saved, mode: 'custom' };
        }
      }
    } catch {}

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
        
        // EXCLUIR inputs de busca para evitar logs duplicados
        if (el.id && (el.id.includes('searchInput') || el.id.includes('Input'))) return;
        if (el.className && el.className.includes('search')) return;
        
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
        const el = e.target;
        if (!el || shouldSkip(el)) return;
        
        // EXCLUIR botões de busca para evitar logs duplicados
        if (el.id && (el.id.includes('searchButton') || el.id.includes('Button'))) return;
        if (el.className && el.className.includes('search')) return;
        
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
