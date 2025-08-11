// script_lexical.js

document.addEventListener('DOMContentLoaded', () => {
    const searchButton = document.getElementById('searchButton');
    const searchInput  = document.getElementById('searchInput');
    const resultsDiv   = document.getElementById('results');
    const downloadPDF   = document.getElementById('downloadPDF');
    const downloadDocx = document.getElementById('downloadDocx');
    const downloadButtons = document.querySelector('.download-buttons');

   
    let lastResults = [];
    
  // registra os listeners UMA única vez
  if (downloadPDF) {
    downloadPDF.addEventListener('click', () =>
      downloadResults('pdf', lastResults)
    );
  }
  if (downloadDocx) {
    downloadDocx.addEventListener('click', () =>
      downloadResults('docx', lastResults)
    );
  }

    searchButton.addEventListener('click', lexical_search);
    searchInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') lexical_search();
    });

    // Initialize download buttons as hidden
    if (downloadButtons) {
        downloadButtons.style.display = 'none';
    }



//______________________________________________________________________________________________
// Lexical Search
//______________________________________________________________________________________________
/**
 * Estrutura do rawData retornado pela API de busca léxica:
 * 
 * rawData: {
 *   "caminho/completo/arquivo1.md": ["Texto parágrafo 1", "Texto parágrafo 2"],
 *   "caminho/completo/arquivo2.md": ["Outro parágrafo"]
 * }
 * 
 * Onde:
 * - Cada chave é uma string com o caminho completo do arquivo
 * - Cada valor é um array de strings, onde cada string é um parágrafo que contém o termo buscado
 * - A busca é case-insensitive
 * - Apenas arquivos que correspondem aos nomes em "books" são retornados
 * - Se nenhum resultado for encontrado, um objeto vazio {} é retornado
 */

// Exemplo de uso:
// const rawData = {
//     "D:\\APPS\\SIMPLE\\Simple_v22\\backend\\files\\LO.md": [
//         "**Serenologia.** O Ser Serenão não é da cidade...",
//         "Outro parágrafo com o termo buscado..."
//     ]
// };
/**
 * Performs a lexical search and displays the results.
 * 
 * Expected API Response Structure:
 * {
 *   "results": [
 *     {
 *       "text": "matching text content",
 *       "source": "filename.md",
 *       "paragraph_number": 123           // Optional
 *     },
 *     ...
 *   ],
 *   "search_type": "lexical",
 *   "term": "search term",
 *   "books": ["LO", "HSRP"],
 *   "total_results": 42,
 *   "source_counts": {
 *     "LO.md": 30,
 *     "HSRP.md": 12
 *   }
 * }
 */
async function lexical_search() {
        const term = searchInput.value.trim();
        // Clear input for next insertion
        searchInput.value = '';
        // Optionally focus for immediate typing
        try { searchInput.focus(); } catch {}
        
        resultsDiv.innerHTML = '';
        
        if (!term) {
            resultsDiv.innerHTML = '<p class="error">Please enter a search term</p>';
            if (downloadButtons) downloadButtons.style.display = 'none';
            return;
        }
        // Show loading
        insertLoading(resultsDiv, "Searching for: " + term);

        console.log('Lexical search term:', term);

        try {
            console.log('Sending lexical search request for term:', term);

            const parameters = {
                "term": term,
                "books": ["LO"]
            }

            const response = await fetch(apiBaseUrl + '/lexical_search', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(parameters)
            });
            const responseData = await response.json();
    
            const formattedData = { results: responseData.results || [] };

            removeLoading(resultsDiv);
            displayResults(resultsDiv, {text: "Lexical Search"}, 'title');
            displayResults(resultsDiv, formattedData, "lexical");
            
            // Update state and show download buttons if we have results
            lastResults = responseData;
            if (downloadButtons) {
                downloadButtons.style.display = (responseData.results && responseData.results.length > 0) ? 'block' : 'none';
            }
        
        } catch (error) {
            console.error('Search error:', error);
            resultsDiv.innerHTML = `
                <div class="error">
                    <p>Error performing search.</p>
                    <p>${error.message || 'Unknown error occurred'}</p>
                </div>`;
                if (downloadButtons) downloadButtons.style.display = 'none';
        }
    }
});
