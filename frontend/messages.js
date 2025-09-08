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

  // Panel: AI Lexical Search
  'IA Search': 'Pesquisa em Livros por IA',

  // Panel: AI Semantical Search
  'IA Semantical Search': 'Pesquisa Semântica por Afinidade',

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
    short: '<em>ChatGPT da OpenAI</em>',
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
    short: '<em>NotebookLM da Google</em>',
    extra: [
      'O <strong>ConsLM</strong> é o NotebookLM do Google Gemini, alimentado com os textos e tratados da Conscienciologia. ',
      'Excelente para resumos e busca de informações em livros, pois fornece a <em>referência</em> do trecho encontrado.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Experimente a seção lateral de <em>Podcasts de Conscienciologia</em>.<br>',
      '<strong>2.</strong> Veja também os <em>resumos prontos</em> e o <em>mapa de conhecimento</em> gerado por IA.'
    ].join('\n')
  },

  // Tool: ConsBOT (RAG chatbot)
  'ConsBOT': {
    short: '<em>Chatbot experimental</em>',
    extra: [
      'O <strong>ConsBOT</strong> é um projeto experimental de Chatbot RAG da Conscienciologia. ',
      'Possui informações dos tratados e livros do professor Waldo, além de anotações selecionadas das Minitertúlias.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Experimente pedir para ele fazer <em>interrelações</em> entre conceitos e ideias distintas.<br>',
      '<strong>2.</strong> Converse sobre temas avançados da Conscienciologia.<br>',
    ].join('\n')
  },

  // Tool: Lexical Search
  'Pesquisa em Livros': {
    short: '<em>Busca de termos exatos</em>',
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


  // Tool: Lexical Verbetes
  'Definologia de Verbetes': {
    short: '<em>Busca de termos exatos em verbetes</em>',
    extra: [
      'Encontra os parágrafos de verbetes que contenham os termos exatos (literais). ',
      'Útil para listar ocorrências de certas palavras ou expressões nas obras da Conscienciologia.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Clique no ícone de <em>configurações</em>.<br>',
      '<strong>2.</strong> Selecione os <em>verbetes</em> em que deseja buscar.<br>',
      '<strong>3.</strong> Ajuste o número máximo de resultados para limitar a pesquisa.<br>',
      '<strong>4.</strong> Ao final, clique no ícone do Word para baixar os resultados.',
    ].join('\n')
  },



  // Tool: Semantic Search
  'Pesquisa Semântica em Livros': {
    short: '<em>Busca semântica de parágrafos</em>',
    extra: [
      'Encontra os parágrafos de livros que são <em>semanticamente</em> relacionados à busca, independentemente da presença do termo exato. ',
      'Útil para pesquisar temas e ideias correlatas ou afins.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Clique no ícone de <em>configurações</em>.<br>',
      '<strong>2.</strong> Selecione os <em>livros</em> em que deseja buscar.<br>',
      '<strong>2.</strong> Ative <em>Neologismo</em> para a IA interpretar o termo de busca no sentido conscienciológico - isso melhora a qualidade dos resultados.<br>',
      '<strong>4.</strong> Ajuste o número máximo de resultados para limitar a pesquisa.<br>',
      '<strong>5.</strong> Escolha também se quer agrupar por <em>livro</em>, ou elencar por <em>índice de similaridade</em>.<br>',
      '<strong>6.</strong> Ao invés de usar apenas uma palavra na busca, tente explicar sua pesquisa usando frases ou parágrafos.<br>',
      '<strong>7.</strong> Ao final, clique no ícone do Word para baixar os resultados.',
    ].join('\n')
  },


  // Tool: Verbetopedia
  'Verbetopedia': {
    short: '<em>Busca semântica de verbertes</em>',
    extra: [
      'Indica verbetes afins ao termo de busca. ',
      'Excelente para sugerir verbetes para o aprofundamento da sua pesquisa.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Clique no ícone de <em>configurações</em>.<br>',
      '<strong>2.</strong> Selecione <em>Neologismo</em> para a IA interpretar o termo de busca no sentido conscienciológico.<br>',
      '<strong>3.</strong> Basta clicar no ícone do PDF para baixar o verbete sugerido.<br>',
      '<strong>4.</strong> Ao invés de usar apenas uma palavra simples na busca, tente explicar sua pesquisa usando frases ou parágrafos.',
    ].join('\n')
  },

// Tool: Conscienciogramopedia
'Questões do Conscienciograma': {
  short: '<em>Busca semântica de questões</em>',
  extra: [
    'Indica questões do Conscienciograma afins ao termo de busca. ',
    'Ótimo para sugerir questões para o aprofundamento da sua autopesquisa.<br>',
    '<strong>Dicas:</strong><br>',
    '<strong>1.</strong> Clique no ícone de <em>configurações</em>.<br>',
    '<strong>2.</strong> Selecione <em>Neologismo</em> para a IA interpretar o termo de busca no sentido conscienciológico.<br>',
    '<strong>3.</strong> Consulte o livro original para ver as outras perguntas da mesma folha, a fim de ter uma melhor visão de conjunto.<br>',
    '<strong>4.</strong> Ao invés de usar apenas uma palavra simples na busca, tente explicar o que deseja pesquisar, usando expressões compostas, frases ou parágrafos.',
  ].join('\n')
},



  // Tool: Bibliomancia Digital
  'Bibliomancia Digital': {
    short: '<em>Sorteio de Ortopensata do LO</em>',
    extra: [
      'Busca aleatoriamente uma pensata do LO e comenta com auxílio da IA.',
      'Simula digitalmente a <em>bibliomancia</em>, que é o procedimento de abrir aleatoriamente uma página de um livro para alimentar a autopesquisa.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Use-o para instigar as <em>sincronicidades</em>.<br>',
      '<strong>2.</strong> Compare a sua interpretação da pensata (hermenêutica) com a da IA.<br>',
      '<strong>2.</strong> Pode ser usado também como recurso em dinâmicas e debates.',
    ].join('\n')
  },

  
  // Tool: Quiz Conscienciológico
  'Quiz Conscienciológico': {
    short: '<em>Quiz de Perguntas & Respostas</em>',
    extra: [
      'Formula perguntas sobre temas da Conscienciologia.',
      'Você responde as perguntas e a IA avalia a resposta.',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Use-o para testar o seu conhecimento da Conscienciologia.<br>',
      '<strong>2.</strong> Útil também para estudo e aprofundamento dos temas conscienciológicos.',
    ].join('\n')
  },


  // Tool: ICGE (external)
    'ICGE': {
      short: '<em>Site do ICGE</em>',
      extra: [
        'Informações e material da Conscienciologia.',
      ].join('\n'),
    },

  // Tool: Verbetes Encyclopedia (external)
  'Enciclopédia da Conscienciologia': {
    short: '<em>Download de verbetes</em>',
    extra: [
      'Site da Encyclossapiens.',
    ].join('\n'),
  },

  
  // Tool: Portal da Conscienciologia (external)
  'Portal da Conscienciologia': {
    short: '<em>Site central da Conscienciologia</em>',
    extra: [
      'Portal geral da CCCI.',
    ].join('\\n'),
  }
};



