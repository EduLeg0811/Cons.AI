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
    lexical: showLexical,
    //semantical: showSemanticalSingleSource,
    semantical: showFlattened,
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
// 2) showLexical(container, dict): renderiza HTML (append)
// ________________________________________________________________________________________
function showLexical(container, dict) {
  if (!container) {
    console.error('Results container not found');
    return;
  }
  const { sourceNames = [], resultsBySource = {} } = dict || {};
  if (!sourceNames.length) {
    container.insertAdjacentHTML(
      'beforeend',
      '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
    );
    return;
  }

  // ======= SÍNTESE (BOX) =======
  const totalCount = sourceNames.reduce((acc, src) => {
    const n = (resultsBySource[src] || []).length;
    return acc + n;
  }, 0);

  const perSourceLines = sourceNames.map(src => {
    const n = (resultsBySource[src] || []).length;
    // se tiver escapeHtml disponível no seu escopo, use-o; senão, remova a chamada
    const safeSrc = (typeof escapeHtml === 'function') ? escapeHtml(src) : src;
    return `<div style="margin: 2px 0;">● ${safeSrc}: ${n}</div>`;
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
    </div>
  `;

  // ======= GRUPOS POR FONTE =======
  const htmlGroups = sourceNames.map(src => {
    const items = resultsBySource[src] || [];
    if (!items.length) return '';

    // ordena por paragraph_number quando existir
    const sortedItems = [...items].sort((a, b) => {
      const A = a.paragraph !== undefined ? a.paragraph : Number.MAX_SAFE_INTEGER;
      const B = b.paragraph !== undefined ? b.paragraph : Number.MAX_SAFE_INTEGER;
      return A - B;
    });

    const contentHtml = sortedItems.map((item, index) => {
      const paraNumber = index + 1;
      const mdHtml = renderMarkdown(item.content || '');

      const scoreHtml = (typeof item.score === 'number' && !Number.isNaN(item.score))
        ? `<span class="score-badge">Score: ${item.score.toFixed(2)}</span>` : '';

      const originalParaHtml = (item.paragraph !== undefined)
        ? `<span class="score-badge">#${item.paragraph}</span>` : '';

      const m = item.meta || {};
      const metaBadges = [
        m.title ? `<span class="score-badge">${escapeHtml(m.title)}</span>` : '',
        m.autor ? `<span class="score-badge">${escapeHtml(m.autor)}</span>` : '',
        m.number != null ? `<span class="score-badge">No. ${escapeHtml(String(m.number))}</span>` : '',
        m.tematologia ? `<span class="score-badge">${escapeHtml(m.tematologia)}</span>` : '',
        m.especialidade ? `<span class="score-badge">${escapeHtml(m.especialidade)}</span>` : '',
        m.date ? `<span class="score-badge">${escapeHtml(m.date)}</span>` : '',
        m.link_wv ? `<a class="score-badge" href="${escapeHtml(m.link_wv)}" target="_blank" rel="noopener">link</a>` : '',
      ].filter(Boolean).join(' ');

      return `
        <div class="displaybox-item">
          <span class="paragraph-marker" style="font-size: 6px; color: gray; font-weight: bold;">[${paraNumber}]</span>
          <span class="displaybox-text markdown-content">${mdHtml}</span>
          ${originalParaHtml} ${scoreHtml} ${metaBadges}
        </div>`;
    }).join('');

    const safeSrc = (typeof escapeHtml === 'function') ? escapeHtml(src) : src;

    return `
      <div class="displaybox-group">
        <div class="displaybox-header">
          <span style="color: blue; font-weight: bold;">${safeSrc}</span>
          <span class="score-badge" style="font-size: 10px">${items.length} resultado${items.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="displaybox-content">
          ${contentHtml}
        </div>
      </div>`;
  }).join('');

  // Insere primeiro a SÍNTESE, depois os grupos
  container.insertAdjacentHTML('beforeend', summaryHtml + htmlGroups);
}












