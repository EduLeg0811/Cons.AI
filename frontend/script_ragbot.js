// script_ragbot.js

let controller = null;
let chatHistory = [];

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
        searchButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Thinking...';
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
            model: MODEL_LLM,
            temperature: TEMPERATURE,
            vector_store_names: OPENAI_RAGBOT,
            instructions: INSTRUCTIONS_LLM_USER,
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
          
          // Update results for download
          //window.downloadUtils.updateResults(downloadData, term, 'ragbot');

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
            // Render markdown for bot messages
            const rawHtml = renderMarkdown(content);
            const safeHtml = window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml;
            messageContent.innerHTML = safeHtml;
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
    
    // Function to remove chat message
    function removeChatMessage(messageId) {
        const message = document.getElementById(messageId);
        if (message) {
            message.remove();
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
        model: response?.model || MODEL_LLM,
        temperature: response?.temperature || TEMPERATURE,
        citations: response?.results?.[0]?.citations || [],
        search_type: "ragbot",
    };
}