// '<strong>Observação:</strong> os sistemas RAG funcionam com busca vetorial. No momento, o ConsBOT não possui informações do <em>número da página</em> das fontes de referência. ',
//       'Para obter essa informação, é necessário consultar o livro na edição desejada. ',
//       'O ConsBOT é um <em>minimecanismo</em> de IA em evolução.',




// Map visible H3 titles in index.html to canonical keys in TOOL_MESSAGES
const TOOL_ALIASES = {
  'OpenAI ConsGPT': 'ConsGPT',
  'Google ConsLM': 'ConsLM',
  'Pesquisa em Livros': 'Pesquisa em Livros',
  'Definologia de Verbetes': 'Definologia de Verbetes',
  'Pesquisa Semântica em Livros': 'Pesquisa Semântica em Livros',
  'Questões do Conscienciograma': 'Questões do Conscienciograma',
  'Quiz Conscienciológico': 'Quiz Conscienciológico',
  'Bibliomancia Digital': 'Bibliomancia Digital'
};

// Apply messages to the DOM
// Finds panels and tool cards and injects the corresponding text.
function applyMessages() {
  try {
    // Panels: set description under each h2 (robust by panel group class)
    document.querySelectorAll('.tool-panel .panel-header .panel-info').forEach(info => {
      const p = info.querySelector('p');
      if (!p) return;
      const panel = info.closest('.tool-panel');
      if (!panel) return;
      let descr = '';
      if (panel.classList.contains('bots')) {
        descr = 'Assistentes de Conversação por IA';
      } else if (panel.classList.contains('search')) {
        descr = 'Pesquisa léxica por termos exatos';
      } else if (panel.classList.contains('sem')) {
        descr = 'Pesquisa semântica por afinidade';
      } else if (panel.classList.contains('apps')) {
        descr = 'Aplicativos de IA para Pesquisa';
      } else if (panel.classList.contains('utils')) {
        descr = 'Links e Recursos Úteis';
      }
      if (descr) p.textContent = descr;
    });

    // Tool cards: set title, short description, and extra help
    document.querySelectorAll('.tool-card').forEach(card => {
      const titleEl = card.querySelector('.tool-info h3');
      if (!titleEl) return;
      const key = titleEl.textContent.trim();
      let canonical = (typeof TOOL_ALIASES === 'object' && TOOL_ALIASES[key]) || key;

      // Disambiguate by href when titles are reused (e.g., "Livros & Tratados")
      try {
        const href = (card.getAttribute('href') || '').toLowerCase();
        if (href.includes('index_lexical.html')) {
          canonical = 'Pesquisa em Livros';
        } else if (href.includes('index_lexverb.html')) {
          canonical = 'Definologia de Verbetes';
        } else if (href.includes('index_semantical.html')) {
          canonical = 'Pesquisa Semântica em Livros';
        } else if (href.includes('index_verbetopedia.html')) {
          canonical = 'Verbetopedia';
        } else if (href.includes('index_ccg.html')) {
          canonical = 'Questões do Conscienciograma';
        } else if (href.includes('index_mancia.html')) {
          canonical = 'Bibliomancia Digital';
        } else if (href.includes('index_quiz.html')) {
          canonical = 'Quiz Conscienciológico';
        }


      } catch (e) { 
        console.error('Error occurred while processing href:', e); 
      }

      let msg = TOOL_MESSAGES[canonical];
      // Fallbacks for encoding-mangled keys based on href
      try {
        const href2 = (card.getAttribute('href') || '').toLowerCase();
        if (!msg && href2.includes('index_quiz.html')) {
          msg = TOOL_MESSAGES['Quiz Conscienciológico'] || msg;
        }
        if (!msg && href2.includes('index_semantical.html')) {
          msg = TOOL_MESSAGES['Pesquisa Semântica em Livros'] || msg;
        }

        if (!msg && href2.includes('index_verbetopedia.html')) {
          msg = TOOL_MESSAGES['Verbetopedia'] || msg;
        }
        if (!msg && href2.includes('index_ccg.html')) {
          msg = TOOL_MESSAGES['Questões do Conscienciograma'] || msg;
        }

      } catch (e) { 
        console.error('Error occurred while processing href2:', e); 
      }

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
} // Added the missing closing brace here

// Run after DOM is ready
document.addEventListener('DOMContentLoaded', applyMessages);

// Removed page-specific Verbetopedia message injection; page now contains static labels
