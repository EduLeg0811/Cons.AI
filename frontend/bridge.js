// escopo de módulo
let _lexicalController = null;
let _semanticController = null;
let _llmQueryController = null;
let _randomPensataController = null;
let _downloadController = null;  // Added download controller


//_________________________________________________________
// Lexical Search
//_________________________________________________________
// 
// const parameters = {
//   "term": "Evoluciólogo",
//   "source": ["LO","DAC"]
// };


async function call_lexical(parameters) {

  if (_lexicalController) _lexicalController.abort();
  _lexicalController = new AbortController();

  console.log(' LEXICAL SEARCH REQUEST:', {
      endpoint: `${apiBaseUrl}/lexical_search`,
      parameters: JSON.parse(JSON.stringify(parameters)) // Deep clone to avoid reference issues
  });

  try {
      const response = await fetch(apiBaseUrl + '/lexical_search', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(parameters),
          signal: _lexicalController.signal
      });

      if (!response.ok) {
        const err = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status} ${err}`);
      }

      const responseData = await response.json();
      
      console.log(' LEXICAL SEARCH RESPONSE:', {
          data: responseData,
          type: typeof responseData,
          isArray: Array.isArray(responseData),
          keys: Object.keys(responseData)
      });
      
      // Log detailed structure if it's an object
      if (responseData && typeof responseData === 'object') {
          console.debug(' LEXICAL SEARCH RESPONSE STRUCTURE:', {
              firstLevelKeys: Object.keys(responseData),
              sampleFirstItem: responseData[0] ? 
                  Object.keys(responseData[0]) : 'No items in response'
          });
      }


      // Formatt lexical response (none in this case Lexical)
      const formattedResponse = responseData;
      console.log(`********bridge.js - call_lexical*** [formattedResponse]:`, formattedResponse);

      return formattedResponse;

  } catch (error) {
      console.error(' LEXICAL SEARCH EXCEPTION:', error);
      throw error;
  }
}



//_________________________________________________________
// semantic Search
//_________________________________________________________
async function call_semantic(parameters) {


  if (_semanticController) _semanticController.abort();
  _semanticController = new AbortController();


    console.log(' SEMANTIC SEARCH REQUEST:', {
        endpoint: `${apiBaseUrl}/semantic_search`,
        parameters: JSON.parse(JSON.stringify(parameters)) // Deep clone
    });

    try {
        const response = await fetch(apiBaseUrl + '/semantic_search', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(parameters),
            signal: _semanticController.signal
        });

        if (!response.ok) {
            const err = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status} ${err}`);
        }

        const responseData = await response.json();
        
        console.log(' SEMANTIC SEARCH RESPONSE:', {
            data: responseData,
            type: typeof responseData,
            isArray: Array.isArray(responseData),
            keys: Object.keys(responseData)
        });
        
        // Log detailed structure if it's an object
        if (responseData && typeof responseData === 'object') {
            console.debug(' SEMANTIC SEARCH RESPONSE STRUCTURE:', {
                firstLevelKeys: Object.keys(responseData),
                sampleFirstItem: responseData[0] ? 
                    Object.keys(responseData[0]) : 'No items in response'
            });
        }

          // Format response
          const formattedResponse = {
            count: responseData.length,
            search_type: "semantic",
            term: parameters.term,
            results: responseData,
          };

        console.log(`********bridge.js - call_semantic*** [formattedResponse]:`, formattedResponse);

        return formattedResponse;

    } catch (error) {
        console.error(' SEMANTIC SEARCH EXCEPTION:', error);
        throw error;
    }
}