// ________________________________________________________________________________________
// Show Title
// ________________________________________________________________________________________
function showTitle(container, data) {
    const text = data.text
    const cleanText = renderMarkdown(text);
    const html = `
            <h3 class="displaybox-header"><strong>${cleanText}</strong></h3>`;

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
            ${metaInfo ? `<div class="badges-group small-green">${metaInfo}</div>` : ''}
        </div>
    </div>`;
    container.insertAdjacentHTML('beforeend', html);
}



// ________________________________________________________________________________________
// Show Semantical — multiple sources
// => Versão adaptada da showSemanticalSingleSource para suportar várias fontes
// => Mantém a normalização da semantical (SELECTORS) e inclui sumário no início e no fim
// ________________________________________________________________________________________
function showSemanticalMultipleSource(container, dict) {
  if (!container) return;

  // ---------- Mapeamento de campos possíveis ----------
  // Cada item pode vir de fonte diferente (LO, DAC, CCG, EC etc.),
  // então definimos "aliases" para capturar os campos equivalentes.
  const SELECTORS = {
    source:        ['source', 'book'],
    clean_text:    ['content_text'],
    markdown_text: ['markdown'],
    title:         ['title', 'section'],
    number:        ['paragraph_number', 'quest_number', 'number'],
    score:         ['score'],
    area:          ['area'],
    argumento:     ['argumento'],
    section:       ['section'],
    folha:         ['folha'],
    theme:         ['theme'],
    author:        ['author'],
    sigla:         ['sigla'],
    date:          ['date'],
    link:          ['link']
  };

  // ---------- Helpers ----------
  // pega o primeiro valor não nulo/indefinido dentro das chaves possíveis
  const pickFirst = (obj, keys) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== undefined && v !== null) return v;
    }
    return null;
  };

  // escapa caracteres HTML perigosos (<, >, &, etc.)
  const safeText = (str) => String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  // renderiza markdown inline (usa `marked` se disponível, senão fallback)
  const renderMdInline = (md) =>
    (window.marked?.parseInline ? window.marked.parseInline(md || '') : renderMarkdown(md || ''));

  // normaliza um item para formato padronizado
  const normalizeRow = (d) => ({
    id:            d?.id ?? null,
    source:        pickFirst(d, SELECTORS.source)        ?? '',
    clean_text:    pickFirst(d, SELECTORS.clean_text)    ?? '',
    markdown_text: pickFirst(d, SELECTORS.markdown_text) ?? '',
    title:         pickFirst(d, SELECTORS.title)         ?? '',
    number:        pickFirst(d, SELECTORS.number),
    score:         pickFirst(d, SELECTORS.score),
    area:          pickFirst(d, SELECTORS.area)          ?? '',
    argumento:     pickFirst(d, SELECTORS.argumento)     ?? '',
    section:       pickFirst(d, SELECTORS.section)       ?? '',
    folha:         pickFirst(d, SELECTORS.folha)         ?? '',
    theme:         pickFirst(d, SELECTORS.theme)         ?? '',
    author:        pickFirst(d, SELECTORS.author)        ?? '',
    sigla:         pickFirst(d, SELECTORS.sigla)         ?? '',
    date:          pickFirst(d, SELECTORS.date)          ?? '',
    link:          pickFirst(d, SELECTORS.link)          ?? ''
  });

  // ---------- Preparação dos dados ----------
  // dict pode vir em dois formatos:
  // 1) array simples de itens [{...}, {...}]
  // 2) objeto { sourceNames, resultsBySource }
  let sourceNames = [];
  let resultsBySource = {};

  if (Array.isArray(dict)) {
    // caso 1: array plano
    const rows = dict.map(normalizeRow);
    for (const r of rows) {
      const src = r.source || '(sem fonte)';
      if (!resultsBySource[src]) resultsBySource[src] = [];
      resultsBySource[src].push(r);
    }
    sourceNames = Object.keys(resultsBySource);
  } else if (dict && (Array.isArray(dict.sourceNames) || dict.resultsBySource)) {
    // caso 2: objeto estruturado
    const inNames  = Array.isArray(dict.sourceNames) ? dict.sourceNames : [];
    const inMap    = dict.resultsBySource || {};
    const mapOut   = {};
    const namesOut = [];
    for (const name of inNames.length ? inNames : Object.keys(inMap)) {
      const arr = Array.isArray(inMap[name]) ? inMap[name] : [];
      const rows = arr.map(normalizeRow);
      if (rows.length) {
        namesOut.push(name);
        mapOut[name] = rows;
      }
    }
    sourceNames = namesOut;
    resultsBySource = mapOut;
  } else {
    // formato inválido
    container.insertAdjacentHTML(
      'beforeend',
      '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
    );
    return;
  }

  if (!sourceNames.length) {
    // nenhum resultado válido
    container.insertAdjacentHTML(
      'beforeend',
      '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
    );
    return;
  }

  // ---------- Ordena os itens de cada fonte por score (desc) ----------
  for (const src of sourceNames) {
    resultsBySource[src].sort((a, b) => {
      const sA = (typeof a.score === 'number' ? a.score : -Infinity);
      const sB = (typeof b.score === 'number' ? b.score : -Infinity);
      return sB - sA;
    });
  }

  // ---------- Monta o sumário inicial ----------
  const totalGlobal = sourceNames.reduce((acc, s) => acc + (resultsBySource[s]?.length || 0), 0);
  const summaryTop = `
    <div style="
      border: 1px solid #ddd;
      background-color: #f7f7f7;
      padding: 10px 12px;
      border-radius: 8px;
      margin: 8px 0 14px 0;
    ">
      <div style="font-weight: bold; margin-bottom: 6px;">
      Total de parágrafos encontrados: ${totalGlobal}
      </div>
      ${sourceNames.map(s => {
        const safe = safeText(s);
        const n = (resultsBySource[s] || []).length;
        return `<div style="margin:2px 0;">● ${safe}: ${n}</div>`;
      }).join('')}
    </div>
  `;

  // ---------- Renderiza cada grupo de resultados por fonte ----------
  const groupsHtml = sourceNames.map((src) => {
    const items = resultsBySource[src] || [];
    if (!items.length) return '';

    const headerSource = safeText(src);
    const totalResults = items.length;

    // lista de parágrafos da fonte
    const contentHtml = items.map((item, idx) => {
      const markerHtml = `<span class="paragraph-marker">[${idx + 1}]</span>`;
      const titleHtml  = item.title ? `<strong>${safeText(item.title)}</strong>. ` : '';
      const textHtml   = renderMdInline(item.markdown_text);

      const scoreHtml = (typeof item.score === 'number' && !Number.isNaN(item.score))
        ? `<span class="badge badge-score">Score: ${item.score.toFixed(2)}</span>` : '';

      const numberHtml = (item.number ?? '') !== ''
        ? `<span class="badge badge-para">#${safeText(item.number)}</span>` : '';

      return `
        <div class="displaybox-item">
          ${markerHtml}
          <span class="displaybox-text">
            <span class="markdown-inline">${titleHtml}${textHtml}</span>
            <span class="badges-group small-green">${scoreHtml} ${numberHtml}</span>
          </span>
        </div>
      `;
    }).join('');

    // bloco da fonte
    return `
      <div class="displaybox-group">
        <div class="displaybox-header">
          <span class="header-text"><strong>${headerSource}</strong></span>
          <span class="badge">${totalResults} resultado${totalResults !== 1 ? 's' : ''}</span>
        </div>
        <div class="displaybox-content">${contentHtml}</div>
      </div>
    `;
  }).join('');


  // ---------- Insere tudo no container ----------
  // Ordem: sumário inicial -> grupos por fonte -> sumário final
  container.insertAdjacentHTML('beforeend', summaryTop + groupsHtml);
}



