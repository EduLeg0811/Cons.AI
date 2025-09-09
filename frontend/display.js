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
    ccg: showCcg,
    quiz: showQuiz,
    lexverb: showLexverb
};

// Resolve group accent color from global constants
function getAccentColor(type) {
  try {
    const groupMap = (window && window.MODULE_GROUPS) || {};
    const colors = (window && window.GROUP_COLORS) || {};
    const grp = groupMap[type];
    const col = grp && colors[grp] && (colors[grp].primary || colors[grp].color || colors[grp]);
    if (col) return col;
  } catch {}
  try {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--module-accent').trim();
    if (c) return c;
  } catch {}
  return '#0ea5e9';
}

// Helper: decide if reference badges should be shown (default: true)
function shouldShowRefBadges() {
  try {
    if (typeof window !== 'undefined' && typeof window.SHOW_REF_BADGES === 'boolean') {
      return !!window.SHOW_REF_BADGES;
    }
  } catch (e) {}
  return true; // fallback default
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





// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++




//______________________________________________________________________________________________
// showSearch
//______________________________________________________________________________________________
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
            s = s.replace(/\.(md|markdown|txt|xlsx)$/i, ''); // tira extensão
            return s;
        };


   // 2) Agrupar por fonte normalizada
        const groups = arr.reduce((acc, it, idx) => {
            const raw = it?.book || it?.source || it?.file || 'Results';
            const key = normSourceName(raw);
            if (!acc[key]) acc[key] = [];
            acc[key].push({ ...it, _origIndex: idx, _srcRaw: raw, _src: key });
            return acc;
        }, {});
        const groupNames = Object.keys(groups);


    // 3) Summary badges (rows) and rendering
    // ===========================================================================================

    const totalCount = arr.length;
    const slug = (s) => String(s || 'all')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    // Get the checkbox state
    const flag_grouping = document.getElementById('groupResults')?.checked ?? true;

    // Build summary rows according to grouping toggle
    let summaryRows = '<div class="summary-list">';
    if (flag_grouping) {
        // Only per-source rows
        summaryRows += groupNames.map(name => {
            const n = groups[name].length;
            const target = `group-${slug(name)}`;
            // Aplica cor do grupo nos pills por fonte (usa mesma cor do módulo lexical) com transparência
            const accent = getAccentColor('lexical');
            const accentWithAlpha = `${accent}CC`; // Adiciona 80% de opacidade (CC em hex)
            return `<button class="pill pill-row accented" data-target="${target}"><span class="pill-label">${escapeHtml(bookName(name))}</span><span class="count">${n}</span></button>`;
        }).join('');
    } else {
        // Only total row
        summaryRows += `<button class="pill pill-row accented" data-target="all-results"><span class="pill-label">Total</span><span class="count">${totalCount}</span></button>`;
    }
    summaryRows += '</div>';
    container.insertAdjacentHTML('beforeend', summaryRows);


    // Processamento GERAL
    // ===========================================================================================

    if (flag_grouping) {

            
        // 4) Render por GRUPOS (cada source name)
        // ===========================================================================================
        groupNames.forEach(groupName => {

            const groupItems = groups[groupName];
            let groupHtml = '';

            // Processa cada item agrupado
            groupItems.forEach((item, idx) => {
                
                const markerHtml = `<span class="paragraph-marker" style="font-size: 10px; color: gray; font-weight: bold; display: inline-block; margin-right: 4px;">[${idx + 1}]</span>`;
                const sourceName = item.source || item.file || item.book || 'Unknown';

                let itemHtml = '';
                itemHtml = format_paragraphs_source (item, sourceName);

                groupHtml += itemHtml;
            });


            // 5) HTML final do grupo
            // =======================================
            const panelId = 'group-' + slug(groupName);
            const groupPanel = `
                <div id="${panelId}" class="collapse-panel">
                    <div class="displaybox-container">
                        <div class="displaybox-content group-content">
                            ${groupHtml}
                        </div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', groupPanel);

        });



    } else {

        // Reunir os itens de todas as fontes em lista única
        // ===========================================================================================
        const sortedItems = [...arr].sort((b, a) => (b.score || 0) - (a.score || 0));

        let groupHtml = '';

        // Renderizar os itens ordenados
        // ===========================================================================================
        sortedItems.forEach((item, idx) => {

            const markerHtml = `<span class="paragraph-marker" style="font-size: 10px; color: gray; font-weight: bold; display: inline-block; margin-right: 4px;">[${idx + 1}]</span>`;
            const sourceName = item.source || item.file || item.book || 'Unknown';
        

            let itemHtml = '';
            itemHtml = format_paragraphs_source (item, sourceName);

            groupHtml += itemHtml;
        });

       
         // 5) HTML final do grupo
        // =======================================
        const groupPanel = `
            <div id="all-results" class="collapse-panel">
                <div class="displaybox-container">
                    <div class="displaybox-content group-content">
                        ${groupHtml}
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', groupPanel);

    };

    // Attach toggle behavior for summary pills (event delegation inside container)
    // Bind click handler once per container to avoid double toggles after new queries
    if (!container.__pillHandlerBound) {
        container.addEventListener('click', function(ev) {
            const btn = ev.target.closest('.pill');
            if (!btn) return;
            ev.preventDefault();
            const targetId = btn.getAttribute('data-target');
            if (!targetId) return;
            const safeId = `#${targetId.replace(/[^a-z0-9\-_:]/gi, '')}`;
            const panel = container.querySelector(safeId) || container.querySelector(`#${targetId}`);
            if (!panel) return;
            panel.classList.toggle('open');
            if (panel.classList.contains('open')) {
                try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
            }
        });
        // mark bound
        container.__pillHandlerBound = true;
    }

}






// ===========================================================================
// format_paragraphs_source
// ===========================================================================
const format_paragraphs_source = (item, sourceName) => {

    let itemHtml = '';
    
    if (sourceName === 'LO') {
        itemHtml = format_paragraph_LO(item);
    }
    else if (sourceName === 'DAC') {
        itemHtml = format_paragraph_DAC(item);
    }
    else if (sourceName === 'CCG') {
        itemHtml = format_paragraph_CCG(item);
    }
    else if (sourceName === 'EC' || sourceName === 'ECALL_DEF' || sourceName === 'ECWV' || sourceName === 'ECALL') {
        itemHtml = format_paragraph_EC(item);
    }
    else {
        itemHtml = format_paragraph_Default(item);
    }
    return itemHtml;    
};





// ===========================================================================
// LO: Content_Text  Markdown_Text Title  Number  Score
// ===========================================================================
const format_paragraph_LO = (item) => {



    // Fields are directly on the item
    const title = item.title || '';
    const paragraph_number = item.number || '';
    const score = item.score || 0.00;
    const text = item.markdown || item.content_text || item.text || '';
    let source = item.source || '';
    source = bookName(source);

    // console.log('---------------[display.js] [format_paragraph_LO] paragraph_number: ', paragraph_number);
    // console.log('---------------[display.js] [format_paragraph_LO] title: ', title);
    // console.log('---------------[display.js] [format_paragraph_LO] score: ', score);
    // console.log('---------------[display.js] [format_paragraph_LO] source: ', source);

    // Add each field to the array only if it has a value
    const badgeParts = [];
    if (source) {
        badgeParts.push(`<span class="metadata-badge estilo1"><strong>${escapeHtml(source)}</strong></span>`);
    }
    if (title) {
        badgeParts.push(`<span class="metadata-badge estilo2"> <strong>${escapeHtml(title)}</strong></span>`);
    }

    if (window.CONFIG ? !!window.CONFIG.FULL_BADGES : FULL_BADGES) {
        if (paragraph_number) {
            badgeParts.push(`<span class="metadata-badge estilo2"> #${escapeHtml(paragraph_number)}</span>`);
        }
        if (score > 0.0) {
            badgeParts.push(`<span class="metadata-badge estilo2"> @${escapeHtml(score)}</span>`);
        }
    }

    // Join the non-empty badges with a space
    metaBadges = badgeParts.join('');

    // Add title to text if score > 0.0 (Semantical Search)
    const textCompleted = (score > 0.0) ? `**${title}**. ${text}` : text;

    // Renderiza markdown
    const rawHtml = renderMarkdown(textCompleted);
    const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

    // Decide badges vs inline meta line
    const showBadges = shouldShowRefBadges();
    const metaInline = buildMetaInlineLine([
        ['Source', source],
        ['Title', title],
        ['Number', paragraph_number],
        ...(score > 0.0 ? [['Score', score]] : []),
    ]);

    const finalHtml = showBadges
      ? `
        <div class="displaybox-item">
            <div class="displaybox-text markdown-content">${safeHtml}</div>
            ${metaBadges}
        </div>`
      : `
        <div class="displaybox-item">
            <div class="displaybox-text markdown-content">${safeHtml}${metaInline}</div>
        </div>`;

    return finalHtml;
}

  


// ===========================================================================
// DAC: Content_Text  Markdown  Title  Number  Source  Argumento  Section
// ===========================================================================
const format_paragraph_DAC = (item) => {
    


    // Fields are directly on the item
    const title = item.title || '';
    const paragraph_number = item.number || '';
    const score = item.score || 0.00;
    const text = item.markdown || item.content_text || item.text || '';
    const argumento = item.argumento || '';
    const section = item.section || '';
    let source = item.source || '';
    source = bookName(source);

    // Add each field to the array only if it has a value
    const badgeParts = [];      
    if (source) {
        badgeParts.push(`<span class="metadata-badge estilo1"> <strong>${escapeHtml(source)}</strong></span>`);
    }
    if (title) {
        badgeParts.push(`<span class="metadata-badge estilo2"> <strong>${escapeHtml(title)}</strong></span>`);
    }
    if (argumento) {
        badgeParts.push(`<span class="metadata-badge estilo2"> ${escapeHtml(argumento)}</span>`);
    }
    if (section) {
        badgeParts.push(`<span class="metadata-badge estilo2"> <em> ${escapeHtml(section)}</em></span>`);
    }

    if (window.CONFIG ? !!window.CONFIG.FULL_BADGES : FULL_BADGES) {
        if (paragraph_number) {
            badgeParts.push(`<span class="metadata-badge estilo2"> #${escapeHtml(paragraph_number)}</span>`);
        }
        if (score > 0.0) {
            badgeParts.push(`<span class="metadata-badge estilo2"> @${escapeHtml(score)}</span>`);
        }
    }



    // Join the non-empty badges with a space
    metaBadges = badgeParts.join('');

    // Renderiza markdown
    const rawHtml = renderMarkdown(text);
    const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

    // Decide badges vs inline meta line
    const showBadges = shouldShowRefBadges();
    const metaInline = buildMetaInlineLine([
        ['Source', source],
        ['Title', title],
        ['Argument', argumento],
        ['Section', section],
        ['Number', paragraph_number],
        ...(score > 0.0 ? [['Score', score]] : []),
    ]);

    const finalHtml = showBadges
      ? `
        <div class="displaybox-item">
            <div class="displaybox-text markdown-content">${safeHtml}</div>
            ${metaBadges}
        </div>`
      : `
        <div class="displaybox-item">
            <div class="displaybox-text markdown-content">${safeHtml}${metaInline}</div>
        </div>`;

    return finalHtml;
}
    
    
  
// ===========================================================================
// CCG: Content_Text  Markdown_Text  Title  Number  Source  Folha
// ===========================================================================
const format_paragraph_CCG = (item) => {
    

    // Fields are directly on the item
    const title = item.title || '';
    const question_number = item.number || '';
    const score = item.score || 0.00;
    const text = item.markdown || item.content_text || item.text || '';
    const folha = item.folha || '';
    let source = item.source || '';
    source = bookName(source);


    // Add each field to the array only if it has a value
    const badgeParts = [];   
    if (source) {
        badgeParts.push(`<span class="metadata-badge estilo1"> <strong>${escapeHtml(source)}</strong></span>`);
    }
    if (title) {
        badgeParts.push(`<span class="metadata-badge estilo2"> <strong>${escapeHtml(title)}</strong></span>`);
    }
    if (folha) {
        badgeParts.push(`<span class="metadata-badge estilo2"> (${escapeHtml(folha)})</span>`);
    }
    if (question_number) {
        badgeParts.push(`<span class="metadata-badge estilo2"> #${escapeHtml(question_number)}</span>`);
    }

    if (window.CONFIG ? !!window.CONFIG.FULL_BADGES : FULL_BADGES) {
        if (score > 0.0) {
            badgeParts.push(`<span class="metadata-badge estilo2"> @${escapeHtml(score)}</span>`);
        }
    }

    // Join the non-empty badges with a space
    metaBadges = badgeParts.join('');
    
    // Renderiza markdown
    const rawHtml = renderMarkdown(text);
    const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

    // Decide badges vs inline meta line
    const showBadges = shouldShowRefBadges();
    const metaInline = buildMetaInlineLine([
        ['Source', source],
        ['Title', title],
        ['Folha', folha],
        ['Number', question_number],
        ...(score > 0.0 ? [['Score', score]] : []),
    ]);

    const finalHtml = showBadges
      ? `
        <div class="displaybox-item">
            <div class="displaybox-text markdown-content">${safeHtml}</div>
            ${metaBadges}
        </div>`
      : `
        <div class="displaybox-item">
            <div class="displaybox-text markdown-content">${safeHtml}${metaInline}</div>
        </div>`;

    return finalHtml;
}

  
// ===========================================================================
// EC: Content_Text  Markdown_Text  Title  Number  Source  Area  Theme  Author  Sigla  Date  Link
// ===========================================================================
const format_paragraph_EC = (item) => {
    

    // Fields are directly on the item
    const title = item.title || '';
    const verbete_number = item.number || '';
    const score = item.score || 0.00;
    const text = item.markdown || item.content.text || item.text || '';
    const area = item.area || '';
    const theme = item.theme || '';
    const author = item.author || '';
    const sigla = item.sigla || '';
    const date = item.date || '';
    const link = item.link || '';
    let source = item.source || '';
    source = bookName(source);


    // Add each field to the array only if it has a value
    const badgeParts = [];   
    if (source) {
        badgeParts.push(`<span class="metadata-badge estilo1"> <strong>${escapeHtml(source)}</strong></span>`);
    }
    if (title) {
        badgeParts.push(`<span class="metadata-badge estilo2"> <strong>${escapeHtml(title)}</strong></span> `);
    }
    if (area) {
        badgeParts.push(`<span class="metadata-badge estilo2"> <em> ${escapeHtml(area)}</em></span>`);
    }
    if (verbete_number) {
        badgeParts.push(`<span class="metadata-badge estilo2"> #${escapeHtml(verbete_number)}</span>`);
    }
    if (theme) {
        badgeParts.push(`<span class="metadata-badge estilo2"> ${escapeHtml(theme)}</span>`);
    }
    if (author) {
        badgeParts.push(`<span class="metadata-badge estilo2"> ${escapeHtml(author)}</span>`);
    }
    if (date) {
        badgeParts.push(`<span class="metadata-badge estilo2"> ${escapeHtml(date)}</span>`);
    }

    if (window.CONFIG ? !!window.CONFIG.FULL_BADGES : FULL_BADGES) {
        if (score > 0.0) {
            badgeParts.push(`<span class="metadata-badge estilo2"> @${escapeHtml(score)}</span>`);
        }
    }

    // Join the non-empty badges with a space
    metaBadges = badgeParts.join('');
      
    // Renderiza markdown
    const rawHtml = renderMarkdown(text);
    const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

    // Decide badges vs inline meta line
    const showBadges = shouldShowRefBadges();
    const metaInline = buildMetaInlineLine([
        ['Source', source],
        ['Title', title],
        ['Area', area],
        ['Number', verbete_number],
        ['Theme', theme],
        ['Author', author],
        ['Date', date],
        ...(score > 0.0 ? [['Score', score]] : []),
    ]);

    const finalHtml = showBadges
      ? `
        <div class="displaybox-item">
            <div class="displaybox-text markdown-content">${safeHtml}</div>
            ${metaBadges}
        </div>`
      : `
        <div class="displaybox-item">
            <div class="displaybox-text markdown-content">${safeHtml}${metaInline}</div>
        </div>`;

    return finalHtml;
}

  










// ===========================================================================
// Default: Content_Text  Markdown_Text Title  Number  Score
// ===========================================================================
const format_paragraph_Default = (item) => {


    // Fields are directly on the item
    const title = item.title || '';
    const paragraph_number = item.number || '';
    const score = item.score || 0.00;
    const text = item.markdown || item.content_text || item.text || '';
    let source = item.source || '';
    source = bookName(source);


    // Add each field to the array only if it has a value
    const badgeParts = [];
    if (source) {
        badgeParts.push(`<span class="metadata-badge estilo1"><strong>${escapeHtml(source)}</strong></span>`);
    }
     if (title) {
         badgeParts.push(`<span class="metadata-badge estilo2"> <strong>${escapeHtml(title)}</strong></span>`);
     }

     if (window.CONFIG ? !!window.CONFIG.FULL_BADGES : FULL_BADGES) {
        if (paragraph_number) {
            badgeParts.push(`<span class="metadata-badge estilo2"> #${escapeHtml(paragraph_number)}</span>`);
        }
    
        if (score > 0.0) {
            badgeParts.push(`<span class="metadata-badge estilo2"> @${escapeHtml(score)}</span>`);
        }
    }


    // Join the non-empty badges with a space
    metaBadges = badgeParts.join('');

    // Add title to text if score > 0.0 (Semantical Search)
    const textCompleted = (score > 0.0) ? `**${title}**. ${text}` : text;

    // Renderiza markdown
    const rawHtml = renderMarkdown(textCompleted);
    const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

    // Decide badges vs inline meta line
    const showBadges = shouldShowRefBadges();
    const metaInline = buildMetaInlineLine([
        ['Source', source],
        ['Title', title],
        ['Number', paragraph_number],
        ...(score > 0.0 ? [['Score', score]] : []),
    ]);

    const finalHtml = showBadges
      ? `
        <div class="displaybox-item">
            <div class="displaybox-text markdown-content">${safeHtml}</div>
            ${metaBadges}
        </div>`
      : `
        <div class="displaybox-item">
            <div class="displaybox-text markdown-content">${safeHtml}${metaInline}</div>
        </div>`;

    return finalHtml;
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
  //   temperature: number
  // }
  function showRagbot(container, data) {
    const text = data?.text || 'No text available.';
    const mdHtml = renderMarkdown(text);

    // ***********************************************************************
    // Extract metadata
    // ***********************************************************************
    // ragbot: {
    //   metadataFields: ['title', 'number', 'source', 'citations', 'total_tokens_used', 'model', 'temperature']
    // }
    // ***********************************************************************
    metadata = extractMetadata(data, 'ragbot');

    const citations = metadata?.citations;
    const total_tokens_used = metadata?.total_tokens_used;
    const model = metadata?.model;
    const temperature = metadata?.temperature;
    
    // Badge do número absoluto do parágrafo no arquivo (se presente)
    const metaInfo = `
    <div class="metadata-container">
      <span class="metadata-badge citation">Citations: ${citations}</span>
      <span class="metadata-badge model">Model: ${model}</span>
      <span class="metadata-badge tokens">Tokens: ${total_tokens_used}</span>
    </div>
    `;  
  
  const html = `
    <div class="displaybox-container ragbot-box">
      <div class="displaybox-content">
        <div class="displaybox-text markdown-content">${mdHtml}</div>
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
    <div style="
        border: 1px solid var(--gray-200);
        background-color: var(--gray-100);
        padding: 10px 12px;
        border-radius: 8px;
        margin: 8px 0 14px 0;
        
    ">
        <div style="font-weight: bold; color: var(--gray-900);">
           ${cleanText}
        </div>
    </div>`;
  
    
    container.insertAdjacentHTML('beforeend', html);
}

// ________________________________________________________________________________________
// Show Simple
// ________________________________________________________________________________________
 // Expected data format from /simple:
  // {
  //    text: string,
  //    ref: string
  //    citations: array,
  //    total_tokens_used: number,
  //    type: 'simple',
  //    model: string,
  //    temperature: number
  // }
  function showSimple(container, data) {
    const text = data.text;
    const ref = data.ref || "";
    const mdHtml = renderMarkdown(text);

    const html = `
    <div class="displaybox-container simple">
      <div class="displaybox-content">
        <div class="displaybox-text markdown-content">
          ${mdHtml}
          <div class="simple-ref">${ref}</div>
        </div>
      </div>
    </div>`;

    container.insertAdjacentHTML('beforeend', html);
  }




// ________________________________________________________________________________________
// Show Verbetopedia (simplificada — ordenação por score)
// ________________________________________________________________________________________

function showVerbetopedia(container, data) {
    if (!container) {
        console.error('Results container not found');
        return;
    }

    console.log('====== showVerbetopedia [data]:', data);

    // 0) Garantir array de entrada
    const arr = Array.isArray(data.results) ? data.results : [];
    if (!arr.length) {
        container.insertAdjacentHTML(
            'beforeend',
            '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
        );
        return;
    }

    console.log('====== showVerbetopedia [arr]:', arr);

    // 1) Extrair metadados antes para usar score
    const items = arr.map(item => {
        const metaData = extractMetadata(item, 'verbetopedia');
        return { ...item, _meta: metaData };
    });

    // 2) Ordenar por score decrescente
    items.sort((a, b) => {
        const sa = (typeof a._meta.score === 'number') ? a._meta.score : -Infinity;
        const sb = (typeof b._meta.score === 'number') ? b._meta.score : -Infinity;
        return sa - sb; // menor primeiro
    });

   
    // 3) Gera HTML de cada item
    const contentHtml = items.map(item => {
        // Conteúdo principal
        let content = (
            (typeof item.markdown === 'string' && item.markdown) ||
            (typeof item.page_content === 'string' && item.page_content) ||
            (typeof item.text === 'string' && item.text) ||
            ''
        );

        const rawHtml  = renderMarkdown(content);
        const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

        const metaData = item._meta;

        // Inclui ícone PDF após o título
        const titleHtml = `
        <strong>${metaData.title}</strong> (${metaData.area})  ●  <em>${metaData.author}</em>  ●  #${metaData.number}  ●  ${metaData.date}
    `;

        const scoreHtml = (typeof metaData.score === 'number' && !Number.isNaN(metaData.score))
            ? `<span class="rag-badge">Score: ${metaData.score.toFixed(2)}</span>` : '';


        console.log('====== showVerbetopedia [metaData]:', metaData);


        // 3) Monta o link para download do verbete PDF
        let arquivo = metaData.title;

        console.log('====== showVerbetopedia [arquivo]:', arquivo);

        // Sanitiza: remove acentos e troca ç/Ç
        arquivo = arquivo
            .normalize("NFD")                // separa acentos da letra
            .replace(/[\u0300-\u036f]/g, "") // remove diacríticos
            .replace(/ç/g, "c")              // troca ç
            .replace(/Ç/g, "C");             // troca Ç

        // Monta link final (com encoding seguro)
        const verbLink = VERBETES_URL + encodeURIComponent(arquivo) + ".pdf";


        const pdfLink = `
            <a href="${verbLink}" target="_blank" rel="noopener noreferrer"
            title="Abrir PDF em nova aba" style="margin-left: 8px; color: red; font-size: 1.1em;">
                <i class="fas fa-file-pdf"></i>
            </a>`;

           
        // 4) Monta o HTML final
        return `
        <div class="displaybox-item">
            <div class="displaybox-header verbetopedia-header" style="text-align: left; padding-left: 0; color:rgb(20, 30, 100)">
                <span class="header-text">${titleHtml}</span>
            </div>
            <div class="displaybox-text">
                <span class="displaybox-text markdown-content">${safeHtml}</span>
                ${(window.CONFIG ? !!window.CONFIG.FULL_BADGES : FULL_BADGES) ? `<span class="metadata-badge">${scoreHtml}</span>` : ''}
                ${pdfLink}
            </div>
        </div>
        `;
    }).join('');



    // 5) Bloco final (único grupo — EC)
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

    // Also render collapsible badge row + panel for Verbetopedia
    const _vb_count = items.length;
    const _vb_html = `
      <div class="summary-list">
        <button class="pill pill-row accented" data-target="group-ec">
          <span class="pill-label">Enciclopédia da Conscienciologia</span>
          <span class="count">${_vb_count}</span>
        </button>
      </div>
      <div id="group-ec" class="collapse-panel">
        <div class="displaybox-container">
          <div class="displaybox-content group-content">
            ${contentHtml}
          </div>
        </div>
      </div>`;
    container.insertAdjacentHTML('beforeend', _vb_html);

    if (!container.__pillHandlerBound) {
      container.addEventListener('click', function(ev) {
          const btn = ev.target.closest('.pill');
          if (!btn) return;
          ev.preventDefault();
          const targetId = btn.getAttribute('data-target');
          if (!targetId) return;
          const safeId = `#${targetId.replace(/[^a-z0-9\-_:]/gi, '')}`;
          const panel = container.querySelector(safeId) || container.querySelector(`#${targetId}`);
          if (!panel) return;
          panel.classList.toggle('open');
          if (panel.classList.contains('open')) {
              try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
          }
      });
      container.__pillHandlerBound = true;
    }
}








// ________________________________________________________________________________________
// Show Lexverb
// ________________________________________________________________________________________

function showLexverb(container, data) {


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
   
    // 3) Gera HTML de cada item
    const contentHtml = arr.map(item => {

        // Conteúdo principal
        const metaData = item.metadata;

        let content = metaData.markdown || metaData.page_content || metaData.text || metaData.paragraph || '';
        const rawHtml  = renderMarkdown(content);
        const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

        // Inclui ícone PDF após o título
        const titleHtml = `
        <strong>${metaData.title}</strong> (${metaData.area})  ●  <em>${metaData.author}</em>  ●  #${metaData.number}  ●  ${metaData.date}
    `;

        // 3) Monta o link para download do verbete PDF
        let arquivo = metaData.title;

        // Sanitiza: remove acentos e troca ç/Ç
        arquivo = arquivo
            .normalize("NFD")                // separa acentos da letra
            .replace(/[\u0300-\u036f]/g, "") // remove diacríticos
            .replace(/ç/g, "c")              // troca ç
            .replace(/Ç/g, "C");             // troca Ç

        // Monta link final (com encoding seguro)
        const verbLink = VERBETES_URL + encodeURIComponent(arquivo) + ".pdf";


        const pdfLink = `
            <a href="${verbLink}" target="_blank" rel="noopener noreferrer"
            title="Abrir PDF em nova aba" style="margin-left: 8px; color: red; font-size: 1.1em;">
                <i class="fas fa-file-pdf"></i>
            </a>`;

           
        // 4) Monta o HTML final
        return `
        <div class="displaybox-item">
            <div class="displaybox-header verbetopedia-header" style="text-align: left; padding-left: 0; color:rgba(20, 30, 100)">
                <span class="header-text">${titleHtml}</span>
            </div>
            <div class="displaybox-text">
                <span class="displaybox-text markdown-content">${safeHtml}</span>
                ${pdfLink}
            </div>
        </div>
        `;
    }).join('');



    // 5) Bloco final (único grupo — EC)
    const groupHtml = `
    <div class="displaybox-group">
        <div class="displaybox-header">
            <span style="color: blue; font-size: 16px; font-weight: bold;">Enciclopédia da Conscienciologia</span>
            <span class="score-badge" style="font-size: 12px">${arr.length} resultado${arr.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="displaybox-content">
            ${contentHtml}
        </div>
    </div>
    `;

    container.insertAdjacentHTML('beforeend', groupHtml);

    // Also render collapsible badge row + panel for Verbetopedia
    const _vb_count = arr.length;
    const _vb_html = `
      <div class="summary-list">
        <button class="pill pill-row accented" data-target="group-ec">
          <span class="pill-label">Enciclopédia da Conscienciologia</span>
          <span class="count">${_vb_count}</span>
        </button>
      </div>
      <div id="group-ec" class="collapse-panel">
        <div class="displaybox-container">
          <div class="displaybox-content group-content">
            ${contentHtml}
          </div>
        </div>
      </div>`;
    container.insertAdjacentHTML('beforeend', _vb_html);

    if (!container.__pillHandlerBound) {
      container.addEventListener('click', function(ev) {
          const btn = ev.target.closest('.pill');
          if (!btn) return;
          ev.preventDefault();
          const targetId = btn.getAttribute('data-target');
          if (!targetId) return;
          const safeId = `#${targetId.replace(/[^a-z0-9\-_:]/gi, '')}`;
          const panel = container.querySelector(safeId) || container.querySelector(`#${targetId}`);
          if (!panel) return;
          panel.classList.toggle('open');
          if (panel.classList.contains('open')) {
              try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
          }
      });
      container.__pillHandlerBound = true;
    }
}














// ________________________________________________________________________________________
// Show Conscienciogramopedia (simplificada — ordenação por score)
// ________________________________________________________________________________________

function showCcg(container, data) {
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

    // 1) Extrair metadados antes para usar score
    const items = arr.map(item => {
        const metaData = extractMetadata(item, 'ccg');
        return { ...item, _meta: metaData };
    });

    // 2) Ordenar por score decrescente
    items.sort((a, b) => {
        const sa = (typeof a._meta.score === 'number') ? a._meta.score : -Infinity;
        const sb = (typeof b._meta.score === 'number') ? b._meta.score : -Infinity;
        return sa- sb; // menor primeiro
    });

    
   
    // 3) Gera HTML de cada item
    const contentHtml = items.map(item => {
        // Conteúdo principal
        let content = (
            (typeof item.markdown === 'string' && item.markdown) ||
            (typeof item.page_content === 'string' && item.page_content) ||
            (typeof item.text === 'string' && item.text) ||
            ''
        );

        const rawHtml  = renderMarkdown(content);
        const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

        const metaData = item._meta;


        console.log(`********display.js - ccg*** [metaData]:`, metaData);

        const titleHtml = `
        <strong>${metaData.title}</strong>  ●  ${metaData.folha}  ●  #${metaData.number}
    `;

        const scoreHtml = (typeof metaData.score === 'number' && !Number.isNaN(metaData.score))
            ? `<span class="rag-badge">Score: ${metaData.score.toFixed(2)}</span>` : '';

           
        // 4) Monta o HTML final
        return `
        <div class="displaybox-item">
            <div class="displaybox-header verbetopedia-header" style="text-align: left; padding-left: 0; color:rgb(20, 30, 100)">
                <span class="header-text">${titleHtml}</span>
            </div>
            <div class="displaybox-text">
                <span class="displaybox-text markdown-content">${safeHtml}</span>
                ${(window.CONFIG ? !!window.CONFIG.FULL_BADGES : FULL_BADGES) ? `<span class="metadata-badge">${scoreHtml}</span>` : ''}
            </div>
        </div>
        `;
    }).join('');



    // 5) Bloco final (único grupo — EC)
    const groupHtml = `
    <div class="displaybox-group">
        <div class="displaybox-header">
            <span style="color: blue; font-size: 16px; font-weight: bold;">Conscienciograma</span>
            <span class="score-badge" style="font-size: 12px">${items.length} resultado${items.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="displaybox-content">
            ${contentHtml}
        </div>
    </div>
    `;

    container.insertAdjacentHTML('beforeend', groupHtml);

    // Also render collapsible badge row + panel for Verbetopedia
    const _vb_count = items.length;
    const _vb_html = `
      <div class="summary-list">
        <button class="pill pill-row accented" data-target="group-ec">
          <span class="pill-label">Conscienciograma</span>
          <span class="count">${_vb_count}</span>
        </button>
      </div>
      <div id="group-ec" class="collapse-panel">
        <div class="displaybox-container">
          <div class="displaybox-content group-content">
            ${contentHtml}
          </div>
        </div>
      </div>`;
    container.insertAdjacentHTML('beforeend', _vb_html);

    if (!container.__pillHandlerBound) {
      container.addEventListener('click', function(ev) {
          const btn = ev.target.closest('.pill');
          if (!btn) return;
          ev.preventDefault();
          const targetId = btn.getAttribute('data-target');
          if (!targetId) return;
          const safeId = `#${targetId.replace(/[^a-z0-9\-_:]/gi, '')}`;
          const panel = container.querySelector(safeId) || container.querySelector(`#${targetId}`);
          if (!panel) return;
          panel.classList.toggle('open');
          if (panel.classList.contains('open')) {
              try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
          }
      });
      container.__pillHandlerBound = true;
    }
}






// ________________________________________________________________________________________
// Show Quiz
// ________________________________________________________________________________________
function showQuiz(container, data) {
  if (!container) {
    console.error('Results container not found');
    return;
  }

  const pergunta = typeof data?.pergunta === 'string' ? data.pergunta : '';
  let opcoes = Array.isArray(data?.opcoes) ? data.opcoes.slice(0, 4) : [];
  while (opcoes.length < 4) opcoes.push('');

  // Build HTML for quiz box
  const optionsHtml = opcoes
    .map((opt, idx) => {
      const rendered = renderMarkdown(String(opt || `Opção ${idx + 1}`));
      return `
        <div class="quiz-option-row" data-index="${idx}" style="display:flex;align-items:center;gap:8px;margin:6px 0;">
          <button type="button" class="quiz-badge-btn" data-index="${idx}" style="border:none;background:transparent;cursor:pointer;">
            <span class="metadata-badge estilo2" style="display:inline-block;padding:4px 8px;border-radius:12px;min-width:28px;text-align:center;">${idx + 1}</span>
          </button>
          <div class="quiz-option-text markdown-content">${rendered}</div>
        </div>`;
    })
    .join('');

  const qHtml = pergunta ? `<div class="quiz-question markdown-content" style="font-weight:600;margin:6px 0 8px 0;">${renderMarkdown(pergunta)}</div>` : '';

  const html = `
    <div class="displaybox-container quiz-box">
      <div class="displaybox-content">
        <div class="displaybox-text">
          ${qHtml}
          <div class="quiz-options-list">
            ${optionsHtml}
          </div>
        </div>
      </div>
    </div>`;

  container.insertAdjacentHTML('beforeend', html);

  // Event delegation for option clicks (no custom event; logic handled in script_quiz.js)
  if (!container.__quizClickBound) {
    container.addEventListener('click', function(ev) {
      const btn = ev.target.closest('.quiz-badge-btn');
      const row = btn ? btn.closest('.quiz-option-row') : ev.target.closest('.quiz-option-row');
      if (!row) return;

      const box = row.closest('.quiz-box');
      if (!box) return;

      // Visual feedback: highlight selected badge using module color
      try {
        const badge = row.querySelector('.metadata-badge');
        if (badge) {
          badge.style.backgroundColor = '#10b981'; // Changed to green-500 color
          badge.style.color = '#fff';
        }
      } catch {}

      // Disable further interaction within this quiz box
      box.querySelectorAll('button.quiz-badge-btn').forEach(b => { b.disabled = true; b.style.cursor = 'default'; });
      // No emission here; script_quiz.js listens to clicks on #results
    });
    container.__quizClickBound = true;
  }
}



// Helper: build inline reference line like: [ Name: value; Name2: value2 ]
function buildMetaInlineLine(pairs) {
  try {
    const parts = (pairs || [])
      .filter(arr => Array.isArray(arr) && arr.length >= 2 && String(arr[1]).trim() !== '')
      .map(([k, v]) => {
        const key = String(k);
        const val = escapeHtml(String(v));
        //Se for o badge de title, coloca em negrito; se for o badge de score, coloca em italico; se for o badge de area, coloca em italico entre parênteses; se for o badge de number, coloca um caracter "#" antes do valor
        if (/^title$/i.test(key)) return `<strong>${val}</strong>`;
        if (/^score$/i.test(key)) return `<em>${val}</em>`;
        if (/^area$/i.test(key)) return `<em>(${val})</em>`;
        if (/^number$/i.test(key)) return `#${val}`;
        return `${escapeHtml(key)}: ${val}`;
      });
    if (!parts.length) return '';
    const content = `[ ${parts.join('; ')} ]`;
    return `<div class="meta-inline" style="font-size: 80%; color: var(--gray-600); margin-top: 4px;">${content}</div>`;
  } catch (e) {
    return '';
  }
}

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

