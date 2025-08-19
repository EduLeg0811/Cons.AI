



//_________________________________________________________
// Lexical Search
//_________________________________________________________
async function call_lexical(parameters) {

const response = await fetch(apiBaseUrl + '/lexical_search', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(parameters),
    signal: controller.signal
});

// Se falhar, loga o corpo como texto (sem usar defJson)
if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }


const responseData = await response.json();

console.log(`********bridge.js - lexical_search*** [responseData]:`, responseData);

return responseData;
}



//_________________________________________________________
// Semantical Search
//_________________________________________________________
async function call_semantical(parameters) {

const response = await fetch(apiBaseUrl + '/semantical_search', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(parameters),
    signal: controller.signal
});

// Se falhar, loga o corpo como texto (sem usar defJson)
if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }


const responseData = await response.json();

console.log(`********bridge.js - semantical_search*** [responseData]:`, responseData);

return responseData;
}




//_________________________________________________________
// RAGbot
//_________________________________________________________
async function call_ragbot(parameters) {

const response = await fetch(apiBaseUrl + '/ragbot', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(parameters),
    signal: controller.signal
});

// Se falhar, loga o corpo como texto (sem usar defJson)
if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }


const responseData = await response.json();

console.log(`********bridge.js - ragbot*** [responseData]:`, responseData);

return responseData;
}



//_________________________________________________________
// Random Pensata
//_________________________________________________________
async function call_random_pensata(parameters) {

const response = await fetch(apiBaseUrl + '/random_pensata', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(parameters),
    signal: controller.signal
});

// Se falhar, loga o corpo como texto (sem usar defJson)
if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }


const responseData = await response.json();

console.log(`********bridge.js - random_pensata*** [responseData]:`, responseData);

return responseData;
}