//_________________________________________________________
// LLM
//_________________________________________________________
async function call_llm(parameters) {

  // Abort any ongoing LLM request before starting a new one
  if (_llmQueryController) _llmQueryController.abort();
  _llmQueryController = new AbortController();

  // Allow caller to pass an external signal and/or timeout override
  const externalSignal = parameters?.signal;
  const timeoutMs = Number(parameters?.timeout_ms) > 0 ? Number(parameters.timeout_ms) : 60000; // default 60s

  // If external signal aborts, propagate
  const onExternalAbort = () => {
    try { _llmQueryController?.abort(); } catch {}
  };
  if (externalSignal && typeof externalSignal.addEventListener === 'function') {
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  // Timeout to avoid hanging requests
  const timeoutId = setTimeout(() => {
    try { _llmQueryController?.abort(); } catch {}
  }, timeoutMs);

  try {
    console.log(' LLM QUERY REQUEST:', {
      endpoint: `${apiBaseUrl}/llm_query`,
      parameters: JSON.parse(JSON.stringify(parameters))
    });

    const response = await fetch(apiBaseUrl + '/llm_query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parameters),
      signal: _llmQueryController.signal
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${err}`);
    }

    const responseData = await response.json();

    // Transform the LLM response to match what displaySimple expects
    // const formattedResponse = llm_formatResponse(responseData);
    const formattedResponse = responseData;

    console.log(`********bridge.js - call_llm*** [formattedResponse]:`, formattedResponse);

    return formattedResponse;
  } catch (error) {
    // Normalize AbortError message for better UX
    if (error?.name === 'AbortError') {
      console.warn(' LLM QUERY ABORTED (timeout or new request):', error);
      const e = new Error('Request timed out');
      e.name = 'AbortError';
      throw e;
    }
    console.error(' LLM QUERY EXCEPTION:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal && typeof externalSignal.removeEventListener === 'function') {
      try { externalSignal.removeEventListener('abort', onExternalAbort); } catch {}
    }
    _llmQueryController = null;
  }
}



//_________________________________________________________
// Random Pensata
//_________________________________________________________
async function call_random_pensata(parameters) {

  if (_randomPensataController) _randomPensataController.abort();
  _randomPensataController = new AbortController();

const response = await fetch(apiBaseUrl + '/random_pensata', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(parameters),
    signal: _randomPensataController.signal
});

if (!response.ok) {
  const err = await response.text().catch(() => '');
  throw new Error(`HTTP ${response.status} ${err}`);
}


const responseData = await response.json();

console.log(`********bridge.js - call_random_pensata*** [responseData]:`, responseData);

return responseData;
}





//_________________________________________________________
// Download
//_________________________________________________________
async function call_download(format, payload) {

 const fullBadges = (window.CONFIG ? !!window.CONFIG.FULL_BADGES : FULL_BADGES);

  // Abort any existing download
  if (_downloadController) {
      _downloadController.abort();
  }
  
  _downloadController = new AbortController();
  const timeoutId = setTimeout(() => _downloadController?.abort(), 30000); // 30s timeout

  console.log('********bridge.js - call_download*** [payload]:', payload);

  try {
      const response = await fetch(apiBaseUrl + '/download', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/octet-stream'  // Important for file downloads
          },
          body: JSON.stringify(payload),
          signal: _downloadController.signal
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Download failed: ${response.status} ${response.statusText}\n${errorText}`);
      }
      
      return response;
  } catch (error) {
      clearTimeout(timeoutId);
      console.error('Download error:', error);
      throw error;
  } finally {
      _downloadController = null;
  }
}

// ---------------------------------------------------------
// Global abort helpers (for cleanup before navigation)
// ---------------------------------------------------------
function abortAllRequests() {
  try { _lexicalController?.abort(); } catch {}
  try { _semanticController?.abort(); } catch {}
  try { _llmQueryController?.abort(); } catch {}
  try { _randomPensataController?.abort(); } catch {}
  try { _downloadController?.abort(); } catch {}
}

// Expose globally so other modules/pages can use them
window.abortAllRequests = abortAllRequests;
window.abortRagbot = function() {
  try { _llmQueryController?.abort(); } catch {}
};
