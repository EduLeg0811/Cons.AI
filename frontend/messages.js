// Centralized explanatory texts for index.html
// The goal: keep all user-visible explanatory messages in one place.
// This file sets panel descriptions, tool short descriptions, extra help texts,
// and link titles based on the card/panel names present in index.html.

// Panel descriptions by visible heading (h2)
// Key: exact text of the panel title in the UI
// Value: one-line description shown under the title
const PANEL_DESCRIPTIONS = {
  // Panel: AI Bots
  'IA Bots': 'Assistentes de Conversação por IA',

  // Panel: AI Search
  'IA Search': 'Pesquisa em Livros por IA',

  // Panel: AI Apps
  'IA Apps': 'Aplicativos de IA para Pesquisa',

  // Panel: Utils
  'Links Externos': 'Links e Recursos Úteis',
};

// Tool card messages keyed by the card title (h3)
// For each tool, you can set:
// - title: tooltip shown on hover (anchor title attribute, supports \n)
// - short: the one-line description under the tool name (accepts HTML)
// - extra: the expandable extra help content (HTML allowed)

const TOOL_MESSAGES = {
  // Tool: OpenAI ConsGPT (ChatGPT custom GPT for Conscienciologia)
  'ConsGPT': {
    short: '<em>ChatGPT da OpenAI especialista em Conscienciologia</em>',
    extra: [
      'O <strong>ConsGPT</strong> é provavelmente o chatbot mais <em>inteligente</em> de todos. ',
      'Ótimo para brainstorming, resumos e conversas em geral.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Experimente enviar o texto que está escrevendo e pedir para ele dar <em>sugestões de melhoria</em>.<br>',
      '<strong>2.</strong> Peça a ele que formule <em>analogias</em> ou <em>metáforas</em> para algum tema.<br>',
      '<strong>3.</strong> Se estiver no smartphone, não deixe de conversar <em>por voz</em> com ele.',
    ].join('\n')
  },

  // Tool: Google ConsLM (NotebookLM)
  'ConsLM': {
    short: '<em>NotebookLM da Google especialista em Conscienciologia</em>',
    extra: [
      'O <strong>ConsLM</strong> é o NotebookLM do Google Gemini, alimentado com os textos e tratados da Conscienciologia. ',
      'Excelente para resumos e busca de informações em livros, pois fornece a <em>referência</em> do trecho encontrado.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Experimente a seção lateral de <em>Podcasts de Conscienciologia</em>.<br>',
      '<strong>2.</strong> Veja também os <em>resumos prontos</em> e ointeressante <em>mapa de conhecimento</em>.'
    ].join('\n')
  },

  // Tool: ConsBOT (RAG chatbot)
  'ConsBOT': {
    short: '<em>Chatbot experimental da Conscienciologia</em>',
    extra: [
      'O <strong>ConsBOT</strong> é um projeto experimental de Chatbot RAG da Conscienciologia. ',
      'Ele usa o OpenAI Response API, última versão GPT-5. ',
      'Possui informações dos tratados e livros do professor Waldo, além de anotações selecionadas das Minitertúlias.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Experimente pedir para ele fazer <em>interrelações</em> entre conceitos e ideias distintas.<br>',
      '<strong>2.</strong> Converse sobre temas avançados da Conscienciologia.<br>',
      '<strong>3.</strong> O ConsBOT é um <em>minimecanismo</em> de IA em <em>Evolução</em>.'
    ].join('\n')
  },

  // Tool: Lexical Search
  'Pesquisa Literal': {
    short: '<em>Busca de termos exatos em livros</em>',
    extra: [
      'Encontra os parágrafos de livros que contenham os termos exatos (literais). ',
      'Útil para listar ocorrências de certas palavras ou expressões nas obras da Conscienciologia.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Clique no ícone de <em>configurações</em>.<br>',
      '<strong>2.</strong> Selecione os <em>livros</em> em que deseja buscar.<br>',
      '<strong>3.</strong> Ajuste o número máximo de resultados para limitar a pesquisa.<br>',
      '<strong>4.</strong> Escolha também se quer agrupar por <em>livro</em>, ou elencar por <em>índice de similaridade</em>.<br>',
      '<strong>5.</strong> Ao final, clique no ícone do Word para baixar os resultados.',
    ].join('\n')
  },

  // Tool: Semantic Search
  'Pesquisa Semântica': {
    short: '<em>Busca semântica por afinidade de significado</em>',
    extra: [
      'Encontra os parágrafos de livros que são <em>semanticamente</em> relacionados à busca, independentemente da presença do termo exato. ',
      'Ótima para pesquisar temas e ideias correlatas ou afins.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Clique no ícone de <em>configurações</em>.<br>',
      '<strong>2.</strong> Selecione os <em>livros</em> em que deseja buscar.<br>',
      '<strong>2.</strong> Ative <em>Neologismo</em> para a IA interpretar o termo de busca no sentido conscienciológico.<br>',
      '<strong>4.</strong> Ajuste o número máximo de resultados para limitar a pesquisa.<br>',
      '<strong>5.</strong> Escolha também se quer agrupar por <em>livro</em>, ou elencar por <em>índice de similaridade</em>.<br>',
      '<strong>6.</strong> Ao invés de usar apenas uma palavra na busca, tente explicar sua pesquisa, usando expressões compostas, frases ou parágrafos.<br>',
      '<strong>7.</strong> Ao final, clique no ícone do Word para baixar os resultados.',
    ].join('\n')
  },

  // Tool: Bibliomancia Digital
  'Bibliomancia Digital': {
    short: '<em>Sorteio de uma <em>pensata</em> do Léxico de Ortopensatas</em>',
    extra: [
      'Busca aleatoriamente uma pensata do LO e comenta com auxílio da IA.',
      'Simula digitalmente a <em>bibliomancia</em>, que é o procedimento de abrir aleatoriamente uma página de um livro para alimentar a autopesquisa.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Excelente para instigar as <em>sincronicidades</em> e ajudar na interpretação da pensata (hermenêutica).<br>',
      '<strong>2.</strong> Útil também nas dinâmicas e debates.',
    ].join('\n')
  },

  // Tool: Verbetopedia
  'Verbetopedia': {
    short: '<em>Sugestão de verbetes da Enciclopédia</em>',
    extra: [
      'Indica verbetes afins ao termo de busca. ',
      'Excelente para sugerir verbetes para o aprofundamento da sua pesquisa.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Clique no ícone de <em>configurações</em>.<br>',
      '<strong>2.</strong> Selecione <em>Neologismo</em> para a IA interpretar o termo de busca no sentido conscienciológico.<br>',
      '<strong>3.</strong> Basta clicar no ícone do PDF para baixar o verbete sugerido.<br>',
      '<strong>4.</strong> Ao invés de usar apenas uma palavra simples na busca, tente explicar o que deseja pesquisar, usando expressões compostas, frases ou parágrafos.',
    ].join('\n')
  },

  // Tool: Conscienciogramopedia
  'Conscienciogramopedia': {
    short: '<em>Sugestão de questões do Conscienciograma</em>',
    extra: [
      'Indica questões afins ao termo de busca. ',
      'Ótimo para sugerir questões para o aprofundamento da sua autopesquisa.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Clique no ícone de <em>configurações</em>.<br>',
      '<strong>2.</strong> Selecione <em>Neologismo</em> para a IA interpretar o termo de busca no sentido conscienciológico.<br>',
      '<strong>3.</strong> Consulte o livro original para ver as outras perguntas da mesma folha, a fim de ter uma melhor visão de conjunto.<br>',
      '<strong>4.</strong> Ao invés de usar apenas uma palavra simples na busca, tente explicar o que deseja pesquisar, usando expressões compostas, frases ou parágrafos.',
    ].join('\n')
  },

  // Tool: Verbetes Encyclopedia (external)
  'Enciclopédia da Conscienciologia': {
    short: '<em>Link para o site da Encyclossapiens</em>',
    extra: [
      'Site oficial e atualizado para download de verbetes.',
    ].join('\n'),
  },

  // Tool: ICGE (external)
  'ICGE': {
    short: '<em>Link para o site do ICGE</em>',
    extra: [
      'Portal do ICGE com amplo material da Conscienciologia.',
    ].join('\n'),
  },
  // Tool: Portal da Conscienciologia (external)
  'Portal da Conscienciologia': {
    short: '<em>Link para o portal da Conscienciologia</em>',
    extra: [
      'Acesso ao site central da Conscienciologia.',
    ].join('\\n'),
  }
};

