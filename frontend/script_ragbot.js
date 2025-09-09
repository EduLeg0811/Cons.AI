// script_ragbot.js

let controller = null;
let chatHistory = [];
// Expor refs no escopo global para integrações (reset, etc.)
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
        //searchButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Thinking...';
        searchButton.style.opacity = '0.7';
        searchButton.style.cursor = 'not-allowed'

        // Cancel previous request if any
        if (controller) controller.abort();
        controller = new AbortController();
        let timeoutId = null;
        timeoutId = setTimeout(() => controller.abort(), 30000); // 30s




        try {

  
          // Prepare search    
          // =================
          const term = searchInput.value.trim();
          
            // Validate term - exit early but still go through finally
          if (!term) {
              // Don't show error in chat interface
                return;
          }

          // Add user message to chat
          addChatMessage('user', term);
          
          // Clear input
          searchInput.value = '';
          searchInput.style.height = 'auto';

          // Add loading message
          const loadingId = addChatMessage('bot', '<i class="fas fa-spinner fa-spin"></i> Thinking...', true);

             
          //call_ragbot
          //*****************************************************************************************
          // 
          const chat_id = getOrCreateChatId();
          const paramRAGbot = {
            query: term,
            model: (window.CONFIG?.MODEL_RAGBOT ?? MODEL_RAGBOT),
            temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
            vector_store_names: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
            instructions: INSTRUCTIONS_RAGBOT,
            use_session: true,
            chat_id
          };
          
          const response = await call_llm(paramRAGbot);
          if (response.chat_id) localStorage.setItem('cons_chat_id', response.chat_id); // <<< NOVO
          // *****************************************************************************************


          // Remove loading message and add bot response
          removeChatMessage(loadingId);
          addChatMessage('bot', response.text || 'Sorry, I could not generate a response.');
          
          // Store in chat history
          chatHistory.push({
            user: term,
            bot: response.text || 'Sorry, I could not generate a response.',
            timestamp: new Date().toISOString()
          });


          const downloadData = prepareDownloadData(response, term);
          
          // Update results for download (show button only when ready)
          if (window.downloadUtils && window.downloadUtils.updateResults) {
            window.downloadUtils.updateResults(downloadData, term, 'ragbot');
          }

        } catch (error) {
            console.error('Error in ragbot:', error);
            // Remove loading message and show error
            const loadingMessages = document.querySelectorAll('.chat-message.loading');
            loadingMessages.forEach(msg => msg.remove());
            
            addChatMessage('bot', `Sorry, there was an error: ${error.name === 'AbortError' ? 'Request timed out' : error.message || 'An unexpected error occurred'}`);
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
        
        const avatar = document.createElement('div');
        avatar.className = `message-avatar ${sender}`;
        avatar.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
        
        const messageContent = document.createElement('div');
        messageContent.className = `message-content${sender === 'user' ? ' user' : ''}`;
        
        if (sender === 'bot' && !isLoading) {
            // Render markdown for bot messages and wrap with markdown-content for styling
            const rawHtml = renderMarkdown(content);
            const safeHtml = window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml;
            messageContent.innerHTML = `<div class="markdown-content">${safeHtml}</div>`;
        } else {
            messageContent.innerHTML = `<p>${content}</p>`;
        }
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);
        
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        return messageId;
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
          'Sou novo no assunto, me explique o que é Conscienciologia.',
          'O que é Proéxis e qual a relação com o Curso Intermissivo?',
          'Liste 5 coisas que preciso fazer para iniciar a prática da Tenepes.',
          'Será que já sou um Ser Desperto? Faça uma análise das características necessárias.',
          'Ontem tive uma projeção em que me vi com vestimentas de época. Posso descrever para você me indicar o possível período e local, para minha pesquisa retrocognitiva?',
          'Na dinâmica parapsíquica, vi uma consciex com fisionomia bem característica. Veja se pode identificar a origem e grupo a que pertence, pelo relato que vou te fazer.',
          'O que você me sugere para mapear meus possíveis trafares e trafores? Faça uma lista com 10 itens para eu observar no meu comportamento.',
          'Estou com várias ideias de tema para escrever o meu livro. Pode me ajudar a selecionar algumas, e me indicar possíveis abordagens conscienciológicas?',
          'Vou te passar a Definologia e a Fatologia do verbete que estou escrevendo, para que você me dê ideias, aponte inconsistências e sugira aprofundamentos.',
          'Outro dia ouvi a expressão "Inacabamento a Maior". Pode me explicar melhor o que isso significa na Conscienciologia?',
          'Escreva um pequeno texto de 5 parágrafos sobre como desenvolver o autodomínio energético, segundo a Conscienciologia.',
        ];
        
        // Container principal
        const wrap = document.createElement('div');
        wrap.id = 'initial-quests';
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.gap = '8px';
        wrap.style.margin = '12px';

        // Título sutil
        const title = document.createElement('div');
        title.textContent = 'Sugestões de perguntas:';
        title.style.fontSize = '0.9rem';
        title.style.color = 'var(--gray-600)';
        title.style.fontStyle = 'italic';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '2px';

        // Linha de badges
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'flex-start';
        row.style.gap = '8px';

        suggestions.forEach((q) => {
          const badge = document.createElement('button');
          badge.type = 'button';
          badge.className = 'badge';
          badge.textContent = q;

          // Estilo mínimo para ficar como "pill"
          badge.style.border = '1px solid var(--gray-300)';
          // Fundo verde muito claro
          badge.style.background = '#e8f5e9';
          badge.style.color = '#000000';
          badge.style.textAlign = 'left';
          badge.style.padding = '6px 10px';
          badge.style.borderRadius = '9999px';
          // Armazena a cor de fundo original e restaura no mouseleave
          // Cor base desejada (verde clarinho)
          const baseBg = '#e8f5e9';
          // Garante inline a cor base para não herdar cinza do CSS
          badge.style.background = baseBg;
          // Guarda também se precisar reaplicar
          badge.dataset.originalBg = baseBg;
          badge.addEventListener('mouseenter', () => {
            // Hover: verde um pouco mais escuro
            badge.style.background = '#d0edd6';
          });
          badge.addEventListener('mouseleave', () => {
            // Volta sempre para o verde clarinho
            badge.style.background = badge.dataset.originalBg || baseBg;
          });

          
          badge.addEventListener('click', () => {
            // Preenche input e envia
            if (searchInput) {
              searchInput.value = q;
              // Ajusta altura do textarea
              try {
                searchInput.style.height = 'auto';
                searchInput.style.height = Math.min(searchInput.scrollHeight, 120) + 'px';
              } catch {}
            }
            if (searchButton) {
              searchButton.click();
            }
            // Remove sugestões após primeiro clique
            try { wrap.remove(); } catch {}
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
});







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
