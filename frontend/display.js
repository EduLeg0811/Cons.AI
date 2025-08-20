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
    semantical: showSem,
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
function showSem(container, results) {''
  if (!container) {
    console.error('Results container not found');
    return;
  }

  // 0) Garantir array de entrada
  const arr = Array.isArray(results) ? results : (Array.isArray(results?.results) ? results.results : []);
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

  // 2) Configuração dos metadados (fácil de incluir/retirar)
  //    - "keyPaths" aceita alternativas; o primeiro valor existente será usado.
  //    - "label" aparece na badge; "className" permite variações de estilo.
  const META_FIELDS = [
    { id: 'source',   label: 'Source',   keyPaths: ['book', 'source', 'file'], className: 'badge small-green' },
    { id: 'number',   label: 'Number',   keyPaths: ['paragraph_number', 'number'], className: 'badge small-green'   },
    { id: 'title',    label: 'Title',    keyPaths: ['title'],          className: 'badge small-green' },
    { id: 'argumento',label: 'Argumento',keyPaths: ['argumento'],      className: 'badge small-green' },
    { id: 'division', label: 'Division', keyPaths: ['division'],       className: 'badge small-green' },
    { id: 'folha',    label: 'Folha',    keyPaths: ['folha'],          className: 'badge small-green' },
    { id: 'author',   label: 'Author',   keyPaths: ['author', 'autor'],className: 'badge small-green' },
    { id: 'theme',     label: 'Tematologia', keyPaths: ['tematologia'], className: 'badge small-green' },
    { id: 'area',     label: 'Especialidade', keyPaths: ['especialidade'], className: 'badge small-green' },
    { id: 'date',     label: 'Date',     keyPaths: ['date', 'data'],   className: 'badge small-green' },
    { id: 'score',    label: 'Score',    keyPaths: ['score'],          className: 'badge small-green' },
    { id: 'link',     label: 'Link',     keyPaths: ['link', 'url'], className: 'badge small-green' },
  ];

  // Campos a ignorar no "varre-tudo" dinâmico (para não duplicar)
  const IGNORE_FOR_DYNAMIC = new Set(
    ['markdown','page_content','text','type','display_md','id','_origIndex','_srcRaw','_src']
    .concat(META_FIELDS.flatMap(f => f.keyPaths))
  );

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
  </div>
`;
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
        (typeof item.markdown   === 'string' && item.markdown)   ||
        (typeof item.page_content === 'string' && item.page_content) ||
        ''  
      );
      
      // If source is "LO" and there's a title, prepend it in bold
      if ((item.book === 'LO' || item.source === 'LO' || item.file === 'LO') && item.title) {
        content = `**${item.title}**. ${content}`;
      }
      
      const rawHtml  = renderMarkdown(content);
      const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

      // 5.2) Marcador sequencial [n] (posição dentro do grupo)
      const markerHtml = `<span class="paragraph-marker" style="font-size: 6px; color: gray; font-weight: bold; display: inline-block; margin-right: 4px;">[${idx + 1}]</span>`;

      // 5.3) Construção das badges de metadados
      const badges = [];

      // Helper: pega o primeiro valor válido de uma lista de chaves
      const getFirst = (obj, keys) => {
        for (const k of keys) {
          const v = obj?.[k];
          if (v !== undefined && v !== null && String(v).trim() !== '') return v;
        }
        return undefined;
      };

      // Campos declarados em META_FIELDS, em ordem
      META_FIELDS.forEach(field => {
        let val = getFirst(item, field.keyPaths);
        if (val === undefined) return;

        // Normaliza 'source' para exibição
        if (field.id === 'source') {
          val = normSourceName(val);
        }

        // Formatação específica
        if (field.id === 'score' && typeof val === 'number' && !Number.isNaN(val)) {
          val = val.toFixed(2);
        }

        // Link clicável quando for 'link'
        if (field.id === 'link' && typeof val === 'string') {
          const url = val;
          const esc = escapeHtml(url);
          badges.push(`<a class="${field.className}" href="${esc}" target="_blank" rel="noopener noreferrer">${escapeHtml(field.label)}</a>`);
        } else {
          badges.push(`<span class="${field.className}">${escapeHtml(field.label)}: ${escapeHtml(String(val))}</span>`);
        }
      });

      // 5.4) Badges dinâmicas (para qualquer outro metadado "simples")
      for (const [k, v] of Object.entries(item)) {
        if (IGNORE_FOR_DYNAMIC.has(k)) continue;
        if (v === undefined || v === null) continue;
        const t = typeof v;
        if (t === 'string' || t === 'number' || t === 'boolean') {
          // evita duplicar se já foi contemplado pelos campos declarados
          const alreadyCovered = META_FIELDS.some(f => f.keyPaths.includes(k));
          if (alreadyCovered) continue;
          badges.push(`<span class="badge small-green">${escapeHtml(k)}: ${escapeHtml(String(v))}</span>`);
        }
      }

    //   // 5.5) Render final do item
    //   return `
    //     <div class="displaybox-item" data-orig-index="${item._origIndex ?? ''}" data-paragraph-number="${item.paragraph_number ?? ''}">
    //       ${markerHtml}
    //       <span class="displaybox-text">
    //         <span class="markdown-inline">${safeHtml}</span>
    //         <span class="badges-group small-green">${badges.join(' ')}</span>
    //       </span>
    //     </div>
    //   `;
    // }).join('');

    // 5.5) Render final do item
    return `
    <div class="displaybox-item">
      <span class="displaybox-text">
        <span class="markdown-inline">${safeHtml}</span>
        <span class="badges-group small-green">${badges.join(' ')}</span>
      </span>
    </div>
  `;
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
      </div>
    `;
    container.insertAdjacentHTML('beforeend', groupHtml);
  });


}






// ________________________________________________________________________________________
// showLexical(container, responseData): consome resposta "flattened" da API
// Estrutura esperada:
//   responseData = {
//     term: string,
//     search_type: "lexical",
//     results: [{ paragraph, paragraph_number, book }, ...],
//     count: number
//   }
// ________________________________________________________________________________________
function showLexical(container, responseData) {
  if (!container) {
    console.error('Results container not found');
    return;
  }

  // 1) Validação do payload
  const results = Array.isArray(responseData?.results) ? responseData.results : [];
  if (!results.length) {
    container.insertAdjacentHTML(
      'beforeend',
      '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
    );
    return;
  }

  // 2) Agrupar por "book" (em sources)
  //    Se não houver "book", cai para "Results".
  const groups = results.reduce((acc, item) => {
    const key = (item && item.book) ? String(item.book) : 'Results';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const sourceNames = Object.keys(groups);

  // 3) SÍNTESE (box superior): total + por fonte/livro
  const totalCount = results.length;
  const perSourceLines = sourceNames.map(src => {
    const n = (groups[src] || []).length;
    return `<div><strong>${escapeHtml(src)}</strong>: ${n} resultado${n !== 1 ? 's' : ''}</div>`;
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
  container.insertAdjacentHTML('beforeend', summaryHtml);

  // 4) Renderização por grupo (mesmo estilo de HTML do anterior)
  sourceNames.forEach(src => {
    const items = groups[src].slice();

    // Ordena dentro do grupo por paragraph_number (se existir), senão mantém a ordem original
    items.sort((a, b) => {
      const na = Number.isFinite(a?.paragraph_number) ? a.paragraph_number : Infinity;
      const nb = Number.isFinite(b?.paragraph_number) ? b.paragraph_number : Infinity;
      return na - nb;
    });

    // Conteúdo dos itens do grupo
    const contentHtml = items.map((item, idx) => {
      const seqMarker = `<span class="paragraph-marker" style="font-size: 6px; color: gray; font-weight: bold;">[${idx + 1}]</span>`;
      const mdHtml = renderMarkdown(item?.paragraph || item?.text || '');

      // Badge do número absoluto do parágrafo no arquivo (se presente)
      const paraBadge = (item?.paragraph_number != null)
        ? `<span class="score-badge small-green">#${String(item.paragraph_number)}</span>`
        : '';

      // return `
      //   <div class="displaybox-item">
      //     ${seqMarker}
      //     <span class="displaybox-text markdown-content">${mdHtml}</span>
      //     ${paraBadge}
      //   </div>`;


        return `
        <div class="displaybox-item">
          <span class="displaybox-text markdown-content">${mdHtml}</span>
          ${paraBadge}
        </div>`;




    }).join('');

    // Header do grupo + conteúdo
    const groupHtml = `
      <div class="displaybox-group">
        <div class="displaybox-header">
          <span style="color: blue; font-weight: bold;">${escapeHtml(src)}</span>
          <span class="score-badge" style="font-size: 10px">${items.length} resultado${items.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="displaybox-content">
          ${contentHtml}
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', groupHtml);
  });
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

    const metaInfo = `
    <div class="badges-group small-green">Citations: ${Array.isArray(data.citations) ? data.citations.join(', ') : data.citations}</div>
    <div class="badges-group small-green">Tokens: ${data.total_tokens_used}</div>
    <div class="badges-group small-green">Model: ${data.model}</div>
  `;
  
  const html = `
    <div class="displaybox-container">
      <div class="displaybox-content">
        <div class="displaybox-text markdown-content">${mdHtml}</div> <!-- <<< -->
        <div class="displaybox-item">
          <span class="badges-group small-green">Citations: ${Array.isArray(data.citations) ? data.citations.join(', ') : data.citations}</span>
          <span class="badges-group small-green">Tokens: ${data.total_tokens_used}</span>
          <span class="badges-group small-green">Model: ${data.model}</span>
        </div>
      </div>
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
    const markerHtml = `<span class="paragraph-marker" style="font-size: 6px; color: gray; font-weight: bold; display: inline-block;">[${idx + 1}]</span>`;
    const titleHtml  = item.title
      ? `<strong>${safeText(item.title)}</strong> (${safeText(item.area)})  ●  <em>${safeText(item.author)}</em>  ●  ${safeText(item.number)}  ●  ${safeText(item.date)}`
      : '';
    const textHtml   = renderMdInline(item.markdown_text);

    const scoreHtml = (typeof item.score === 'number' && !Number.isNaN(item.score))
      ? `<span class="badges-group small-green">Score: ${item.score.toFixed(2)}</span>` : '';

    const numberHtml = (item.number ?? '') !== ''
      ? `<span class="badges-group small-green">#${safeText(item.number)}</span>` : '';


  // 👇 Título acima do texto, agrupando em um único filho do flex
  return `
  <div class="displaybox-item">
    <div class="displaybox-header">
      <span class="header-text">${titleHtml}</span>
    </div>
    <div class="displaybox-text">
      <span class="displaybox-text markdown-content">${textHtml}</span>
      <span class="badges-group small-green">${scoreHtml} ${numberHtml}</span>
    </div>
  </div>
`;


  // return `
  //   <div class="displaybox-item">
  //     <div class="displaybox-header">
  //       <span class="header-text">
  //       ${markerHtml} ${titleHtml}
  //       </span>
  //     </div>
  //     <div class="displaybox-text">
  //       <span class="markdown-inline">${textHtml}</span>
  //       <span class="badges-group small-green">${scoreHtml} ${numberHtml}</span>
  //     </div>
  //   </div>
  // `;


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