// Map visible H3 titles in index.html to canonical keys in TOOL_MESSAGES
const TOOL_ALIASES = {
  'OpenAI ConsGPT': 'ConsGPT',
  'Google ConsLM': 'ConsLM',
  'Lexical Search': 'Pesquisa Literal',
  'Semantic Search': 'Pesquisa Semântica',
  'Verbetes Encyclopedia': 'Enciclopédia da Conscienciologia',
  // Direct matches (kept for clarity)
  'ConsBOT': 'ConsBOT',
  'Bibliomancia Digital': 'Bibliomancia Digital',
  'Verbetopedia': 'Verbetopedia',
  'Conscienciogramopedia': 'Conscienciogramopedia',
  'ICGE': 'ICGE',
  'Pesquisa Léxica': 'Pesquisa Literal',
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
      const canonical = (typeof TOOL_ALIASES === 'object' && TOOL_ALIASES[key]) || key;
      const msg = TOOL_MESSAGES[canonical];
      if (!msg) return;

      // Native tooltip: use a plain-text version of title/short/extra
      const titleRaw = msg.title || msg.short || msg.extra;
      if (titleRaw) {
        const div = document.createElement('div');
        div.innerHTML = titleRaw;
        const titleText = (div.textContent || '').replace(/\s+/g, ' ').trim();
        if (titleText) {
          card.setAttribute('title', titleText);
        }
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

// Removed page-specific Verbetopedia message injection; page now contains static labels
