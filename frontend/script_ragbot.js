// script_ragbot.js

let controller = null;
let chatHistory = [];
const RAGBOT_CHAT_SCOPE = 'ragbot';
// Expor refs no escopo global para integraÃ§Ãµes (reset, etc.)
window.chatHistory = chatHistory;
window.abortRagbot = function abortRagbot() {
  try { if (controller) controller.abort(); } catch {}
};

document.addEventListener('DOMContentLoaded', () => {
    const searchButton = document.getElementById('searchButton');
    const searchInput = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('results');
    const chatMessages = document.getElementById('chatMessages');
    
    // Initialize download buttons
    window.downloadUtils.initDownloadButtons('ragbot');

    searchButton.addEventListener('click', ragbot);
    searchInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') ragbot();
    });


    // Clean chat on load
    resetLLM(RAGBOT_CHAT_SCOPE);

    // Apresenta perguntas iniciais como sugestão (badges clicáveis)
    initialQuests();




    //______________________________________________________________________________________________
    // RAGbot
    //______________________________________________________________________________________________
    async function ragbot() {


      // Save original button state for restoration
      const originalButtonState = {
        html: searchButton.innerHTML,
        opacity: searchButton.style.opacity,
        cursor: searchButton.style.cursor
      };

        // If already disabled, prevent re-entry by click/Enter
        if (searchButton?.disabled) return;

        // Disable and show "searching"
        searchButton.disabled = true;
        searchButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        searchButton.style.opacity = '0.7';
        searchButton.style.cursor = 'not-allowed'

        // Cancel previous request if any
        if (controller) controller.abort();
        controller = new AbortController();
        let timeoutId = null;
        timeoutId = setTimeout(() => controller.abort(), 30000); // 30s


        let chatMessage_id = null;

        try {

  
          // Prepare search    
          // =================
          const term = searchInput.value.trim();
          
            // Validate term - exit early but still go through finally
          if (!term) {
              // Don't show error in chat interface
                return;
          }

          // Remove initial suggestions if present (manual message sent)
          try {
            const initial = document.getElementById('initial-quests');
            if (initial) initial.remove();
          } catch {}

          // Remove pergunta antiga do usuário
          removeUserMessages();
          
          //removeChatMessage(loadingId);
          cleanChat();

          
          // Clear input
          searchInput.value = 'Consultando o ConsBOT...';
          searchInput.style.height = 'auto';


          // Add user message to chat
          chatMessage_id = addChatMessage('user', term);

          // Add loading message
         
          //const loadingId = addChatMessage('bot', '<i class="fas fa-spinner fa-spin"></i> Thinking...', true);

             
          //call_ragbot
          //*****************************************************************************************
          // 
          const chat_id = getOrCreateChatId(RAGBOT_CHAT_SCOPE);
          console.debug('[ragbot] using chat_id:', chat_id);

          const paramRAGbot = {
            query: term,
            model: (window.CONFIG?.MODEL_RAGBOT ?? MODEL_RAGBOT),
            temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
            vector_store_names: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
            instructions: INSTRUCTIONS_RAGBOT,
            use_session: true,
            chat_id: chat_id
          };
          
          const response = await call_llm(paramRAGbot);
          
          if (response.chat_id) {
            setChatId(response.chat_id, RAGBOT_CHAT_SCOPE);
            paramRAGbot.chat_id = response.chat_id; // garante consistência
            console.debug('[ragbot] refreshed chat_id from backend:', response.chat_id);
          }
          
          // *****************************************************************************************

          // Add bot message
          chatMessage_id = addChatMessage('bot', response.text, false);

          // Clear input
          searchInput.value = '';
          searchInput.style.height = 'auto';

          
          // Mostra os metadados do response em Badges, logo após o texto da resposta
          // ------------------------------------------------------------------------   
          metaData = extractMetadata(response, 'ragbot');
          const citations = metaData?.citations;
          const total_tokens_used = metaData?.total_tokens_used;
          const model = metaData?.model;
          const temperature = metaData?.temperature;
          const vector_store_names = window.CONFIG?.OPENAI_RAGBOT;
          
          const botMessageEl = document.getElementById(chatMessage_id).querySelector('.message-content');
          showBotMetainfo(botMessageEl, metaData); 
          
          
          // Store in chat history
          chatHistory.push({
            user: term,
            bot: response.text || 'Sorry, I could not generate a response.',
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
          }
            if (timeoutId) clearTimeout(timeoutId);
          controller = null;
        }
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
            const safeHtml = window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml;
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

    
    // Expor util para adicionar mensagens externamente (ex.: boas-vindas)
    window.ragbotAddMessage = (sender, content, isLoading=false) => addChatMessage(sender, content, isLoading);

    
    
    // Function to remove chat message
    function removeChatMessage(messageId) {
        const message = document.getElementById(messageId);
        if (message) {
            message.remove();
        }
    }

    // ----------------------------------------------------------------------------
    // initialQuests
    // - Mostra perguntas iniciais como badges no topo do chat.
    // - Cada badge é clicável e envia a pergunta para o chat.
    // ----------------------------------------------------------------------------


    function initialQuests() {
      try {
        // Não mostrar se já houver mensagens
        if (chatMessages && chatMessages.children && chatMessages.children.length > 0) return;
    
        const suggestions = [
          'Liste 5 coisas que preciso fazer para iniciar a prática da Tenepes.',
          'Será que já sou um Ser Desperto? Faça uma análise das características necessárias.',
          'O que significa Proéxis e como identificar a própria programação existencial?',
          'O que é a Conscienciometria e como aplicar o Conscienciograma na autoavaliação pessoal?',
          'Qual o papel das Reurbanizações Extrafísicas (Reurbexes) no contexto evolutivo do planeta?',
          'Fale sobre as Comunidades Extrafísicas (Comunexes) e sua relação com os Cursos Intermissivos.',
          'Como saber sou completista? Quais os indicadores devo observar?',
          'Cite os principais sinais da autodesassimilação energética (desassim).',
          'Estou com várias ideias de tema para escrever o meu livro. Pode me ajudar a selecionar algumas, e me apontar possíveis abordagens conscienciológicas?',
          'Tive uma projeção em que me vi com roupas de época. Vou descrever para você indicar o possível período e local, para minha pesquisa retrocognitiva.',
        ];
    
        // Container principal
        const wrap = document.createElement('div');
        wrap.id = 'initial-quests';
        wrap.className = 'initial-quests';
    
        // Título sutil
        const title = document.createElement('div');
        title.textContent = 'Sugestões de perguntas:';
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
      } catch (e) {
        // Fallback silencioso
        console.warn('initialQuests: falha ao renderizar sugestões', e);
      }
    }
    





// Prepare results for download
function prepareDownloadData(response, term) {
    // Extract the response text - handle both direct text and results array formats
    const responseText = response?.results?.[0]?.text || response?.text || response || "";
    
    return {
        text: responseText,
        query: term || "",
        model: response?.model || (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
        temperature: response?.temperature || (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
        citations: response?.results?.[0]?.citations || [],
        search_type: "ragbot",
    };
}


});





