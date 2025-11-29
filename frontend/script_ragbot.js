// script_ragbot.js

// Listas fixas de perguntas por modo/vector store.
// Mantém toda a configuração de suggestions fixas em um único lugar.
const FIXED_QUESTIONS = {
  ENGLISH: [
    'List five essential steps I need to take in order to begin the practice of Tenepes (Penta).',
    'How can I determine where I stand on the Evolutionary Scale of the Consciousness?',
    'What does Proexis (Existential Program) mean, and how can one identify their own existential programming?',
    'What is Conscientiometry, and how can the Conscientiogram be applied in personal self-evaluation?',
    'What is the role of Extraphysical Reurbanizations (Reurbexes) in the evolutionary context of the planet?',
    'Discuss the Extraphysical Communities (Communexes) and their connection with Intermissive Courses.',
    'How can I know if I am an Existential Completist (Complexis)? Which indicators should I observe?',
    'What are the main signs of energetic self-deassimilation (deassim)?',
    'I have several potential topics for writing my book. Could you help me select some of them and indicate possible conscientiological approaches?',
    'I had a projection in which I saw myself wearing clothing from another era. I will describe it so you can suggest the possible time and location for my retrocognitive research (retrocognition).',
  ],

  REVISTAS: [
    'Como desenvolver a sinalética parapsíquica na prática assistencial?',
    'Quais são os principais desafios na implantação da cosmoética na vida cotidiana?',
    'De que forma posso promover o meu desassédio pessoal?',
    'O que é a pangrafia parapsíquica e como pode ser desenvolvida?',
    'Como identificar uma consciex amparadora?',
    'O que é mobilização básica de energias (MBE)?',
    'Liste 10 diferenças entre parapsiquismo primário e avançado.',
    'Quais são as etapas do ciclo multiexistencial pessoal (CMP)?',
    'O que são pensenes patológicos?',
    'O que é o encapsulamento energético?',
  ],

  AUTORES: [
    'Liste 5 coisas que preciso fazer para iniciar a prática da Tenepes.',
    'Com posso saber onde me localizo nos níveis da Escala Evolutiva?',
    'O que significa Proéxis e como identificar a própria programação existencial?',
    'O que é a Conscienciometria e como aplicar o Conscienciograma na autoavaliação pessoal?',
    'Qual o papel das Reurbanizações Extrafísicas (Reurbexes) no contexto evolutivo do planeta?',
    'Fale sobre as Comunidades Extrafísicas (Comunexes) e sua relação com os Cursos Intermissivos.',
    'Como saber sou completista? Quais os indicadores devo observar?',
    'Cite os principais sinais da autodesassimilação energética (desassim).',
    'Estou com várias ideias de tema para escrever o meu livro. Pode me ajudar a selecionar algumas, e me apontar possíveis abordagens conscienciológicas?',
    'Tive uma projeção em que me vi com roupas de época. Vou descrever para você indicar o possível período e local, para minha pesquisa retrocognitiva.',
  ],



  MINI: [
    'Quais são as principais características do evoluciólogo, e como sua atuação difere da de outros amparadores?',
    'De que modo as comunexes evoluídas influenciam nos resgates extrafísicos durante as reurbexes?',
    'Quais são os principais desafios dos intermissivistas ao tentar manter a lucidez contínua nas projeções?',
    'Quais são os indicadores do completismo existencial mais debatidos nas minitertúlias, e como avaliá-los?',
    'De que maneira a anticonflitividade é considerada fundamental para a assistência avançada?',
    'Como o conceito de autodesassedialidade é explorado nos debates avançados das minitertúlias?',
    'Como a Conscienciologia aborda a questão do autodesassédio mentalsomático?',
    'Quais os exemplos de parafenômenos avançados relatados e analisados nas minitertúlias?',
    'Como a Pré-Intermissiologia aborda a questão da liderança interassistencial e seus efeitos evolutivos?',
    'Quais são as diferenças entre o evoluciólogo júnior (planetário) e o evoluciólogo sênior (interplanetário)?',
    'Quais são os principais atributos conscienciais para alcançar o patamar de evoluciólogo?',
  ],

  // Lista padrão em português (usada para WALDO ou qualquer outro modo não mapeado acima)
  DEFAULT_PT: [
    'Liste 5 coisas que preciso fazer para iniciar a prática da Tenepes.',
    'Com posso saber onde me localizo nos níveis da Escala Evolutiva?',
    'O que significa Proéxis e como identificar a própria programação existencial?',
    'O que é a Conscienciometria e como aplicar o Conscienciograma na autoavaliação pessoal?',
    'Qual o papel das Reurbanizações Extrafísicas (Reurbexes) no contexto evolutivo do planeta?',
    'Fale sobre as Comunidades Extrafísicas (Comunexes) e sua relação com os Cursos Intermissivos.',
    'Como saber sou completista? Quais os indicadores devo observar?',
    'Cite os principais sinais da autodesassimilação energética (desassim).',
    'Estou com várias ideias de tema para escrever o meu livro. Pode me ajudar a selecionar algumas, e me apontar possíveis abordagens conscienciológicas?',
    'Tive uma projeção em que me vi com roupas de época. Vou descrever para você indicar o possível período e local, para minha pesquisa retrocognitiva.',
  ],
};

