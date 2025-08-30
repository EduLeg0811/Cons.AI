// Centralized explanatory texts for index.html
// The goal: keep all user-visible explanatory messages in one place.
// This file sets panel descriptions, tool short descriptions, extra help texts,
// and link titles based on the card/panel names present in index.html.

// Panel descriptions by visible heading (h2)
// Key: exact text of the panel title in the UI
// Value: one-line description shown under the title
const PANEL_DESCRIPTIONS = {
  // Panel: AI Bots
  'AI Bots': 'Intelligent conversational assistants for Conscienciologia',

  // Panel: AI Search
  'AI Search': 'Advanced search capabilities with lexical and semantic analysis',

  // Panel: AI Apps
  'AI Apps': 'Specialized applications for research and exploration',

  // Panel: Utils
  'Utils': 'External resources and reference materials',
};

// Tool card messages keyed by the card title (h3)
// For each tool, you can set:
// - title: tooltip shown on hover (anchor title attribute, supports \n)
// - short: the one-line description under the tool name (accepts HTML)
// - extra: the expandable extra help content (HTML allowed)

const TOOL_MESSAGES = {
  // Tool: OpenAI ConsGPT (ChatGPT custom GPT for Conscienciologia)
  'OpenAI ConsGPT': {
    short: 'ChatGPT especializado em Conscienciologia',
    extra: [
      'Provavelmente o chatbot mais inteligente de todos.',
      'Ótimo para brainstorming, sínteses e dúvidas em geral.',
      'Pode sugerir analogias e sugestões de estudo.',
      'Dica: experimente enviar o seu texto no campo de entrada e pedir para ele dar sugestões de melhoria.'
    ].join('\n')
  },

  // Tool: Google ConsLM (NotebookLM)
  'Google ConsLM': {
    short: 'NotebookLM especializado em Conscienciologia.',
    extra: [
      'NotebookLM do Google Gemini alimentado com os textos e tratados da Conscienciologia.',
      'Excelente para resumos e busca de informações em livros.',
      'Fornece a referência do trecho encontrado.',
      'Dica: experimente a seção lateral de Podcasts de Conscienciologia.',
      'Veja também os resumos prontos e o mapa de conhecimento gerado.'
    ].join('\n')
  },

  // Tool: ConsBOT (RAG chatbot)
  'ConsBOT': {
    short: 'Chatbot próprio da Conscienciologia (<em>experimental</em>)',
    extra: [
      'Chatbot RAG da Conscienciologia.',
      'OpenAI Response API GPT-5.',
      'Contém informações da Conscienciologia além dos tratados e livros.',
      'Mecanismo em constante Evolução.'
    ].join('\n')
  },

  // Tool: Lexical Search
  'Lexical Search': {
    short: 'Busca exata por termos em livros.',
    extra: [
      'Busca exata por termos em livros.<br>',
      'Localize palavras ou frases com precisão.<br>',
      'Útil para checar definições e ocorrências.<br>',
      'Use aspas para frases exatas.'
    ].join('\n')
  },

  // Tool: Semantic Search
  'Semantic Search': {
    short: 'AI-powered contextual and meaning-based search',
    extra: [
      'Busca semântica por significado e contexto.<br>',
      'Encontra trechos relacionados sem o termo exato.<br>',
      'Ótima para temas e ideias correlatas.<br>',
      'Ajuste resultados e agrupamento.'
    ].join('\n')
  },

  // Tool: Bibliomancia Digital
  'Bibliomancia Digital': {
    short: 'Random <em>pensata</em> extraction with AI commentary',
    extra: [
      'Sorteia uma pensata com comentário da IA.<br>',
      'Boa para inspiração e reflexão rápida.<br>',
      'Útil em dinâmicas e debates.<br>',
      'Gere novas pensatas à vontade.'
    ].join('\n')
  },

  // Tool: Verbetopedia
  'Verbetopedia': {
    short: 'Semantical encyclopedia recommendations',
    extra: [
      'Exploração semântica de verbetes.<br>',
      'Sugere relações entre temas e verbetes.<br>',
      'Bom para estudar áreas afins.<br>',
      'Aprofunde nos links sugeridos.'
    ].join('\n')
  },

  // Tool: Verbetes Encyclopedia (external)
  'Verbetes Encyclopedia': {
    short: 'Latest version of the Encyclopedia of Conscientiology',
    extra: [
      'Enciclopédia da Conscienciologia (oficial).',
      'Verbetes atualizados para estudo formal.',
      'Pesquise e navegue por temas.',
      'Abre em nova aba.'
    ].join('\n'),
  },

  // Tool: ICGE (external)
  'ICGE': {
    short: 'ICGE Homepage with conscienciological resources',
    extra: [
      'Portal do ICGE com recursos e referências.',
      'Pesquise materiais institucionais e históricos.',
      'Complementa as ferramentas internas.',
      'Abre em nova aba.'
    ].join('\n'),
  }
};