// ________________________________________________________________________________________
// Show Semantical — single source (versão simplificada e explícita)
// ________________________________________________________________________________________
function showSemanticalSingleSource(container, dictData) {
  if (!container) return;
  if (!Array.isArray(dictData) || dictData.length === 0) {
    container.insertAdjacentHTML(
      'beforeend',
      '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
    );
    return;
  }

  const SHOW_EXTRACTED = false;

  const SELECTORS = {
    source:        ['source', 'book'],
    clean_text:    ['content_text'],
    markdown_text: ['markdown'],
    title:         ['title', 'section'],
    number:        ['paragraph_number', 'quest_number', 'number'],
    score:         ['score'],
    area:          ['area'],
    argumento:     ['argumento'],
    section:       ['section'],
    folha:         ['folha'],
    theme:         ['theme'],
    author:        ['author'],
    sigla:         ['sigla'],
    date:          ['date'],
    link:          ['link']
  };

  const pickFirst = (obj, keys) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== undefined && v !== null) return v;
    }
    return null;
  };

  const safeText = (str) => String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const renderMdInline = (md) =>
    (window.marked?.parseInline ? window.marked.parseInline(md || '') : renderMarkdown(md || ''));

  const rows = dictData.map((d) => {
    const norm = {
      id:            d.id ?? null,
      source:        pickFirst(d, SELECTORS.source)        ?? '',
      clean_text:    pickFirst(d, SELECTORS.clean_text)    ?? '',
      markdown_text: pickFirst(d, SELECTORS.markdown_text) ?? '',
      title:         pickFirst(d, SELECTORS.title)         ?? '',
      number:        pickFirst(d, SELECTORS.number),
      score:         pickFirst(d, SELECTORS.score),
      area:          pickFirst(d, SELECTORS.area)          ?? '',
      argumento:     pickFirst(d, SELECTORS.argumento)     ?? '',
      section:       pickFirst(d, SELECTORS.section)       ?? '',
      folha:         pickFirst(d, SELECTORS.folha)         ?? '',
      theme:         pickFirst(d, SELECTORS.theme)         ?? '',
      author:        pickFirst(d, SELECTORS.author)        ?? '',
      sigla:         pickFirst(d, SELECTORS.sigla)         ?? '',
      date:          pickFirst(d, SELECTORS.date)          ?? '',
      link:          pickFirst(d, SELECTORS.link)          ?? ''
    };

    if (SHOW_EXTRACTED) {
      norm._debug = Object.entries(norm)
        .map(([k, v]) => `- ${k} = ${JSON.stringify(v)}`).join('\n');
    }
    return norm;
  });

  // Ordenação por score
  rows.sort((a, b) => {
    const sA = (typeof a.score === 'number' ? a.score : -Infinity);
    const sB = (typeof b.score === 'number' ? b.score : -Infinity);
    return sB - sA;
  });

  // Cabeçalho
  const totalResults = rows.length;
  const headerSource = safeText(rows[0]?.source || '');

  // =========================
  // Box de síntese
  // =========================
  const summaryHtml = `
    <div style="
      border: 1px solid #ddd;
      background-color: #f7f7f7;
      padding: 10px 12px;
      border-radius: 8px;
      margin: 8px 0 14px 0;
    ">
      <div style="font-weight: bold; margin-bottom: 6px;">
        - Total de parágrafos encontrados: ${totalResults}
      </div>
      <div>- ${headerSource}: ${totalResults}</div>
    </div>
  `;

  // Lista
  const contentHtml = rows.map((item, idx) => {
    const markerHtml = `<span class="paragraph-marker">[${idx + 1}]</span>`;
    const titleHtml  = item.title ? `<strong>${safeText(item.title)}</strong>. ` : '';
    const textHtml   = renderMdInline(item.markdown_text);

    const scoreHtml = (typeof item.score === 'number' && !Number.isNaN(item.score))
      ? `<span class="badge badge-score">Score: ${item.score.toFixed(2)}</span>` : '';

    const numberHtml = (item.number ?? '') !== ''
      ? `<span class="badge badge-para">#${safeText(item.number)}</span>` : '';

    const debugHtml = SHOW_EXTRACTED ? `<pre class="extracted-debug">${safeText(item._debug)}</pre>` : '';

    return `
      <div class="displaybox-item">
        ${markerHtml}
        <span class="displaybox-text">
          <span class="markdown-inline">${titleHtml}${textHtml}</span>
          <span class="badges-group small-green">${scoreHtml} ${numberHtml}</span>
          ${debugHtml}
        </span>
      </div>
    `;
  }).join('');

  // Output final (box + grupo)
  const html = `
    ${summaryHtml}
    <div class="displaybox-group">
      <div class="displaybox-header">
        <span class="header-text"><strong>${headerSource}</strong></span>
        <span class="badge">${totalResults} resultado${totalResults !== 1 ? 's' : ''}</span>
      </div>
      <div class="displaybox-content">${contentHtml}</div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', html);
}









// ________________________________________________________________________________________
// Show Verbetopedia — single source (versão simplificada e explícita)
// ________________________________________________________________________________________
function showVerbetopedia(container, dictData) {
  if (!container) return;
  if (!Array.isArray(dictData) || dictData.length === 0) {
    container.insertAdjacentHTML(
      'beforeend',
      '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
    );
    return;
  }

console.log(`#########Display.js - showVerbetopedia*** [dictData]:`, dictData);

  const SHOW_EXTRACTED = true;

  // Campos possíveis por fonte (ordem = prioridade)
  // EC: Title	Number	Date	Area	Theme	Author	Sigla	Link
  // ________________________________________________________________
  
  const SELECTORS = {
    source:        ['source', 'book'],
    clean_text:    ['content_text'],
    markdown_text: ['markdown'],
    title:         ['title', 'section'],
    number:        ['paragraph_number', 'quest_number', 'number'],
    score:         ['score'],
    area:          ['area'],
    theme:         ['theme'],
    author:        ['author'],
    sigla:         ['sigla'],
    date:          ['date'],
    link:          ['link']
  };

  // Helpers mínimos
  const pickFirst = (obj, keys) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== undefined && v !== null) return v;
    }
    return null;
  };

  const safeText = (str) => String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const renderMdInline = (md) =>
    (window.marked?.parseInline ? window.marked.parseInline(md || '') : renderMarkdown(md || ''));

  // Normalização explícita
  const rows = dictData.map((d) => {
    const norm = {
      id:            d.id ?? null,
      source:        pickFirst(d, SELECTORS.source)        ?? '',
      clean_text:    pickFirst(d, SELECTORS.clean_text)    ?? '',
      markdown_text: pickFirst(d, SELECTORS.markdown_text) ?? '',
      title:         pickFirst(d, SELECTORS.title)         ?? '',
      number:        pickFirst(d, SELECTORS.number),
      score:         pickFirst(d, SELECTORS.score),
      area:          pickFirst(d, SELECTORS.area)          ?? '',
      theme:         pickFirst(d, SELECTORS.theme)         ?? '',
      author:        pickFirst(d, SELECTORS.author)        ?? '',
      sigla:         pickFirst(d, SELECTORS.sigla)         ?? '',
      date:          pickFirst(d, SELECTORS.date)          ?? '',
      link:          pickFirst(d, SELECTORS.link)          ?? ''
    };

    if (SHOW_EXTRACTED) {
      norm._debug = Object.entries(norm)
        .map(([k, v]) => `- ${k} = ${JSON.stringify(v)}`).join('\n');
    }
    return norm;
  });


  // ==========================================================================
  // Ordenação (score desc)
  // ==========================================================================
  rows.sort((a, b) => {
    const sA = (typeof a.score === 'number' ? a.score : -Infinity);
    const sB = (typeof b.score === 'number' ? b.score : -Infinity);
    return sB - sA;
  });

  // Cabeçalho: fonte única
  const totalResults = rows.length;
  const headerSource = safeText(rows[0]?.source || '');
  const headerHtml   = headerSource ? `<strong>${headerSource}</strong>` : '';

  // Lista
  const contentHtml = rows.map((item, idx) => {
    const markerHtml = `<span class="paragraph-marker">[${idx + 1}]</span>`;
    const titleHtml  = item.title
      ? `<strong>${safeText(item.title)}</strong> (${safeText(item.area)})  ●  <em>${safeText(item.author)}</em>  ●  ${safeText(item.number)}  ●  ${safeText(item.date)}`
      : '';
    const textHtml   = renderMdInline(item.markdown_text);

    const scoreHtml = (typeof item.score === 'number' && !Number.isNaN(item.score))
      ? `<span class="badge badge-score">Score: ${item.score.toFixed(2)}</span>` : '';

    const numberHtml = (item.number ?? '') !== ''
      ? `<span class="badge badge-para">#${safeText(item.number)}</span>` : '';


  // 👇 Título acima do texto, agrupando em um único filho do flex
  return `
  <div class="displaybox-item">
    <div class="displaybox-header">
      <span class="header-text">
      ${markerHtml} ${titleHtml}
      </span>
    </div>
    <div class="displaybox-text">
      <span class="markdown-inline">${textHtml}</span>
      <span class="badges-group small-green">${scoreHtml} ${numberHtml}</span>
    </div>
  </div>
`;
}).join('');