let controller = null;
let chatHistory = [];
const RAGBOT_CHAT_SCOPE = 'ragbot';


// Estado atual dos parâmetros dinâmicos do RAGbot (vector store + instruções)
let currentRagbotVectorStore = null;
let currentRagbotInstructions = null;

// Registry de chat_ids por escopo (ragbot, quiz, etc.)
const _chatIds = {};


// Expor refs no escopo global para integrações (reset, etc.)
window.chatHistory = chatHistory;
window.abortRagbot = function abortRagbot() {
  try { if (controller) controller.abort(); } catch {}
};



// registra os listeners UMA única vez
document.addEventListener('DOMContentLoaded', () => {
    const searchButton = document.getElementById('searchButton');
    const searchInput = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('results');
    const chatMessages = document.getElementById('chatMessages');
    const searchRow = document.querySelector('.search-row');

    
    searchButton.addEventListener('click', ragbot);
    searchInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') ragbot();
    });

    // Expor função para aplicar a config atual do RAGbot (books → modo principal / idioma).
    // Pode ser chamada tanto no carregamento da página quanto após salvar a janela de config.
    // Não limpa o chat por si só; isso é responsabilidade do chamador (por exemplo, o painel de config).
    window.ragbotApplyConfig = function ragbotApplyConfig() {
      // Define modo inicial do RAGbot com base na configuração salva (appConfig_ragbot).
      // Se não houver config, usa o padrão ALLWV (WALDO).
      try {
        let books = null;
        try {
          const raw = localStorage.getItem('appConfig_ragbot');
          if (raw) {
            const settings = JSON.parse(raw);
            if (Array.isArray(settings.books)) {
              books = settings.books;
            }
          }
        } catch {}

        const set = new Set(books || ['ALLWV']);

        // Heurística simples de prioridade: ENGLISH > AUTORES > REVISTAS > WALDO
        let initialMode = 'WALDO';
        if (set.has('ENGLISH')) {
          initialMode = 'ENGLISH';
        } else if (set.has('AUTORES')) {
          initialMode = 'AUTORES';
        } else if (set.has('MINI')) {
          initialMode = 'MINI';
        } else {
          initialMode = 'WALDO';
        }

        // Aplica modo inicial (isso também pode atualizar badges/sugestões, se permitido pela flag usada).
        setRagbotMode(initialMode);
      } catch {}
    };

    // Aplica imediatamente a config atual ao carregar a página.
    try {
      if (window.ragbotApplyConfig) window.ragbotApplyConfig();
    } catch {}




    //______________________________________________________________________________________________
    // RAGbot
    //______________________________________________________________________________________________
    async function ragbot() {


      console.log('<<< ragbot >>>');


      // Save original button state for restoration
      const originalButtonState = {
        html: searchButton.innerHTML,
        opacity: searchButton.style.opacity,
        cursor: searchButton.style.cursor
      };

        // If already disabled, prevent re-entry by click/Enter
        if (searchButton?.disabled) return;

        
        // Disable and show "searching" (mesmo padrão visual de search_book,
        // com um leve spinner interno no ícone)
        searchButton.disabled = true;
        searchButton.style.opacity = '0.7';
        searchButton.style.cursor = 'not-allowed';
        try { searchButton.classList.add('ragbot-loading'); } catch {}


        // Abort previous request, if any
        if (controller) controller.abort();
        controller = new AbortController();



        try {

        // Clean previous results
        resultsDiv.innerHTML = '';
        let chatMessage_id = null;


         // =======================================================================================
        // 0. Prepare search    
        // =======================================================================================
        const term = searchInput.value.trim();



        // Validação de termo - sai cedo, mas ainda passa pelo finally
        if (!term) {
            resultsDiv.innerHTML = '<p class="error">Please enter a search term</p>';
            return;
        }

      
          // Remove initial suggestions if present (manual message sent)
          try { searchInput.dataset.lastQuery = term; } catch {}

          // Remove initial suggestions if present (manual message sent)
          try {
            const initial = document.getElementById('initial-quests');
            if (initial) initial.remove();
          } catch {}

          // Remove pergunta antiga do usuário
          removeUserMessages();
          
          //removeChatMessage(loadingId);
          cleanChat();

          
          // Clear input, mostrando mensagem adequada ao idioma/mode atual
          if (currentRagbotVectorStore === 'ENGLISH') {
            searchInput.value = 'Consulting ConsBOT...';
          } else {
            searchInput.value = 'Consultando o ConsBOT...';
          }
          searchInput.style.height = 'auto';


          // Add user message to chat
          chatMessage_id = addChatMessage('user', term);

          // Add loading message
          //const loadingId = addChatMessage('bot', '<i class="fas fa-spinner fa-spin"></i> Thinking...', true);

             
          //call_ragbot
          //*****************************************************************************************
          // 
          const chat_id = getOrCreateChatId(RAGBOT_CHAT_SCOPE);
    

          // Define os vector stores ativos: por padrão usa o modo corrente,
          // mas, se houver configuração em appConfig_ragbot, envia TODOS os
          // "books" selecionados como lista de vector stores.
          let vectorStores = currentRagbotVectorStore;
          try {
            const rawCfg = localStorage.getItem('appConfig_ragbot');
            if (rawCfg) {
              const settings = JSON.parse(rawCfg);
              if (Array.isArray(settings.books) && settings.books.length > 0) {
                // Usa diretamente os ids lógicos (ALLWV, AUTORES, MINI, ENGLISH, ...)
                vectorStores = settings.books.slice();
              }
            }
          } catch {}

          const paramRAGbot = {
            query: term,
            model: (window.CONFIG?.MODEL_RAGBOT ?? MODEL_RAGBOT),
            temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
            vector_store_names: vectorStores,
            instructions: currentRagbotInstructions,
            reasoning_effort: "none",
            verbosity: "low",
            use_session: true,
            chat_id: chat_id
          };
          
          const response = await call_llm({
            ...paramRAGbot,
            timeout_ms: 120000, // 120s to accommodate server retries and OpenAI latency
            signal: controller.signal
          });
          
          console.info('[ragbot] full response from backend:', response);
          
          // Handle special cases: error or abort case
          if (!response || response.error || response.abort) {
            const errorMessage = response?.error || response?.message || 'Erro ao chamar o backend.';
            addChatMessage('bot', `⚠️ ${errorMessage}`);
            return;
          }
          
          
          // *****************************************************************************************

          // Add bot message
          const botText = response.text ?? response.response ?? '';
          chatMessage_id = addChatMessage('bot', botText, false);

          // Clear input
          searchInput.value = '';
          searchInput.style.height = 'auto';

          
          // Mostra os metadados do response em Badges, logo após o texto da resposta
          // ------------------------------------------------------------------------   
          const metaData = extractMetadata(response, 'ragbot');
          // const citations = metaData?.citations;
          // const total_tokens_used = metaData?.total_tokens_used;
          // const model = metaData?.model;
          // const temperature = metaData?.temperature;
          // const vector_store_names = window.CONFIG?.OPENAI_RAGBOT;

          //console.log('<<Script_RAGbot>> metaData:', metaData);
          
          const botMessageEl = document.getElementById(chatMessage_id).querySelector('.message-content');
          showBotMetainfo(botMessageEl, metaData); 
          
          
          // Store in chat history
          chatHistory.push({
            user: term,
            bot: botText || 'Sorry, I could not generate a response.',
            timestamp: new Date().toISOString()
          });


        } catch (error) {
            console.error('Error in ragbot:', error);

            // Remove loading message and show error
            const loadingMessages = document.querySelectorAll('.chat-message.loading');
            loadingMessages.forEach(msg => msg.remove());
            
            chatMessage_id = addChatMessage('bot', `Sorry, there was an error: ${error.name === 'AbortError' ? 'Request timed out' : error.message || 'An unexpected error occurred'}`);

        } finally {
          // Re-enable the search button and restore original state
          if (searchButton) {
              searchButton.disabled = false;
              searchButton.innerHTML = originalButtonState.html;
              searchButton.style.opacity = originalButtonState.opacity;
              searchButton.style.cursor = originalButtonState.cursor;
              try { searchButton.classList.remove('ragbot-loading'); } catch {}
          }
          
          controller = null;
        }
   

          
            // Dismiss loading state
            //removeChatMessageById(chatMessage_id);
          
    }


    //______________________________________________________________________________________________
    // Seletor de modo do RAGbot (WALDO / AUTORES / REVISTAS / INGLÊS)
    //______________________________________________________________________________________________
    async function setRagbotMode(mode) {
      switch (mode) {
        case 'AUTORES':
          // 2) AUTORES: OPENAI_RAGBOT = "AUTORES"; INSTRUCTIONS_RAGBOT = INST_AUTORES
          currentRagbotVectorStore = 'AUTORES';
          currentRagbotInstructions = INSTRUCTIONS_RAGBOT;
          break;

        case 'REVISTAS':
          // 3) REVISTAS: OPENAI_RAGBOT = "REVISTAS"; INSTRUCTIONS_RAGBOT = INST_REVISTAS
          currentRagbotVectorStore = 'REVISTAS';
          currentRagbotInstructions = INSTRUCTIONS_RAGBOT;
          break;

        case 'ENGLISH':
          // 4) INGLES: OPENAI_RAGBOT = "INGLES"; INSTRUCTIONS_RAGBOT = INST_INGLES
          currentRagbotVectorStore = 'ENGLISH';
          currentRagbotInstructions = INST_ENGLISH;
          break;

        case 'WALDO':
        default:
          // 1) WALDO: OPENAI_RAGBOT = "ALLWV"; INSTRUCTIONS_RAGBOT = INST_NORMAL
          currentRagbotVectorStore = 'ALLWV';
          currentRagbotInstructions = INSTRUCTIONS_RAGBOT;
          break;

        case 'MINI':
          // 5) MINI: OPENAI_RAGBOT = "MINI"; INSTRUCTIONS_RAGBOT = INST_MINI
          currentRagbotVectorStore = 'MINI';
          currentRagbotInstructions = INSTRUCTIONS_RAGBOT;
          break;
      }

      // Reflete no CONFIG, caso outros módulos usem
      try {
        if (!window.CONFIG) window.CONFIG = {};
        window.CONFIG.OPENAI_RAGBOT = currentRagbotVectorStore;
        window.CONFIG.INSTRUCTIONS_RAGBOT = currentRagbotInstructions;
      } catch {}

      // Tema de cor permanece fixo para o RagBOT; não alteramos mais a cor global por modo.

      // Ajusta o placeholder da caixa de entrada conforme o modo selecionado
      try {
        if (searchInput) {
          if (currentRagbotVectorStore === 'ENGLISH') {
            searchInput.placeholder = 'Hello, Conscientiologist!';
          } else {
            searchInput.placeholder = 'Olá conscienciólogo!';
          }
        }
      } catch {}

      // Exibe a linha de busca somente após a escolha do modo
      try {
        const row = document.querySelector('.search-row');
        if (row) {
          row.style.display = '';
        }
      } catch {}

      // Após definir o modo, se ainda não houver sugestões iniciais e o chat estiver vazio,
      // cria as sugestões FIXAS para o modo atual, mas apenas depois que o usuário
      // tiver configurado o RagBOT pelo menos uma vez.
      try {
        const hasInitial = document.getElementById('initial-quests');
        let shouldShow = false;
        try {
          shouldShow = localStorage.getItem('appConfig_ragbot_used') === 'true';
        } catch {}

        if (shouldShow && !hasInitial && chatMessages && (!chatMessages.children || chatMessages.children.length === 0)) {
          initialQuests('fixed');
        }
      } catch {}

      // Fluxo de UI:
      // 1) Esconder a barra completa de badges de modo/idioma após a escolha.
      // 2) Mostrar, abaixo da caixa de entrada, UM BADGE PARA CADA MODO selecionado em config,
      //    lado a lado, mas somente depois que o usuário tiver configurado o RagBOT
      //    pelo menos uma vez (appConfig_ragbot_used = 'true').
      try {
        const modesContainer = document.getElementById('ragbot-modes');
        if (modesContainer) {
          modesContainer.style.display = 'none';
        }

        // Lê os "books" configurados em appConfig_ragbot
        let books = null;
        try {
          const raw = localStorage.getItem('appConfig_ragbot');
          if (raw) {
            const settings = JSON.parse(raw);
            if (Array.isArray(settings.books)) {
              books = settings.books;
            }
          }
        } catch {}

        const set = new Set(books || ['ALLWV']);

        // Mapeia cada book para o respectivo rótulo exibido no badge
        const bookToLabel = {
          'ALLWV':   'Bibliografia Waldo Vieira',
          'AUTORES': 'Autores Diversos',
          'REVISTAS':'Artigos de Periódicos',
          'MINI':    'Minitertúlia',
          'ENGLISH': 'Bibliography in English'
        };

        // Posiciona os badges em um container dedicado logo ABAIXO da linha inteira de busca
        // (.search-row: textarea + botão), em uma nova linha alinhada à direita.
        let searchRow = null;
        try {
          if (searchInput && typeof searchInput.closest === 'function') {
            searchRow = searchInput.closest('.search-row');
          }
        } catch {}

        if (!searchRow && searchInput && searchInput.parentNode && searchInput.parentNode.parentNode) {
          // Fallback: assume estrutura padrão .search-row > .search-input-wrapper > textarea
          searchRow = searchInput.parentNode.parentNode;
        }

        // Só desenha os badges de modo se o usuário já tiver passado pela
        // configuração pelo menos uma vez.
        let canRenderBadges = false;
        try {
          canRenderBadges = localStorage.getItem('appConfig_ragbot_used') === 'true';
        } catch {}

        const rowParent = searchRow && searchRow.parentNode;
        if (canRenderBadges && rowParent && searchRow) {
          let container = document.getElementById('ragbot-current-mode-container');
          if (!container) {
            container = document.createElement('div');
            container.id = 'ragbot-current-mode-container';
          }

          // Insere o container imediatamente após a .search-row (nova linha)
          if (searchRow.nextSibling) {
            rowParent.insertBefore(container, searchRow.nextSibling);
          } else {
            rowParent.appendChild(container);
          }

          // Limpa badges anteriores
          container.innerHTML = '';

          // Cria um badge por modo configurado, lado a lado
          set.forEach(bookKey => {
            const label = bookToLabel[bookKey];
            if (!label) return;
            const badge = document.createElement('span');
            badge.className = 'ragbot-mode-badge ragbot-mode-current';
            badge.textContent = label;
            container.appendChild(badge);
          });
        }
      } catch {}

      // Disponibiliza um reset global dos modos RagBot (volta para WALDO)
      window.resetRagbotModes = function () {
        try {
          setRagbotMode('WALDO');  // modo padrão
        } catch (e) {
          console.warn('resetRagbotModes: falha ao resetar modo RagBot', e);
        }
      };

    }

    //______________________________________________________________________________________________
    // addChatMessage
    //______________________________________________________________________________________________
    // Function to add chat messages
    function addChatMessage(sender, content, isLoading = false) {

     
        const messageId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}${isLoading ? ' loading' : ''}`;
        messageDiv.id = messageId;
        
        // Build avatar only when needed to avoid extra left-side circles
        let avatar = null;
        // Show avatar only for the user; never for the bot
        const shouldShowAvatar = (sender === 'user');
        if (shouldShowAvatar) {
            avatar = document.createElement('div');
            avatar.className = `message-avatar ${sender}`;
            avatar.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
        }

        const messageContent = document.createElement('div');
        messageContent.className = `message-content${sender === 'user' ? ' user' : ''}`;
        
        if (sender === 'bot' && !isLoading) {
            // Render markdown for bot messages and wrap with markdown-content for styling
            const rawHtml = renderMarkdown(content);
            const safeHtml = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml) : rawHtml;
            messageContent.innerHTML = `<div class="markdown-content">${safeHtml}</div>`;
        } else {
            messageContent.innerHTML = `${content}`;
        }

        if (avatar) messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);
        
        
        // Keep chronological order: append at the bottom
        // Insert logic: keep newest question at the top (no scroll dependency)
        if (sender === 'user') {
            // Always place user's question at the very top
            if (chatMessages.firstChild) {
                chatMessages.insertBefore(messageDiv, chatMessages.firstChild);
            } else {
                chatMessages.appendChild(messageDiv);
            }
        } else {
            // Bot message (including loading): place right below the latest user message at top
            const firstEl = chatMessages.firstElementChild;
            if (firstEl && firstEl.classList && firstEl.classList.contains('user')) {
                // Insert after the first (top) user message
                if (firstEl.nextSibling) {
                    chatMessages.insertBefore(messageDiv, firstEl.nextSibling);
                } else {
                    chatMessages.appendChild(messageDiv);
                }

            } else {
                // Fallback: if no user message found, append at top
                if (chatMessages.firstChild) {
                    chatMessages.insertBefore(messageDiv, chatMessages.firstChild);
                } else {
                    chatMessages.appendChild(messageDiv);
                }
            }
        }

        return messageId;
    }



    // Remove all user messages
    function removeUserMessages() {
      if (!chatMessages) return;
      const userMessages = chatMessages.querySelectorAll('.chat-message.user');
      userMessages.forEach(msg => msg.remove());
    }
    

    // Remove old chat messages while keeping the latest user question at top
    function cleanChat() {
        try {
            // Remove initial suggestions if still present
            const initial = document.getElementById('initial-quests');
            if (initial) initial.remove();
        } catch {}

        if (!chatMessages) return;

        const first = chatMessages.firstElementChild;
        // If the first element is the latest user message, keep it and remove the rest
        if (first && first.classList && first.classList.contains('user')) {
            let node = first.nextSibling;
            while (node) {
                const next = node.nextSibling;
                chatMessages.removeChild(node);
                node = next;
            }
        } else {
            // Otherwise, clear everything for a clean slate
            chatMessages.textContent = '';
        }
    }



    // -------------------------------------------------------------------------------
    // Initial Questions
    // -------------------------------------------------------------------------------
    async function initialQuests(quest_type) {
  
        // Não mostrar se já houver mensagens
        if (chatMessages && chatMessages.children && chatMessages.children.length > 0) return;

        let suggestions = [];


        if (quest_type === 'fixed') {

          let key;
          if (currentRagbotVectorStore === 'ENGLISH') {
            key = 'ENGLISH';
          } else if (currentRagbotVectorStore === 'REVISTAS') {
            key = 'REVISTAS';
          } else if (currentRagbotVectorStore === 'AUTORES') {
            key = 'AUTORES';
          } else if (currentRagbotVectorStore === 'MINI') {
            key = 'MINI';
          } else {
            // WALDO ou qualquer outro modo: sugestões padrão em português
            key = 'DEFAULT_PT';
          }

          suggestions = FIXED_QUESTIONS[key] || [];

        } else if (quest_type === 'aleatory' && Array.isArray(window.alleatory_questions) && window.alleatory_questions.length > 0) {

          suggestions = window.alleatory_questions;

        }  
    
        // Container principal
        const wrap = document.createElement('div');
        wrap.id = 'initial-quests';
        wrap.className = 'initial-quests';
    
        // Título sutil (em português ou inglês, conforme o modo)
        const title = document.createElement('div');
        if (currentRagbotVectorStore === 'ENGLISH') {
          title.textContent = 'Sample questions:';
        } else {
          title.textContent = 'Sugestões de perguntas:';
        }
        title.className = 'initial-quests-title';
    
        // Linha de badges
        const row = document.createElement('div');
        row.className = 'initial-quests-row';

        suggestions.forEach((q) => {
          const badge = document.createElement('button');
          badge.type = 'button';
          badge.className = 'badge initial-quests-badge';
          badge.textContent = q;

          badge.addEventListener('click', () => {
            // Preenche input e envia
            if (searchInput) {
              searchInput.value = q;
              try {
                searchInput.style.height = 'auto';
                searchInput.style.height = Math.min(searchInput.scrollHeight, 120) + 'px';
              } catch {}
            }
            if (searchButton) {
              searchButton.click();
            }
            // Remove sugestões após primeiro clique
            try {
              wrap.remove();
            } catch {}
          });
    
          row.appendChild(badge);
        });
    
        wrap.appendChild(title);
        wrap.appendChild(row);
    
        // Inserir no topo do chat
        if (chatMessages && chatMessages.firstChild) {
          chatMessages.insertBefore(wrap, chatMessages.firstChild);
        } else if (chatMessages) {
          chatMessages.appendChild(wrap);
        }

    }

    // Expor função para reexibir as sugestões iniciais após reset de conversa
    window.ragbotShowInitialQuests = initialQuests;
    

  });


// ----------------------------------------------------------------------------
// resetLLM
// - Reseta o LLM
// ----------------------------------------------------------------------------
function resetLLM(scope = 'default') {
    // Limpar histórico global de chat (todos os perfis)
    if (Array.isArray(window.chatHistory)) {
        window.chatHistory.length = 0;
    }

    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) chatMessages.innerHTML = '';

    const resultsDiv = document.getElementById('results');
    if (resultsDiv) resultsDiv.innerHTML = '';

    getOrCreateChatId(scope);

    // Ao resetar o chat, remover o badge fixo do modo atual
    // e reexibir a barra completa de modos para permitir nova escolha.
    try {
        const currentBadge = document.getElementById('ragbot-current-mode');
        if (currentBadge && currentBadge.parentNode) {
            currentBadge.parentNode.removeChild(currentBadge);
        }
        const modesContainer = document.getElementById('ragbot-modes');
        if (modesContainer) {
            modesContainer.style.display = '';
        }
    } catch {}

    // A partir daqui, as sugestões só serão exibidas novamente
    // quando o usuário clicar em um modo (setRagbotMode), que chama initialQuests('fixed').
}


// ----------------------------------------------------------------------------
// resetRagbot
// - Reseta o LLM
// ----------------------------------------------------------------------------
function resetRagbot () {

  resetLLM('ragbot');

  // Limpar o localStore do Ragbot

  try {
    localStorage.removeItem('appConfig_ragbot');
    localStorage.removeItem('appConfig_ragbot_used');
    localStorage.removeItem('configPulseSeen_ragbot');
  } catch {}


  // Hard Reset da página (reload)
  window.location.reload(true);

}