// Apply messages to the DOM
// Finds panels and tool cards and injects the corresponding text.
function applyMessages() {
  try {
    // Panels: set description under each h2
    document.querySelectorAll('.tool-panel .panel-header .panel-info').forEach(info => {
      const h2 = info.querySelector('h2');
      const p = info.querySelector('p');
      if (!h2 || !p) return;
      const key = h2.textContent.trim();
      const descr = PANEL_DESCRIPTIONS[key];
      if (descr) p.textContent = descr;
    });

    // Tool cards: set title, short description, and extra help
    document.querySelectorAll('.tool-card').forEach(card => {
      const titleEl = card.querySelector('.tool-info h3');
      if (!titleEl) return;
      const key = titleEl.textContent.trim();
      const msg = TOOL_MESSAGES[key];
      if (!msg) return;

      // Set title to extra if title is not defined
      if (!msg.title && msg.extra) {
        msg.title = msg.extra;
      }

      // Anchor title tooltip
      if (msg.title) {
        card.setAttribute('title', msg.title);
      }

      // One-line short description (accepts HTML for <em>)
      const shortEl = card.querySelector('.tool-info > p');
      if (shortEl && msg.short) {
        shortEl.innerHTML = msg.short;
      }

      // Extra explanatory block (HTML)
      const extraEl = card.querySelector('.tool-info-extra');
      if (extraEl && msg.extra) {
        extraEl.innerHTML = msg.extra;
      }
    });
  } catch (e) {
    console.warn('messages.js: failed to apply messages', e);
  }
}

// Run after DOM is ready
document.addEventListener('DOMContentLoaded', applyMessages);

// Page-specific: Verbetopedia texts and labels
// Centralizes UI strings for index_verbetopedia.html
const VERBETOPEDIA_TEXTS = {
  // Navbar subtitle under the Verbetopédia title
  navbarSubtitle: 'Encyclopedia search and exploration',

  // Options panel title
  optionsTitle: 'Search Options',

  // Toggle label for definition/neologism
  toggleDefinitionLabel: 'Neologismo',

  // Label for max results input
  maxResultsLabel: 'Resultados',

  // Save settings button text
  saveButton: 'Salvar Ajustes',

  // Search input placeholder
  searchPlaceholder: 'Enter a term to search related verbetes...',

  // Toolbar button titles
  titleDownload: 'Download as Word',
  titleOptions: 'Search options',
  titleBackHome: 'Back to Home',

  // Search button aria label
  ariaSearch: 'Search'
};

function applyVerbetopediaMessages() {
  try {
    // Only run on the verbetopedia page (heuristic: presence of .navbar-title containing 'Verbeto')
    const isVerbetopedia = !!Array.from(document.querySelectorAll('.navbar-title'))
      .find(el => /Verbeto/i.test(el.textContent));
    if (!isVerbetopedia) return;

    const t = VERBETOPEDIA_TEXTS;

    const subtitle = document.querySelector('.navbar-subtitle');
    if (subtitle) subtitle.textContent = t.navbarSubtitle;

    const optionsTitle = document.querySelector('.options-title');
    if (optionsTitle) optionsTitle.textContent = t.optionsTitle;

    const toggleLabel = document.querySelector('label.toggle-label[for="enableDefinition"]');
    if (toggleLabel) toggleLabel.textContent = t.toggleDefinitionLabel;

    const maxResultsLabel = document.querySelector('label[for="maxResults"]');
    if (maxResultsLabel) maxResultsLabel.textContent = t.maxResultsLabel;

    const saveBtn = document.querySelector('.save-btn');
    if (saveBtn) saveBtn.textContent = t.saveButton;

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.setAttribute('placeholder', t.searchPlaceholder);

    const downloadBtn = document.getElementById('downloadDocx');
    if (downloadBtn) downloadBtn.setAttribute('title', t.titleDownload);

    const optionsTrigger = document.getElementById('optionsTrigger');
    if (optionsTrigger) optionsTrigger.setAttribute('title', t.titleOptions);

    const backBtn = document.querySelector('.back-button');
    if (backBtn) backBtn.setAttribute('title', t.titleBackHome);

    const searchBtn = document.getElementById('searchButton');
    if (searchBtn) searchBtn.setAttribute('aria-label', t.ariaSearch);
  } catch (e) {
    console.warn('messages.js: failed to apply verbetopedia messages', e);
  }
}

document.addEventListener('DOMContentLoaded', applyVerbetopediaMessages);
