// Centralized explanatory texts for index.html
// The goal: keep all user-visible explanatory messages in one place.
// This file sets panel descriptions, tool short descriptions, extra help texts,
// and link titles based on the card/panel names present in index.html.

// Panel descriptions by visible heading (h2)
// Key: exact text of the panel title in the UI
// Value: one-line description shown under the title
const PANEL_DESCRIPTIONS = {

'Bots IA': '<span class="panel-desc-lead">Assistentes de conversação</span>',



  'Busca IA': [
  '<span class="panel-desc-lead">Pesquisa em Livros por IA</span>',
].join('\n'),

  'Apps IA': [
    '<span class="panel-desc-lead">Aplicativos de IA para Pesquisa</span>',
    
  ].join('\n'),

  'Links Externos': '<span class="panel-desc-lead">Links e Recursos Úteis</span>',
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
      '<br>',
      'O <strong>ConsGPT</strong> é o chatbot da OpenAI treinado com os livros e tratados da Conscienciologia.<br>',
      'Ótimo para brainstorming, resumos e conversas em geral.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Experimente enviar o texto que está escrevendo e pedir para ele dar <em>sugestões de melhoria</em>.<br>',
      '<strong>2.</strong> Peça a ele que formule <em>analogias</em> ou <em>metáforas</em> para algum tema.<br>',
      '<strong>3.</strong> Se estiver no smartphone, não deixe de conversar com ele <em>por voz</em>.',
    ].join('\n')
  },

  // Tool: Google ConsLM (NotebookLM)
  'ConsLM': {
    short: '<em>NotebookLM da Google</em>',
    extra: [
      '<br>',
      'O <strong>ConsLM</strong> é o NotebookLM do Google Gemini, alimentado com os textos e tratados da Conscienciologia.<br>',
      'Excelente para resumos e busca de informações em livros, pois fornece a <em>referência</em> do trecho encontrado.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Experimente a seção lateral do <em>studio</em>, com Podcasts e tutoriais de Conscienciologia.<br>',
      '<strong>2.</strong> Veja também os <em>resumos prontos</em> e o <em>mapa de conhecimento</em> gerado por IA.'
    ].join('\n')
  },

  // Tool: ConsBOT (RAG chatbot)
  'ConsBOT': {
    short: '<em>Chatbot da Conscienciologia</em>',
    extra: [
      '<br>',
      'O <strong>ConsBOT</strong> é um projeto experimental de Chatbot RAG da Conscienciologia. ',
      'Possui informações dos tratados e livros do professor Waldo, além de anotações selecionadas das Minitertúlias.<br>', 
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Experimente pedir para ele fazer <em>interrelações</em> entre conceitos e ideias distintas.<br>',
      '<strong>2.</strong> Converse sobre temas avançados da Conscienciologia.<br>',
      '<strong>3.</strong> Aproveite as <em>sugestões de perguntas iniciais</em>, para ter boas ideias do que extrair da IA.',
      '<br><br>',
      '<strong>NOVIDADES: </strong><br>',
      '* Fontes conscienciológicas em <em>inglês</em> e outros idiomas.<br>',
      '* Livros de autores diversos da Conscienciologia.<br>',
      '* Registros das <em>Minitertúlias Conscienciológicas</em>.<br>',
    ].join('\n')
  },

 // Tool: ConsAGENT (RAG chatbot)
 'ConsAGENT': {
  short: '<em>Agente OpenAI (experimental)</em>',
  extra: [
    '<br>',
    'O <strong>ConsAGENT</strong> é um projeto experimental de agente de IA (Chatkit OpenAI) da Conscienciologia. ',
    'Ele pode interagir com você e direcionar de modo inteligente sua solicitação. ',
    'Ainda está em <em>fase de desenvolvimento</em>, mas já consegue resolver problemas, responder perguntas e fornecer informações sobre a Conscienciologia.<br>',
    '<strong>Dicas:</strong><br>',
    '<strong>1.</strong> Análise da escrita de Verbetes.<br>',
    '<strong>2.</strong> Auxílio na elaboração de definições e exemplos.<br>',
    '<strong>3.</strong> Mais funcionalidades em breve...'
  ].join('\n')
},

  // -----------------------------------------------------------------------------------------------------------------------

  // Tool: Search_Book
  'Livros & Tratados': {
    short: 'Busca nos livros e tratados',
    extra: [
      '<br>',
      'Ferramenta de <strong>busca de termos</strong> nos livros e tratados do professor Waldo Vieira.<br>',
      'Realiza pesquisa <em>léxica</em> e/ou <em>semântica</em>.<br>',
      'Ao final baixe a listagem completa dos resultados em <em>Word</em>.<br>.',
    ].join('\n')
  },


  // Tool: Search_Verbetes
  'Definologia de Verbetes': {
    short: 'Busca na Definologia dos verbetes',
    extra: [
      '<br>',
      'Ferramenta de <strong>busca de termos</strong> na <em>Definologia</em> dos verbetes - e não apenas nos títulos.<br>',
      'Realiza pesquisa <em>léxica</em> e/ou <em>semântica</em>.<br>',
      'Ao final baixe a listagem completa dos resultados em <em>Word</em>.<br>',
      'Abra o <em>PDF do verbete</em> diretamente na janela de resultados.',
    ].join('\n')
  },


  // Tool: Search_CCG
  'Questões do Conscienciograma': {
    short: 'Busca no Conscienciograma',
    extra: [
      '<br>',
      'Ferramenta de <strong>busca de termos</strong> nas <em>Questões do Conscienciograma</em>.<br>',
      'Realiza pesquisa <em>léxica</em> e/ou <em>semântica</em>.<br>',
      'Ao final baixe a listagem completa dos resultados em <em>Word</em>.<br>',
    ].join('\n')
  },


  // Tool: Bibliomancia Digital
  'Bibliomancia Digital': {
    short: '<em>Sorteio de ortopensata do Léxico</em>',
    extra: [
      '<br>',
      'Busca aleatoriamente uma pensata do LO e comenta com auxílio da IA. ',
      'Simula digitalmente a <em>bibliomancia</em>, que é o procedimento de abrir ao acaso uma página de um livro para alimentar a autopesquisa.<br>',
      '<strong>Dicas:</strong><br>',
      '<strong>1.</strong> Use-o para instigar as <em>sincronicidades</em>.<br>',
      '<strong>2.</strong> Compare a sua interpretação da pensata (hermenêutica) com a da IA.<br>',
      '<strong>3.</strong> Pode ser usado também como recurso em dinâmicas e debates.',
    ].join('\n')
  },

  
  // Tool: Quiz Conscienciológico
  'Quiz Conscienciológico': {
    short: '<em>Quiz de perguntas & respostas</em>',
    extra: [
      '<br>',
      'Formula perguntas sobre temas da Conscienciologia. ',
      'Você responde às perguntas e a IA avalia a resposta.<br>',
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
  },

  // Tool: Portal de Periódicos (external)
  'Portal de Periódicos': {
    short: '<em>Portal de periódicos da Conscienciologia</em>',
    extra: [
      'Procura e download de periódicos.',
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
  'ConsAGENT': 'ConsAGENT',
  'Pesquisa em Livros & Tratados': 'Livros & Tratados', // ajuste aqui
  'Definologia de Verbetes': 'Definologia de Verbetes',
  'Questões do Conscienciograma': 'Questões do Conscienciograma',
  'Quiz Conscienciológico': 'Quiz Conscienciológico',
  'Bibliomancia Digital': 'Bibliomancia Digital',
  'Caderno de Estudos': 'Caderno de Estudos'
};

// Apply messages to the DOM
// Finds panels and tool cards and injects the corresponding text.
function applyMessages() {
  try {
   
    document.querySelectorAll('.tool-panel .panel-header .panel-info').forEach(info => {
      const p = info.querySelector('p');
      if (!p) return;

      const h2 = info.querySelector('h2');
      const title = h2 ? h2.textContent.trim() : '';

      // 1) Preferir descrição pelo título visível
      let descr = (typeof PANEL_DESCRIPTIONS === 'object' && PANEL_DESCRIPTIONS[title]) || '';
    if (!descr) {
      const panel = info.closest('.tool-panel');
      if (panel) {
        if (panel.classList.contains('bots')) {
          descr = 'Assistentes de conversação';
        } else if (panel.classList.contains('busca')) {
          descr = 'Pesquisa léxica e semântica';
        } else if (panel.classList.contains('apps')) {
          descr = 'Aplicativos para autopesquisa';
        } else if (panel.classList.contains('utils')) {
          descr = 'Links e recursos úteis';
        }
      }
    }

  if (descr) p.innerHTML = descr; // permitir HTML nos textos do painel
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
        // Dentro do try { const href = ... }:
        if (href.includes('index_search_book.html')) {
          canonical = 'Livros & Tratados'; // ajuste aqui
        } else if (href.includes('index_search_verb.html')) {
          canonical = 'Definologia de Verbetes';
        } else if (href.includes('index_search_ccg.html')) {
          canonical = 'Questões do Conscienciograma';
        } else if (href.includes('index_mancia.html')) {
          canonical = 'Bibliomancia Digital';
        } else if (href.includes('index_quiz.html')) {
          canonical = 'Quiz Conscienciológico';
        } else if (href.includes('index_deepdive.html')) {
          canonical = 'Caderno de Estudos';
        }



      } catch (e) { 
        console.error('Error occurred while processing href:', e); 
      }

      let msg = TOOL_MESSAGES[canonical];
      // Fallbacks for encoding-mangled keys based on href
      try {
        const href2 = (card.getAttribute('href') || '').toLowerCase();
        if (!msg && href2.includes('index_search_book.html')) {
          msg = TOOL_MESSAGES['Livros & Tratados'] || msg;
        }
        if (!msg && href2.includes('index_search_verb.html')) {
          msg = TOOL_MESSAGES['Definologia de Verbetes'] || msg;
        }
        if (!msg && href2.includes('index_search_ccg.html')) {
          msg = TOOL_MESSAGES['Questões do Conscienciograma'] || msg;
        }
        if (!msg && href2.includes('index_mancia.html')) {
          msg = TOOL_MESSAGES['Bibliomancia Digital'] || msg;
        }
        if (!msg && href2.includes('index_quiz.html')) {
          msg = TOOL_MESSAGES['Quiz Conscienciológico'] || msg;
        }
        if (!msg && href2.includes('index_deepdive.html')) {
          msg = TOOL_MESSAGES['Caderno de Estudos'] || msg;
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
