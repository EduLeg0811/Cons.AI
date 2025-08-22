

//______________________________________________________________________________________________
// semantical_formatResponse
//______________________________________________________________________________________________
function semantical_formatResponse(responseData, term) {
    
  const count = responseData.length;
  const search_type = "semantical";

  const formattedResponse = {
    count: count,
    search_type: search_type,
    term: term,
    results: responseData,
  };

return formattedResponse;

}







//______________________________________________________________________________________________
// lexical_formatResponse
//______________________________________________________________________________________________
function lexical_formatResponse(responseData, term) {
    
  const formattedResponse = responseData;

return formattedResponse;

}







//______________________________________________________________________________________________
// ragbot_formatResponse
//______________________________________________________________________________________________
function ragbot_formatResponse(responseData) {
    // Group citations by source
    const citationsBySource = responseData.citations
        .replace(/[\[\]]/g, '')  // Remove brackets
        .split(';')              // Split by semicolon
        .map(pair => {
            const [source, page] = pair.split(',').map(s => s.trim());
            return {
                source: source.replace(/\.[^/.]+$/, ''), // Remove file extension
                page: parseInt(page, 10) || 0
            };
        })
        .reduce((acc, {source, page}) => {
            if (!acc[source]) acc[source] = new Set();
            acc[source].add(page);
            return acc;
        }, {});

    // Format the grouped citations
    const formattedCitations = Object.entries(citationsBySource)
        .map(([source, pages]) => 
            `${source}: ${Array.from(pages).sort((a, b) => a - b).join(', ')}`
        )
        .join(' ; ');

    const formattedResponse = {
        text: responseData.text,
        citations: formattedCitations,
        total_tokens_used: responseData.total_tokens_used || 0,
        type: responseData.type || 'ragbot',
        model: responseData.model,
        temperature: responseData.temperature,
        top_k: responseData.top_k
    };
    
    return formattedResponse;
}






// ========================================= Metadata extraction =========================================
// Função para extrair todos os metadados existentes em um objeto ou array de objetos
// Retorna um dicionário com todos os metadados (tudo que não for o texto principal)

// BOOKS FIELDS
// -----------------
// LO:	Content_Text	Markdown	Title	Number	Source						
// DAC:	Content_Text	Markdown	Title	Number	Source	Argumento	Section				
// CCG:	Content_Text	Markdown	Title	Number	Source	Folha					
// EC:	Content_Text	Markdown	Title	Number	Source	Area	Theme	Author	Sigla	Date	Link

// RAGBOT FIELDS
// -------------
// {
//   text: "Response text from the AI",
//   citations: ["source1", "source2", ...], // Array of citation sources
//   total_tokens_used: 123, // Number
//   type: 'ragbot',
//   model: 'model-name', // String
//   temperature: 0.7, // Number
//   top_k: 5, // Number
//   chat_id: 'chat-id' // Optional chat session ID
// }

// LEXICAL FIELDS
// -------------
// {
//   term: "search term", // String
//   search_type: "lexical",
//   results: [{
//     paragraph: "matching text", // String
//     paragraph_number: 123, // Number
//     book: "book name", // String
//     // Additional metadata fields
//   }],
//   count: 5 // Number of results
// }

// SEMANTICAL FIELDS
// -----------------
// {
//   results: [{
//     // Content can be in any of these fields
//     display_md: "formatted markdown", // String (optional)
//     markdown: "formatted markdown",   // String (optional)
//     page_content: "raw text",         // String (optional)
//     text: "raw text",                 // String (optional)
    
//     // Standard metadata
//     title: "document title",         // String
//     number: 123,                     // Number
//     source: "document source",       // String
    
//     // Additional metadata (varies by source)
//     area: "area name",               // String (optional)
//     theme: "theme name",             // String (optional)
//     author: "author name",           // String (optional)
//     sigla: "abbreviation",           // String (optional)
//     date: "date string",             // String (optional)
//     link: "url",                     // String (optional)
//     score: 0.95,                     // Number (relevance score)
    
//     // Source-specific fields
//     argumento: "argument text",      // String (DAC only)
//     section: "section name",         // String (DAC only)
//     folha: "page number"             // String (CCG only)
//   }]
// }

// MANCIA FIELDS
// ------------
// {
//   text: "main content", // String
//   content: "alternative content", // String (optional)
//   commentary: "analysis text", // String (optional)
//   analysis: "detailed analysis", // String (optional)
//   // Additional metadata fields
// }

// VERBETOPEDIA FIELDS
// -------------------
// {
//   term: "search term", // String
//   definition: "term definition", // String
//   entry: "dictionary entry", // String
//   // Additional metadata fields
//   text: "alternative text content" // String (optional)
// }


function extractMetadata(data, type) {
    // Handle case where data is not an array or is null/undefined
    if (!data) {
      console.warn('extractMetadata: No data provided');
      return {};
    }
  
    // Convert single object to array if needed
    const dataArray = Array.isArray(data) ? data : [data];
    const metadata = {};
  
  
    // Common metadata fieldS
    const COMMON_FIELDS = ['title', 'number', 'source'];
  
    // Type-specific field mappings and processing
    const TYPE_CONFIG = {
      ragbot: {
        metadataFields: [...COMMON_FIELDS, 'citations', 'total_tokens_used', 'model', 'temperature', 'top_k']
      },
      lexical: {
        metadataFields: [...COMMON_FIELDS]
      },
      semantical: {
        metadataFields: [...COMMON_FIELDS, 'area', 'theme', 'author', 'sigla', 'date', 'link', 'score', 'argumento', 'section', 'folha']
      },
      mancia: {
        metadataFields: [...COMMON_FIELDS, 'citations', 'total_tokens_used', 'model', 'temperature', 'top_k']
      },
      verbetopedia: {
        metadataFields: [...COMMON_FIELDS, 'area', 'theme', 'author', 'sigla', 'date', 'link', 'score']
      }
    };
  
  
  
    // Get type-specific config
    const config = TYPE_CONFIG[type]
  
    // Process each item in the data array
    dataArray.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
  
      const itemKey = `item_${index}`;
      metadata[itemKey] = {};
  
      // Only include fields that are explicitly defined in metadataFields
      Object.entries(item).forEach(([key, value]) => {
        const isMetadata = config.metadataFields.includes(key);
        const isExcluded = key.startsWith('_') || // Exclude private fields
                         typeof value === 'function'; // Exclude methods
  
        if (isMetadata && !isExcluded) {
          // Handle nested objects and arrays
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            metadata[itemKey][key] = extractMetadata(value, type);
          } else {
            metadata[itemKey][key] = value;
          }
        }
      });
    });
  
    // If there's only one item, return it directly instead of nesting
    const result = Object.keys(metadata).length === 1 ? metadata[Object.keys(metadata)[0]] : metadata;

    return result;
  }
  
  