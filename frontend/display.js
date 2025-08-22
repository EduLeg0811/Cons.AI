// display.js - Centralized result rendering functionality (modularized)

// __________________________________________________________________________________________
// DOMPurify
// __________________________________________________________________________________________
// Import or reference DOMPurify for XSS protection (assumed loaded globally)
const sanitizeHtml = window.DOMPurify?.sanitize || (html => html);

// Markdown renderer (usa marked + DOMPurify se disponíveis; senão, fallback simples)
function renderMarkdown(mdText) {
    const input = typeof mdText === 'string' ? mdText : String(mdText || '');
  
    // 0) Se já há HTML de bloco, apenas sanitize e devolve (evita <p><p>...</p></p>)
    const hasBlockHtml = /<\s*(p|div|ul|ol|li|h[1-6]|pre|blockquote|br)\b/i.test(input);
    try {
      if (!hasBlockHtml && window.marked?.parse) {
        const html = window.marked.parse(input);
        return sanitizeHtml(html);
      }
    } catch (e) {
      console.warn('marked falhou, usando fallback:', e);
    }
    if (hasBlockHtml) {
      // Ainda assim, tira <br> duplos e <p> vazios que porventura cheguem prontos
      return sanitizeHtml(
        input
          .replace(/(<br\s*\/?>\s*){2,}/gi, '<br>')
          .replace(/<p>\s*(?:<br\s*\/?>\s*)*<\/p>/gi, '')
      );
    }
  
    // 1) Normalização de linhas
    let normalized = input
      .replace(/\r\n?/g, '\n')     // CRLF/LF -> LF
      .replace(/[ \t]+\n/g, '\n')  // tira espaços ao fim da linha
      .replace(/\n{3,}/g, '\n\n')  // colapsa 3+ quebras em 2
      .trim();
  
    // 2) Preserva blocos de código antes de mexer em quebras
    normalized = normalized.replace(/```([\s\S]*?)```/g, (_, code) =>
      `<pre><code>${sanitizeHtml(code)}</code></pre>`
    );
  
    // 3) Marcações simples (headers, ênfases, listas mínimas)
    let tmp = normalized
      .replace(/^######\s?(.*)$/gm, '<h6>$1</h6>')
      .replace(/^#####\s?(.*)$/gm, '<h5>$1</h5>')
      .replace(/^####\s?(.*)$/gm, '<h4>$1</h4>')
      .replace(/^###\s?(.*)$/gm, '<h3>$1</h3>')
      .replace(/^##\s?(.*)$/gm, '<h2>$1</h2>')
      .replace(/^#\s?(.*)$/gm, '<h1>$1</h1>')
      .replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>')
      .replace(/^\s*\*\s+(.*)$/gm, '<li>$1</li>')
      .replace(/^\s*\d+\.\s+(.*)$/gm, '<li>$1</li>')
      .replace(/(?:\s*<li>.*<\/li>\s*)+/gs, m => `<ul>${m}</ul>`)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  
    // 4) Quebra em parágrafos (2+ \n). Filtra vazios.
    const paragraphs = tmp.split(/\n{2,}/).filter(p => p.trim().length);
  
    const html = paragraphs.map(p => {
      // dentro do parágrafo, 1 quebra -> <br> (e evita <br><br>)
      const withBreaks = p.replace(/\n/g, '<br>').replace(/(<br\s*\/?>\s*){2,}/gi, '<br>');
      return `<p>${sanitizeHtml(withBreaks)}</p>`;
    }).join('');
  
    // 5) Limpeza final: remove <p> vazios e <br> duplicados entre blocos
    const cleaned = html
      .replace(/<p>\s*(?:<br\s*\/?>\s*)*<\/p>/gi, '')
      .replace(/(<br\s*\/?>\s*){2,}/gi, '<br>');
  
    return sanitizeHtml(cleaned);
  }





// ===== Handlers mapping =====
const renderers = {
    ragbot: showRagbot,
    lexical: showSearch,
    semantical: showSearch,
    title: showTitle,
    simple: showSimple,
    verbetopedia: showVerbetopedia,
};

/**
 * Displays results based on search type
 * @param {HTMLElement} container - The container element
 * @param {Object} data - The data payload
 * @param {string} type - The search type key
 */
function displayResults(container, data, type) {
  if (!container) {
      console.error('Results container not found');
      return;
  }
  const renderer = renderers[type];
  if (!renderer) {
      console.error(`Unknown search type: ${type}`);
      return;
  }
  renderer(container, data);
}

// ===== Utility functions =====
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}





//______________________________________________________________________________________________
// insertLoading
//______________________________________________________________________________________________
function insertLoading(container, message) {
    container.insertAdjacentHTML('beforeend', `
    <div class="loading-container">
        <div class="loading">${message}</div>
    </div>`);
}

function removeLoading(container) {
    const loadingContainer = container.querySelector('.loading-container .loading');
    if (loadingContainer) {
        loadingContainer.closest('.loading-container').remove();
    }
}


  
















// ________________________________________________________________________________________
// showSem(container, results)
// - Recebe diretamente o array "flattened" vindo do backend (semJson).
// - Exibe no mesmo estilo do showLexical, mas com TODOS os metadados como badges.
// - Agrupa por fonte/livro (source/file/book), normaliza nome de exibição.
// - Ordena por paragraph_number quando disponível.
// - Renderiza markdown sanitizado (DOMPurify, se presente).
//
// Estrutura típica de cada item (campos possíveis):
//   - Conteúdo:      display_md | markdown | page_content | text
//   - Fonte/Livro:   book | source | file
//   - Numeração:     paragraph_number | number
//   - Título:        title
//   - Autor:         author | autor
//   - Score:         score (número)
//   - Datas:         date | data
//   - Taxonomias:    especialidade | specialty | tematologia
//   - Navegação:     link_wv | url | link
//   - Outros campos arbitrários de metadados podem aparecer e serão renderizados.
//
// Dependências esperadas no projeto:
//   - renderMarkdown(htmlString)
//   - escapeHtml(text)
//   - window.DOMPurify (opcional, para sanitização)
//   - window.normSourceName (opcional; se não houver, usamos fallback local)
//
// Campos de metadados esperados no projeto:
//
// LO:  Content_Text	Markdown	Title	  Number	Source						
// DAC: Content_Text	Markdown	Title	  Number  Source		Division   Argumento	  			
// CCG: Content_Text	Markdown	Title	  Number  Source		Folha	      	    			
// EC:  Content_Text	Markdown	Title	  Number	Source    Date  Area  Theme	 Author	 Sigla 	Link	
//
// ________________________________________________________________________________________
function showSearch(container, data) {
    if (!container) {
        console.error('Results container not found');
        return;
    }

    // 0) Garantir array de entrada
    const arr = Array.isArray(data.results) ? data.results : [];
    if (!arr.length) {
        container.insertAdjacentHTML(
            'beforeend',
            '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
        );
        return;
    }

    // 1) Normalizador de fonte/livro para exibição (remove diretórios e .md)
    const normSourceName = (typeof window !== 'undefined' && typeof window.normSourceName === 'function')
        ? window.normSourceName
        : function _fallbackNormSourceName(src) {
            if (!src) return 'Results';
            let s = String(src);
            s = s.split(/[\\/]/).pop();           // tira diretórios
            s = s.replace(/\.(md|markdown)$/i, ''); // tira extensão
            return s;
        };

    // 3) Agrupar por fonte normalizada
    const groups = arr.reduce((acc, it, idx) => {
        const raw = it?.book || it?.source || it?.file || 'Results';
        const key = normSourceName(raw);
        if (!acc[key]) acc[key] = [];
        acc[key].push({ ...it, _origIndex: idx, _srcRaw: raw, _src: key });
        return acc;
    }, {});
    const groupNames = Object.keys(groups);

    // 4) Resumo superior
    const totalCount = arr.length;
    const perSourceLines = groupNames.map(name => {
        const n = groups[name].length;
        return `<div><strong>${escapeHtml(name)}</strong>: ${n} resultado${n !== 1 ? 's' : ''}</div>`;
    }).join('');

    const summaryHtml = `
    <div style="
        border: 1px solid #ddd;
        background-color: #f7f7f7;
        padding: 10px 12px;
        border-radius: 8px;
        margin: 8px 0 14px 0;
    ">
        <div style="font-weight: bold; margin-bottom: 6px;">
            Total de parágrafos encontrados: ${totalCount}
        </div>
        ${perSourceLines}
    </div>`;
    
    container.insertAdjacentHTML('beforeend', summaryHtml);

    // 5) Render por grupo
    groupNames.forEach(groupName => {
        // Ordena por paragraph_number quando houver (senão mantém ordem original)
        const items = groups[groupName].slice().sort((a, b) => {
            const na = Number.isFinite(a?.paragraph_number) ? a.paragraph_number : Infinity;
            const nb = Number.isFinite(b?.paragraph_number) ? b.paragraph_number : Infinity;
            return na - nb;
        });

        // Gera linhas
        const contentHtml = items.map((item, idx) => {
            // 5.1) Conteúdo de parágrafo (markdown)
            let content = (
                (typeof item.markdown === 'string' && item.markdown) ||
                (typeof item.page_content === 'string' && item.page_content) ||
                ''  
            );
            
            // If source is "LO" and there's a title, prepend it in bold
            if ((item.book === 'LO' || item.source === 'LO' || item.file === 'LO') && item.title) {
                content = `**${item.title}**. ${content}`;
            }

            const rawHtml = renderMarkdown(content);
            const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

            // 5.2) Marcador sequencial [n] (posição dentro do grupo)
            const markerHtml = `<span class="paragraph-marker" style="font-size: 10px; color: gray; font-weight: bold; display: inline-block; margin-right: 4px;">[${idx + 1}]</span>`;

            // Extract metadata
            const metadata = extractMetadata(item, 'semantical');

            // Initialize badges array
            const metaBadges = [];

            // Loop through all metadata entries
            for (const [key, value] of Object.entries(metadata)) {
                // Skip if value is empty, null, or undefined
                if (value === undefined || value === null || value === '') continue;
                
                // Skip internal/private fields (those starting with _)
                if (key.startsWith('_') || key === 'id') continue;

                // Format the value for display
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

                // Add badge with appropriate class based on key
                metaBadges.push(`
                    <span class="metadata-badge ${key.toLowerCase()}">
                        ${key}: ${displayValue}
                    </span>
                `);
            }

            // Return statement:
            return `
            <div class="displaybox-item">
                <div class="displaybox-text markdown-content">${safeHtml}</div>
                <div class="metadata-badge">
                    ${metaBadges.join('')}
                </div>
            </div>`;
        }).join('');

        // Header do grupo + conteúdo
        const groupHtml = `
        <div class="displaybox-group">
            <div class="displaybox-header">
                <span style="color: blue; font-weight: bold;">${escapeHtml(groupName)}</span>
                <span class="score-badge" style="font-size: 10px">${items.length} resultado${items.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="displaybox-content">
                ${contentHtml}
            </div>
        </div>`;
        container.insertAdjacentHTML('beforeend', groupHtml);
    });
}








// ________________________________________________________________________________________
// Show RAGbot
// ________________________________________________________________________________________
 // Expected data format from /ragbot:
  // {
  //   results: [{ text: string, citations: array }],
  //   total_tokens_used: number,
  //   type: 'ragbot',
  //   model: string,
  //   temperature: number,
  //   top_k: number
  // }
  function showRagbot(container, data) {
    const text = data?.text || 'No text available.';
    const mdHtml = renderMarkdown(text);

    // ***********************************************************************
    // Extract metadata
    // ***********************************************************************
    // ragbot: {
    //   metadataFields: ['title', 'number', 'source', 'citations', 'total_tokens_used', 'model', 'temperature', 'top_k']
    // }
    // ***********************************************************************
    metadata = extractMetadata(data, 'ragbot');

    const citations = metadata?.citations;
    const total_tokens_used = metadata?.total_tokens_used;
    const model = metadata?.model;
    const temperature = metadata?.temperature;
    const top_k = metadata?.top_k;

    // Badge do número absoluto do parágrafo no arquivo (se presente)
    const metaInfo = `
    <div class="metadata-container">
      <span class="metadata-badge citation">Citations: ${citations}</span>
      <span class="metadata-badge model">Model: ${model}</span>
      <span class="metadata-badge temperature">Temperature: ${temperature}</span>
      <span class="metadata-badge topk">TopK: ${top_k}</span>
      <span class="metadata-badge tokens">Tokens: ${total_tokens_used}</span>
    </div>
    `;  
  
  const html = `
    <div class="displaybox-container">
      <div class="displaybox-content">
        <div class="displaybox-text markdown-content">${mdHtml}</div> <!-- <<< -->
        ${metaInfo}
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', html);
}




// ________________________________________________________________________________________
// Show Title
// ________________________________________________________________________________________
function showTitle(container, text) {
    const cleanText = renderMarkdown(text);
    const html = `
            <h3 class="displaybox-header" style="color: blue; font-weight: bold; font-size: 16px; margin-bottom: 10px;"><strong>${cleanText}</strong></h3>`;

    container.insertAdjacentHTML('beforeend', html);
}

// ________________________________________________________________________________________
// Show Simple
// ________________________________________________________________________________________
 // Expected data format from /simple:
  // {
  //   results: [{ text: string, citations: array }],
  //   total_tokens_used: number,
  //   type: 'simple',
  //   model: string,
  //   temperature: number,
  //   top_k: number
  // }
  function showSimple(container, data) {
    const text = data.text;
    const mdHtml = renderMarkdown(text); // <<<

    const html = `
    <div class="displaybox-container" style="background-color:rgb(255, 254, 236);">
        <div class="displaybox-content">
            <div class="displaybox-text markdown-content">${mdHtml}</div>  <!-- <<< -->
        </div>
    </div>`;
    container.insertAdjacentHTML('beforeend', html);
}







// ________________________________________________________________________________________
// Show Verbetopedia
// ________________________________________________________________________________________

function showVerbetopedia(container, data) {
    if (!container) {
        console.error('Results container not found');
        return;
    }

    // 0) Garantir array de entrada
    const arr = Array.isArray(data.results) ? data.results : [];
    if (!arr.length) {
        container.insertAdjacentHTML(
            'beforeend',
            '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
        );
        return;
    }

    // 1) Normalizador de fonte/livro para exibição (remove diretórios e .md)
    const normSourceName = (typeof window !== 'undefined' && typeof window.normSourceName === 'function')
        ? window.normSourceName
        : function _fallbackNormSourceName(src) {
            if (!src) return 'Results';
            let s = String(src);
            s = s.split(/[\\/]/).pop();           // tira diretórios
            s = s.replace(/\.(md|markdown)$/i, ''); // tira extensão
            return s;
        };

    // 3) Agrupar por fonte normalizada
    const groups = arr.reduce((acc, it, idx) => {
        const raw = it?.book || it?.source || it?.file || 'Results';
        const key = normSourceName(raw);
        if (!acc[key]) acc[key] = [];
        acc[key].push({ ...it, _origIndex: idx, _srcRaw: raw, _src: key });
        return acc;
    }, {});
    const groupNames = Object.keys(groups);

    // 5) Render EC
    groupNames.forEach(groupName => {
        // Ordena por source
        const items = groups[groupName].slice().sort((a, b) => {
            const na = Number.isFinite(a?.source) ? a.source : Infinity;
            const nb = Number.isFinite(b?.source) ? b.source : Infinity;
            return na - nb;  // Agora ordena do menor para o maior score
        });

        // Gera linhas
        const contentHtml = items.map((item, idx) => {
            // 5.1) Conteúdo de parágrafo (markdown)
            let content = (
                (typeof item.markdown === 'string' && item.markdown) ||
                (typeof item.page_content === 'string' && item.page_content) ||
                (typeof item.text === 'string' && item.text) ||
                ''  
            );
            
            const rawHtml = renderMarkdown(content);
            const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

            // Extract metadata
            const metaData = extractMetadata(item, 'verbetopedia');
           
            // Join badges into a single string  
            const titleHtml = `<strong>${metaData.title}</strong> (${metaData.area})  ●  <em>${metaData.author}</em>  ●  ${metaData.number}  ●  ${metaData.date}`;

            const scoreHtml = (typeof metaData.score === 'number' && !Number.isNaN(metaData.score))
                ? `<span class="rag-badge">Score: ${metaData.score.toFixed(2)}</span>` : '';

            // Título acima do texto, agrupando em um único filho do flex
            return `
            <div class="displaybox-item">
                <div class="displaybox-header" style="text-align: left; padding-left: 0;">
                    <span class="header-text">${titleHtml}</span>
                </div>
                <div class="displaybox-text">
                    <span class="displaybox-text markdown-content">${safeHtml}</span>
                    <span class="metadata-badge">${scoreHtml}</span>
                </div>
            </div>
            `;

        }).join('');

        // Header do grupo + conteúdo
        const groupHtml = `
        <div class="displaybox-group">
            <div class="displaybox-header">
                <span style="color: blue; font-size: 16px; font-weight: bold;">Enciclopédia da Conscienciologia</span>
                <span class="score-badge" style="font-size: 12px">${items.length} resultado${items.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="displaybox-content">
                ${contentHtml}
            </div>
        </div>
        `;
        container.insertAdjacentHTML('beforeend', groupHtml);
    });
}
