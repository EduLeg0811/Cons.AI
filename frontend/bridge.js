
// escopo de módulo
let _lexicalController = null;
let _semanticalController = null;
let _ragbotController = null;
let _randomPensataController = null;



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

      return responseData;

  } catch (error) {
      console.error(' LEXICAL SEARCH EXCEPTION:', error);
      throw error;
  }
}



//_________________________________________________________
// Semantical Search
//_________________________________________________________
async function call_semantical(parameters) {


  if (_semanticalController) _semanticalController.abort();
  _semanticalController = new AbortController();


    console.log(' SEMANTICAL SEARCH REQUEST:', {
        endpoint: `${apiBaseUrl}/semantical_search`,
        parameters: JSON.parse(JSON.stringify(parameters)) // Deep clone
    });

    try {
        const response = await fetch(apiBaseUrl + '/semantical_search', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(parameters),
            signal: _semanticalController.signal
        });

        if (!response.ok) {
            const err = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status} ${err}`);
        }

        const responseData = await response.json();
        
        console.log(' SEMANTICAL SEARCH RESPONSE:', {
            data: responseData,
            type: typeof responseData,
            isArray: Array.isArray(responseData),
            keys: Object.keys(responseData)
        });
        
        // Log detailed structure if it's an object
        if (responseData && typeof responseData === 'object') {
            console.debug(' SEMANTICAL SEARCH RESPONSE STRUCTURE:', {
                firstLevelKeys: Object.keys(responseData),
                sampleFirstItem: responseData[0] ? 
                    Object.keys(responseData[0]) : 'No items in response'
            });
        }

        return responseData;

    } catch (error) {
        console.error(' SEMANTICAL SEARCH EXCEPTION:', error);
        throw error;
    }
}




//_________________________________________________________
// RAGbot
//_________________________________________________________
async function call_ragbot(parameters) {

  if (_ragbotController) _ragbotController.abort();
  _ragbotController = new AbortController();

const response = await fetch(apiBaseUrl + '/ragbot', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(parameters),
    signal: _ragbotController.signal
});

if (!response.ok) {
  const err = await response.text().catch(() => '');
  throw new Error(`HTTP ${response.status} ${err}`);
}

const responseData = await response.json();

console.log(`********bridge.js - ragbot*** [responseData]:`, responseData);

return responseData;
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

console.log(`********bridge.js - random_pensata*** [responseData]:`, responseData);

return responseData;
}