// ==========================================================================
// Output final
// ==========================================================================
  const html = `
    <div class="displaybox-group">
      <div class="displaybox-header">
        <span>${headerHtml}</span>
        <span class="badge">${totalResults} resultado${totalResults !== 1 ? 's' : ''}</span>
      </div>
      <div class="displaybox-content">${contentHtml}</div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', html);
}












// ________________________________________________________________
// Show Flattened Results (agrupados) no mesmo estilo do showLexical
// ________________________________________________________________
function showFlattened(container, results) {
  if (!container) return;
  if (!Array.isArray(results) || results.length === 0) {
    container.insertAdjacentHTML(
      'beforeend',
      '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
    );
    return;
  }

  // Agrupar por "source" se existir, senão por "title"
  const grouped = results.reduce((acc, item) => {
    const groupKey = item.source || item.title || "Sem grupo";
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(item);
    return acc;
  }, {});

  // Renderizar cada grupo
  Object.entries(grouped).forEach(([group, items]) => {
    let html = `
      <div class="displaybox-container">
        <div class="displaybox-header">${group}</div>
        <div class="displaybox-content">
    `;

    items.forEach((item, idx) => {
      const mdHtml = renderMarkdown(item.markdown || item.page_content || '');
      const scoreHtml = item.meta_score ? `<span class="badge small-green">Score: ${item.meta_score.toFixed(2)}</span>` : '';
      const numberHtml = item.paragraph_number ? `<span class="badge small-blue">#${item.paragraph_number}</span>` : '';

      html += `
        <div class="displaybox-item">
          <span class="paragraph-marker">[${idx + 1}]</span>
          <span class="displaybox-text markdown-content">${mdHtml}</span>
          <span class="badges-group small-green">${scoreHtml} ${numberHtml}</span>
        </div>
      `;
    });

    html += `</div></div>`;
    container.insertAdjacentHTML('beforeend', html);
  });
}
