// display.js - Centralized result rendering functionality (modularized)

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

function formatMetaInfo(items) {
    return items
        .filter(item => item.value)
        .map(item => `<span class="score-badge">${escapeHtml(item.label)}: ${escapeHtml(String(item.value ?? ''))}</span>`)
        .join(' ');
}

// ====================== Renderer implementations ==========================

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
// Show Title
// ________________________________________________________________________________________
function showTitle(container, data) {
    const text = data.text
    const cleanText = renderMarkdown(text);
    const html = `
            <h3 class="displaybox-header">${cleanText}</h3>`;

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
    <div class="displaybox-container">
        <div class="displaybox-content">
            <div class="displaybox-text markdown-content">${mdHtml}</div>  <!-- <<< -->
        </div>
    </div>`;
    container.insertAdjacentHTML('beforeend', html);
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
    const text = data.text || data.results?.[0]?.text || '';
    const mdHtml = renderMarkdown(text); // <<<

    const metaInfo = formatMetaInfo([
        { label: 'Citations', value: Array.isArray(data.citations) ? data.citations.join(', ') : data.citations },
        { label: 'Tokens', value: data.total_tokens_used },
        { label: 'Model', value: data.model }
    ]);
    
    const html = `
    <div class="displaybox-container">
        <div class="displaybox-content">
            <div class="displaybox-text markdown-content">${mdHtml}</div>  <!-- <<< -->
            ${metaInfo ? `<div class="displaybox-meta">${metaInfo}</div>` : ''}
        </div>
    </div>`;
    container.insertAdjacentHTML('beforeend', html);
}


// ________________________________________________________________________________________
// Show Search
// ________________________________________________________________________________________
function showSearch(container, responseData) {
    if (!responseData?.results?.length) {
        container.insertAdjacentHTML('beforeend',
            '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
        );
        return;
    }

    // Group results by source
    const resultsBySource = {};
    responseData.results.forEach(item => {
        if (!item) return;

        // ➜ Torna fonte robusta (aceita source vazio)
        let srcRaw = item.source || item.file || 'Results';
        const src = String(srcRaw)
            .split(/[\\/]/)
            .pop()
            .replace(/\.md$/i, '');

        if (!resultsBySource[src]) {
            resultsBySource[src] = [];
        }

        resultsBySource[src].push({
            content: item.text,
            paragraph: item.paragraph_number,
            // ➜ Garante número para evitar erro em toFixed
            score: (item.score !== undefined && item.score !== null)
                        ? Number(item.score)
                        : undefined,
        });
    });
  
    // Generate HTML for each source group
    let total = 0;
    const htmlGroups = Object.entries(resultsBySource).map(([src, items]) => {
        if (!items.length) return '';
        total += items.length;

        // Sort items by their paragraph number if available
        const sortedItems = [...items].sort((a, b) => {
            const paraA = a.paragraph !== undefined ? a.paragraph : Number.MAX_SAFE_INTEGER;
            const paraB = b.paragraph !== undefined ? b.paragraph : Number.MAX_SAFE_INTEGER;
            return paraA - paraB;
        });

        const contentHtml = sortedItems.map((item, index) => {
            const paraNumber = index + 1;
            const scoreHtml = (typeof item.score === 'number' && !Number.isNaN(item.score))
                ? `<span class="score-badge">Score: ${item.score.toFixed(2)}</span>` : '';
            const originalParaHtml = item.paragraph !== undefined
                ? `<span class="score-badge"> #${item.paragraph}</span>` : '';
        
            const mdHtml = renderMarkdown(item.content || '');
        
            return `
              <div class="displaybox-item">
                  <span class="paragraph-marker">[${paraNumber}]</span>
                  <div class="displaybox-text markdown-content">${mdHtml}</div>
                  ${scoreHtml} ${originalParaHtml}
              </div>`;
        }).join('');
        
        return `
        <div class="displaybox-group">
            <div class="displaybox-header">
                <span>${renderMarkdown(src)}</span>
                <span class="score-badge">${items.length} resultado${items.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="displaybox-content">
                ${contentHtml}
            </div>
        </div>`;
    }).join('');

    // --- Breakdown por fonte para o Summary ---
    const sourceNames = Object.keys(resultsBySource);
    const sourceBreakdownHtml = sourceNames.map((src, i) => {
        const srcName = (typeof escapeHtml === 'function') ? escapeHtml(src) : String(src);
        const count = resultsBySource[src].length;
        return `<div class="displaybox-source-item">Fonte ${i + 1} (${srcName}): ${count}</div>`;
    }).join('');

    // Insert summary and results
    const summaryHtml = `
    <div class="displaybox-container">

        <div class="displaybox-header">
            <span>Summary</span>
            <span class="score-badge">${total} resultado${total !== 1 ? 's' : ''}</span>
        </div>

        <div class="displaybox-content">
            <div class="displaybox-summary">
                Encontrado(s) ${total} resultado(s) em ${sourceNames.length} fonte(s)
                ${sourceNames.length ? `<div class="displaybox-sources">${sourceBreakdownHtml}</div>` : ''}
            </div>
        </div>

    </div>`;

    container.insertAdjacentHTML('beforeend', summaryHtml + htmlGroups);
}
