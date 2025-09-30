// display.js - Centralized result rendering functionality (modularized)
// __________________________________________________________________________________________
// DOMPurify
// __________________________________________________________________________________________
// Import or reference DOMPurify for XSS protection (assumed loaded globally)
const sanitizeHtml = window.DOMPurify?.sanitize || (html => html);

// Evita TDZ e permite popular depois que todas as funções showX forem definidas
var renderers = Object.create(null);


const FLAG_FULL_BADGES = Boolean(window.CONFIG?.FULL_BADGES);
const FLAG_HEADER = false;

// ===========================================================================
// showSortedData — com modo agrupado e "All" (sem agrupamento) + HIGHLIGHT
// ===========================================================================
function showSortedData(container, sortedData, query = '', flag_grouping = false) {

  if (!container) {
    console.error('Results container not found');
    return;
  }

  //container.innerHTML = '';

  
  console.log("showSortedData*** [query]:", query); 
  console.log("showSortedData*** [flag_grouping]:", flag_grouping); 
  console.log("showSortedData*** [sortedData]:", sortedData);
  console.log("showSortedData*** [FLAG_FULL_BADGES]:", FLAG_FULL_BADGES);
  
  
  
  if (!sortedData || typeof sortedData !== 'object' || Object.keys(sortedData).length === 0) {
    container.insertAdjacentHTML(
      'beforeend',
      '<div class="displaybox-container"><div class="displaybox-content">Nenhum resultado encontrado.</div></div>'
    );
    return;
  }

  // ⚡️ Define a query global para highlight (como showSearch)
  if (query && typeof query === 'string') {
    window.__lastSearchQuery = query;
  } else {
    window.__lastSearchQuery = window.__lastSearchQuery || '';
  }

  // ============================
  // 0️⃣ Normalizador de nomes de fonte
  // ============================
  const normSourceName = (typeof window !== 'undefined' && typeof window.normSourceName === 'function')
    ? window.normSourceName
    : function _fallbackNormSourceName(src) {
        if (!src) return 'Results';
        let s = String(src);
        s = s.split(/[\\/]/).pop();
        s = s.replace(/\.(md|markdown|txt|xlsx)$/i, '');
        return s;
      };

  // ============================
  // 1️⃣ Normaliza estrutura dos grupos
  // ============================
  const groups = {};
  const allItems = []; // ← para o modo All
  for (const key of Object.keys(sortedData)) {
    const normalized = normSourceName(key);
    const mappedItems = sortedData[key].map((item, idx) => ({
      ...item,
      number: item.paragraph_number ?? item.number ?? '',
      markdown: item.mk_text ?? item.markdown ?? item.text ?? '',
      content_text: item.raw_text ?? item.content_text ?? item.text ?? '',
      source: key,
      _origIndex: idx,
      _srcRaw: key,
      _src: normalized
    }));
    groups[normalized] = mappedItems;
    allItems.push(...mappedItems);
  }

  const groupNames = Object.keys(groups);
  const slug = (s) => String(s || 'all').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // ============================
  // 2️⃣ Summary pills retráteis
  // ============================
  let summaryRows = '<div class="summary-list">';

  // MODO GROUPING: Se flag_grouping for true, cria pills para cada grupo
  // --------------------------------------------------------------------
  if (flag_grouping) {
    groupNames.forEach((name, idx) => {
      const n = groups[name].length;
      const target = `group-${slug(name)}-${idx}`;
      summaryRows += `
        <button class="pill pill-row accented" data-target="${target}">
          <span class="pill-label">${escapeHtml(bookName(name))}</span>
          <span class="count">${n}</span>
        </button>`;
    });

  // MODO ALL: Se flag_grouping for false, cria pill para "All"
  // --------------------------------------------------------------------
  } else {
    const totalCount = allItems.length;
    summaryRows += `
      <button class="pill pill-row accented" data-target="all-results">
        <span class="pill-label">Total</span>
        <span class="count">${totalCount}</span>
      </button>`;
  }

  summaryRows += '</div>';

  // Insere os pills antes dos painéis
  container.insertAdjacentHTML('beforeend', summaryRows);


  // ============================
  // 3️⃣ Renderização dos painéis
  // ============================

  // MODO GROUPING: Se flag_grouping for true, cria painéis para cada grupo
  // --------------------------------------------------------------------
  if (flag_grouping) {
    groupNames.forEach((groupName, groupIndex) => {
      const groupItems = groups[groupName];
      let groupHtml = '';

      groupItems.forEach((item) => {
        const sourceName = item.source || item.file || item.book || 'Unknown';
        groupHtml += format_paragraphs_source(item, sourceName);
      });

      const panelId = `group-${slug(groupName)}-${groupIndex}`;
      const groupPanel = `
        <div id="${panelId}" class="collapse-panel">
          <div class="displaybox-container">
            <div class="displaybox-content group-content">
              ${groupHtml}
            </div>
          </div>
        </div>`;
      container.insertAdjacentHTML('beforeend', groupPanel);
    });


    // MODO ALL: Se flag_grouping for false, cria painéis para todos os itens
    // --------------------------------------------------------------------
  } else {
    
    let allHtml = '';
    const sortedAllItems = [...allItems].sort((a, b) => {
      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;
      return scoreA - scoreB;
    });

    sortedAllItems.forEach((item) => {
      const sourceName = item.source || item.file || item.book || 'Unknown';
      allHtml += format_paragraphs_source(item, sourceName, query);
    });
    
    const allPanel = `
    <div id="all-results" class="collapse-panel">
      <div class="displaybox-container">
        <div class="displaybox-content group-content">
          ${allHtml}
        </div>
      </div>
    </div>`;
    container.insertAdjacentHTML('beforeend', allPanel);

    


  }

  // ============================
  // 4️⃣ Toggle dos pills
  // ============================
  if (!container.__pillHandlerBound) {
    container.addEventListener('click', function(ev) {
      const btn = ev.target.closest('.pill');
      if (!btn) return;
      ev.preventDefault();
      const targetId = btn.getAttribute('data-target');
      if (!targetId) return;
      const panel = container.querySelector(`#${CSS.escape(targetId)}`);
      if (!panel) return;
      const isOpen = panel.classList.toggle('open');
      if (isOpen) {
        btn.classList.add('active');
        try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
      } else {
        btn.classList.remove('active');
      }
    });
    container.__pillHandlerBound = true;
  }
}








// ===========================================================================
// format_paragraphs_source  (os formatters internos chamam highlightHtml)
// ===========================================================================
const format_paragraphs_source = (item, sourceName, query) => {
  if (sourceName === 'LO') return format_paragraph_LO(item, query);
  if (sourceName === 'DAC') return format_paragraph_DAC(item, query);
  if (sourceName === 'CCG') return format_paragraph_CCG(item, query);
  if (sourceName === 'EC')  return format_paragraph_EC(item, query);
  return format_paragraph_Default(item, query);
};




// ===========================================================================
// LO: Content_Text  Markdown_Text Title  Number  Score   (+ HIGHLIGHT)
// ===========================================================================
const format_paragraph_LO = (item, query) => {

    const title = item.title || '';
    const paragraph_number = item.number || '';
    const score = item.score || 0.00;
    const text = item.markdown || item.content_text || item.text || '';
    let source = item.source || '';
    source = bookName(source);


    // Caso especial 'LO': coloca **title.** em negrito antes da pensata.
    const textCompleted = (title) ? `**${title}.** ${text}` : text;

    // Texto do parágrafo + highlight
    const rawHtml = renderMarkdown(textCompleted);
    const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);
    const q = window.__lastSearchQuery || '';
    const highlighted = highlightHtml(safeHtml, q);


    // Monta os badges
    // -------------------------------------------------------------------------------------------------------------------------
    let badgeParts = [];
    if (source) badgeParts.push(`<span class="metadata-badge estilo1"><strong>${escapeHtml(source)}</strong></span>`);
    if (title)  badgeParts.push(`<span class="metadata-badge estilo2"><strong>${escapeHtml(title)}</strong></span>`);

    if (FLAG_FULL_BADGES) {
      if (paragraph_number) badgeParts.push(`<span class="metadata-badge estilo2"> #${escapeHtml(paragraph_number)}</span>`);
      if (score > 0.0)      badgeParts.push(`<span class="metadata-badge estilo2"> @${escapeHtml(score)}</span>`);
    }

    if (score == 0.0) badgeParts.push(`<span class="metadata-badge estilo3">Exata</span>`)
    else badgeParts.push(`<span class="metadata-badge estilo4">Contextual</span>`);

    const metaBadges = badgeParts.join('');

    // ------------------------------------------------------------------------------------------------------------------------- 

    const finalHtml = `<div class="displaybox-item"><div class="displaybox-text markdown-content">${highlighted}</div>${metaBadges}</div>`;

    return finalHtml;
};


// ===========================================================================
// DAC: Content_Text  Markdown  Title  Number  Source  Argumento  Section  (+ HIGHLIGHT)
// ===========================================================================
const format_paragraph_DAC = (item, query) => {

    const title = item.title || '';
    const score = item.score || 0.00;
    const paragraph_number = item.number || '';
    const text = item.markdown || item.content_text || item.text || '';
    const argumento = item.argumento || item.argument || '';
    const section = item.section || '';
    let source = item.source || '';
    source = bookName(source);

    // Texto do parágrafo + highlight
    const textCompleted = text;
    const rawHtml = renderMarkdown(textCompleted);
    const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);
    const q = window.__lastSearchQuery || '';
    const highlighted = highlightHtml(safeHtml, q);


    // Monta os badges
    // -------------------------------------------------------------------------------------------------------------------------
    let badgeParts = [];
    if (source)   badgeParts.push(`<span class="metadata-badge estilo1"><strong>${escapeHtml(source)}</strong></span>`);
    if (title)    badgeParts.push(`<span class="metadata-badge estilo2"><strong>${escapeHtml(title)}</strong></span>`);
    if (argumento)badgeParts.push(`<span class="metadata-badge estilo2">${escapeHtml(argumento)}</span>`);
    if (section)  badgeParts.push(`<span class="metadata-badge estilo2"><em>${escapeHtml(section)}</em></span>`);
      
    if (FLAG_FULL_BADGES) {
      if (paragraph_number) badgeParts.push(`<span class="metadata-badge estilo2"> #${escapeHtml(paragraph_number)}</span>`);
      if (score > 0.0)      badgeParts.push(`<span class="metadata-badge estilo2"> @${escapeHtml(score)}</span>`);
    }
   
    if (score == 0.0) badgeParts.push(`<span class="metadata-badge estilo3">Exata</span>`)
      else badgeParts.push(`<span class="metadata-badge estilo4">Contextual</span>`);

    metaBadges = badgeParts.join('');

    // ------------------------------------------------------------------------------------------------------------------------


    const finalHtml = `<div class="displaybox-item"><div class="displaybox-text markdown-content">${highlighted}</div>${metaBadges}</div>`;

    return finalHtml;
};
    


// ===========================================================================
// CCG: Content_Text  Markdown_Text  Title  Number  Source  Folha  (+ HIGHLIGHT)
// ===========================================================================
const format_paragraph_CCG = (item, query) => {

  const title = item.title || '';
  const score = item.score || 0.00;
  const text = item.markdown || item.content?.text || item.text || '';
  const folha = item.folha || '';
  const number = item.number || '';

  let source = item.source || 'CCG';
  source = bookName(source);

  // Texto do parágrafo + highlight
  const textCompleted = text;
  const rawHtml = renderMarkdown(textCompleted);
  const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);
  const q = window.__lastSearchQuery || '';
  const highlighted = highlightHtml(safeHtml, q);


  // Cabeçalho do item
  const titleHtml = `<strong>${escapeHtml(title)}</strong>  ●  ${escapeHtml(folha)}  ●  #${escapeHtml(number)}`;

  // Monta o panel
  let panelHtml = `
    <div class="displaybox-item">
      <div class="displaybox-header verbetopedia-header" style="text-align: left; padding-left: 0; color: rgba(20, 30, 100);">
        <span class="header-text">${titleHtml}</span>
      </div>
      <div class="displaybox-text">
        <span class="displaybox-text markdown-content">${safeHtml}</span>
      </div>
    </div>
  `;


  // Monta os badges
  // -------------------------------------------------------------------------------------------------------------------------
  let badgeParts = [];

  if (source) badgeParts.push(`<span class="metadata-badge estilo1"><strong>${escapeHtml(source)}</strong></span>`);

   if (FLAG_HEADER) {
    if (title)           badgeParts.push(`<span class="metadata-badge estilo2"><strong>${escapeHtml(title)}</strong></span>`);
    if (folha)           badgeParts.push(`<span class="metadata-badge estilo2">(${escapeHtml(folha)})</span>`);
    if (number)          badgeParts.push(`<span class="metadata-badge estilo2"> #${escapeHtml(number)}</span>`);

    if (FLAG_FULL_BADGES) {
      if (score > 0.0)     badgeParts.push(`<span class="metadata-badge estilo2"> @${escapeHtml(score)}</span>`);
    }
  }

  if (score == 0.0) badgeParts.push(`<span class="metadata-badge estilo3">Exata</span>`)
    else badgeParts.push(`<span class="metadata-badge estilo4">Contextual</span>`);
 
  const metaBadges = badgeParts.join('');

  // -------------------------------------------------------------------------------------------------------------------------

  // Monta o pane
  const finalHtml = `
    <div class="displaybox-item">
     <div class="displaybox-header verbetopedia-header" style="text-align: left; padding-left: 0; color:rgba(20, 30, 100);">
        <span class="header-text">${titleHtml}</span>
      </div>
      <div class="displaybox-text">
        <span class="displaybox-text markdown-content">${highlighted}</span>
        ${metaBadges}
      </div>
    </div>
  `;
  return finalHtml;

};


  
// ===========================================================================
// EC: Content_Text  Markdown_Text  Title  Number  Source ... (+ HIGHLIGHT)
// ===========================================================================
const format_paragraph_EC = (item, query) => {

  const title = item.title || '';
  const verbete_number = item.number || '';
  const score = item.score || 0.00;
  const text = item.markdown || item.content?.text || item.text || '';
  const area = item.area || '';
  const theme = item.theme || '';
  const author = item.author || '';
  const sigla = item.sigla || '';
  const date = item.date || '';
  const link = item.link || '';
  let source = item.source || '';
  source = bookName(source);

  
  const defText = '**Definologia.** ' + text;

  // Texto do parágrafo + highlight
  // Caso especial EC
  const textCompleted = '**Definologia.** ' + text;  
  const rawHtml = renderMarkdown(textCompleted);
  const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);
  const q = window.__lastSearchQuery || '';
  const highlighted = highlightHtml(safeHtml, q);


  // Monta header do paragrafo: EC

  const FLAG_HEADER = true;
  let titleHtml = '';
  let scoreHtml = '';
  if (FLAG_HEADER) {
    titleHtml = `<strong>${title}</strong> (${area})  ●  <em>${author}</em>  ●  #${verbete_number}  ●  ${date}`;
    scoreHtml = (typeof score === 'number' && !Number.isNaN(score))
        ? `<span class="rag-badge">Score: ${score.toFixed(2)}</span>` : '';
  }
    
  // Monta os badges
  // -------------------------------------------------------------------------------------------------------------------------
  let badgeParts = [];

  if (source) badgeParts.push(`<span class="metadata-badge estilo1"><strong>${escapeHtml(source)}</strong></span>`);

  if (FLAG_HEADER) {
    if (title)            badgeParts.push(`<span class="metadata-badge estilo2"><strong>${escapeHtml(title)}</strong></span>`);
    if (area)             badgeParts.push(`<span class="metadata-badge estilo2"><em>${escapeHtml(area)}</em></span>`);
    if (verbete_number)   badgeParts.push(`<span class="metadata-badge estilo2"> #${escapeHtml(verbete_number)}</span>`);
    if (theme)            badgeParts.push(`<span class="metadata-badge estilo2"> ${escapeHtml(theme)}</span>`);
    if (author)           badgeParts.push(`<span class="metadata-badge estilo2"> ${escapeHtml(author)}</span>`);
    if (date)             badgeParts.push(`<span class="metadata-badge estilo2"> ${escapeHtml(date)}</span>`);

    if (FLAG_FULL_BADGES) {
      if (score > 0.0)      badgeParts.push(`<span class="metadata-badge estilo2"> @${escapeHtml(score)}</span>`);
    }
  }
  
  if (score == 0.0) badgeParts.push(`<span class="metadata-badge estilo3">Exata</span>`)
    else badgeParts.push(`<span class="metadata-badge estilo4">Contextual</span>`);

  const metaBadges = badgeParts.join('');
  // -------------------------------------------------------------------------------------------------------------------------

  // Monta o link PDF  
  const arquivo = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ç/g, "c").replace(/Ç/g, "C");
  const verbLink = VERBETES_URL + encodeURIComponent(arquivo) + ".pdf";
  const pdfLink = `
    <a href="${verbLink}" target="_blank" rel="noopener noreferrer"
        title="Abrir PDF em nova aba" style="margin-left: 8px; color: red; font-size: 1.1em;">
        <i class="fas fa-file-pdf"></i>
    </a>`;
  

  // Monta o pane
  const finalHtml = `
    <div class="displaybox-item">
      <div class="displaybox-header verbetopedia-header" style="text-align: left; padding-left: 0; color:rgba(20, 30, 100);">
        <span class="header-text">${titleHtml}</span>
      </div>
      <div class="displaybox-text">
        <span class="displaybox-text markdown-content">${highlighted}</span>
        ${metaBadges}
        ${pdfLink}
      </div>
    </div>
  `;

  return finalHtml;
};




// ===========================================================================
// Default: Content_Text  Markdown_Text Title  Number  Score  (+ HIGHLIGHT)
// ===========================================================================
const format_paragraph_Default = (item, query) => {


  const title = item.title || '';
  const paragraph_number = item.number || '';
  const score = item.score || 0.00;
  const text = item.markdown || item.content_text || item.text || '';
  let source = item.source || '';
  source = bookName(source);


  // Caso especial 'LO': coloca **title.** em negrito antes da pensata.
  const textCompleted = (title) ? `**${title}.** ${text}` : text;

  // Texto do parágrafo + highlight
  const rawHtml = renderMarkdown(textCompleted);
  const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);
  const q = window.__lastSearchQuery || '';
  const highlighted = highlightHtml(safeHtml, q);


  // Monta os badges
  // -------------------------------------------------------------------------------------------------------------------------
  let badgeParts = [];
  if (source) badgeParts.push(`<span class="metadata-badge estilo1"><strong>${escapeHtml(source)}</strong></span>`);
  if (title)  badgeParts.push(`<span class="metadata-badge estilo2"><strong>${escapeHtml(title)}</strong></span>`);

  if (FLAG_FULL_BADGES) {
    if (paragraph_number) badgeParts.push(`<span class="metadata-badge estilo2"> #${escapeHtml(paragraph_number)}</span>`);
    if (score > 0.0)      badgeParts.push(`<span class="metadata-badge estilo2"> @${escapeHtml(score)}</span>`);
  }

  if (score == 0.0) badgeParts.push(`<span class="metadata-badge estilo3">Exata</span>`)
  else badgeParts.push(`<span class="metadata-badge estilo4">Contextual</span>`);

  const metaBadges = badgeParts.join('');

  // ------------------------------------------------------------------------------------------------------------------------- 

  const finalHtml = `<div class="displaybox-item"><div class="displaybox-text markdown-content">${highlighted}</div>${metaBadges}</div>`;

  return finalHtml;

};



// ________________________________________________________________________________________
// Show Title
// ________________________________________________________________________________________
function showTitle(container, text) {
  const cleanText = renderMarkdown(text);
  const html = `
  <div style="
      border: 1px solid var(--gray-200);
      background-color: rgba(255, 255, 255, 0.73);
      padding: 10px 12px;
      border-radius: 8px;
      margin: 8px 0 14px 0;
  ">
      <div style="font-weight: bold; color: rgb(65, 67, 179);">
         ${cleanText}
      </div>
  </div>`;
  container.insertAdjacentHTML('beforeend', html);
}


// ________________________________________________________________________________________
// Show Simple
// ________________________________________________________________________________________
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
    </div>`;
    container.insertAdjacentHTML('beforeend', html);
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





// ========================================================================================
//                                  RAGBOT FUNCTIONS
// ========================================================================================

// ________________________________________________________________________________________
// showBotMetainfo
// ________________________________________________________________________________________
function showBotMetainfo(container, metaData) {

 
  if (!container) return;

  // Extrair metadados relevantes
  const md = extractMetadata(metaData, 'ragbot');

  const citations = (md?.citations || metaData?.citations || '').toString();
  const totalTokens = md?.total_tokens_used ?? metaData?.total_tokens_used;
  const model = md?.model ?? metaData?.model;
  const temperature = md?.temperature ?? metaData?.temperature;


  const badgeParts = [];
  if (model) {
    badgeParts.push(`<span class="metadata-badge estilo1">${escapeHtml(model)}</span>`);
  }
  if (temperature !== undefined) {
    badgeParts.push(`<span class="metadata-badge estilo3">Temp: ${escapeHtml(temperature)}</span>`);
  }
  if (totalTokens !== undefined) {
    badgeParts.push(`<span class="metadata-badge estilo4">Tokens: ${escapeHtml(totalTokens)}</span>`);
  }
  if (citations.length > 2) {
    // retira texto de citations após o ":" e elimina o primeiro caracter " "
    citations_book = citations.split(':')[0].trim();
    badgeParts.push(`<span class="metadata-badge estilo2">Refs: ${escapeHtml(citations_book)}</span>`);
  }

  // Remove badges anteriores
  const oldMeta = container.querySelector('.metadata-container');
  if (oldMeta) oldMeta.remove();

  // Adiciona um espaço em branco antes das badges
  container.insertAdjacentHTML('beforeend', '<br>');

  const metaHtml = `<div class="metadata-container">${badgeParts.join('')}</div>`;
  container.insertAdjacentHTML('beforeend', metaHtml);
}




// ______________________________________________________________________________________________
// Loading helpers (restaurados)
// ______________________________________________________________________________________________
function insertLoading(container, message = 'Carregando…') {
  if (!container) return;
  // evita múltiplos spinners no mesmo container
  if (container.querySelector('.loading-container')) return;

  container.insertAdjacentHTML('beforeend', `
    <div class="loading-container" style="display:flex;align-items:center;gap:8px;margin:8px 0;">
      <div class="loading" aria-live="polite" aria-busy="true">
        ${escapeHtml(String(message))}
      </div>

    </div>
  `);
}

function removeLoading(container) {
  if (!container) return;
  const loadingContainer = container.querySelector('.loading-container');
  if (loadingContainer) loadingContainer.remove();
}

// Collapse all open result panels and reset pill state when needed
function collapseAllPills() {
  document.querySelectorAll('.collapse-panel.open').forEach(panel => panel.classList.remove('open'));
  document.querySelectorAll('.pill.active').forEach(pill => pill.classList.remove('active'));
}

window.collapseAllPills = collapseAllPills;



// ________________________________ Ref badges helper (restaurada) ________________________________
// Decide se as “badges” de referência devem aparecer.
// Prioridade: window.SHOW_REF_BADGES → CONFIG.FULL_BADGES → FULL_BADGES global → default true.
function shouldShowRefBadges() {
  try {
    if (typeof window !== 'undefined') {
      // 1) Flag direta
      if (typeof window.SHOW_REF_BADGES === 'boolean') {
        return window.SHOW_REF_BADGES;
      }
      // 2) Configuração global
      if (window.CONFIG && typeof window.CONFIG.FULL_BADGES === 'boolean') {
        return window.CONFIG.FULL_BADGES;
      }
    }
  } catch (e) { /* no-op */ }

  // 3) Variável global solta (se existir)
  try {
    // eslint-disable-next-line no-undef
    if (typeof FULL_BADGES !== 'undefined') {
      // eslint-disable-next-line no-undef
      return !!FULL_BADGES;
    }
  } catch (e) { /* no-op */ }

  // 4) Padrão: mostra
  return true;
}


// Helper: build inline reference line like: [ Name: value; Name2: value2 ]
function buildMetaInlineLine(pairs) {
  try {
    const parts = (pairs || [])
      .filter(arr => Array.isArray(arr) && arr.length >= 2 && String(arr[1]).trim() !== '')
      .map(([k, v]) => {
        const key = String(k);
        const val = escapeHtml(String(v));
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





// ============================== HIGHLIGHT UTILITIES =========================================
// Pinta de amarelo (accent-insensitive) os termos/expressões da consulta no HTML já sanitizado.
// --------------------------------------------------------------------------------------------

// Normaliza para busca (lower + sem acentos)
function _stripAccents(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function _norm(s) { return _stripAccents(String(s || '')).toLowerCase(); }

// Constrói mapa de dobra (fold) para mapear índices do texto "sem acento" para o original
function _buildFoldMap(original) {
  const map = [];         // map[iFold] = iOriginal
  let folded = '';
  for (let i = 0; i < original.length; i++) {
    const ch = original[i];
    const base = _stripAccents(ch); // remove diacríticos do ponto atual
    // Se base tiver múltiplos chars (raro), mapeia todos
    for (let k = 0; k < base.length; k++) {
      folded += base[k];
      map.push(i);
    }
    // Combining marks são descartados naturalmente
  }
  return { folded, map };
}

// Tokeniza a query de forma leve (suporta "frases", ! & | ())
function _tokenizeQuery(q) {
  const tokens = [];
  let i = 0, n = q.length;
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if ('()&|!'.includes(c)) { tokens.push(c); i++; continue; }
    if (c === '"') {
      let j = i + 1, buf = [];
      while (j < n && q[j] !== '"') { buf.push(q[j++]); }
      tokens.push('"' + buf.join('') + '"');
      i = (j < n && q[j] === '"') ? j + 1 : j;
      continue;
    }
    let j = i;
    while (j < n && !'()&|!"'.includes(q[j]) && !/\s/.test(q[j])) j++;
    tokens.push(q.slice(i, j));
    i = j;
  }
  return tokens.filter(Boolean);
}

// Extrai literais POSITIVOS para destacar (ignora negados com ! e operadores)
function _extractHighlightLiterals(query) {
  const tokens = _tokenizeQuery(String(query || ''));
  const lits = [];
  let negateNext = false;
  for (const t of tokens) {
    if (t === '!') { negateNext = true; continue; }
    if (t === '&' || t === '|' || t === '(' || t === ')') { negateNext = false; continue; }
    // t = termo ou "frase"
    if (negateNext) { negateNext = false; continue; } // não destacar NOT
    const isPhrase = t.length >= 2 && t[0] === '"' && t[t.length-1] === '"';
    const core = isPhrase ? t.slice(1, -1) : t;
    if (!core) continue;
    lits.push({ raw: t, phrase: isPhrase, core });
    negateNext = false;
  }
  // ordenar por tamanho desc para evitar wrap parcial (c*a antes de 'a', etc.)
  return lits.sort((a,b) => b.core.length - a.core.length);
}

// Constrói regex sobre TEXTO NORMALIZADO (folded), preservando ideia de wildcards e palavras
function _buildRegexForLiteral(lit) {
  const core = _norm(lit.core);
  if (lit.phrase) {
    // frase: substring literal (sem \b e sem curingas)
    return new RegExp(_escapeRegex(core), 'gi');
  }
  if (core.includes('*')) {
    // wildcard: '*' -> '.*'
    const pattern = _escapeRegex(core).replace(/\\\*/g, '.*');
    return new RegExp(pattern, 'gi');
  }
  // termo simples: palavra inteira (\b ... \b)
  return new RegExp(`\\b${_escapeRegex(core)}\\b`, 'gi');
}

function _escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Dado um HTML já sanitizado, colore os termos apenas em TEXT NODES (sem tocar em tags)
function highlightHtml(safeHtml, query) {
  if (!safeHtml || !query) return safeHtml;

  const literals = _extractHighlightLiterals(query);
  if (!literals.length) return safeHtml;

  const patterns = literals.map(_buildRegexForLiteral);

  // divide em blocos "texto" e "tags", para não invadir atributos e nomes de tag
  const parts = String(safeHtml).split(/(<[^>]+>)/g);

  for (let i = 0; i < parts.length; i++) {
    const chunk = parts[i];
    if (!chunk || chunk.startsWith('<')) continue; // é tag, não texto

    // mapeamento folded->original para acentuação
    const { folded, map } = _buildFoldMap(chunk);
    const foldedLower = folded.toLowerCase();

    // coletar ranges de matches (em índices do ORIGINAL)
    const ranges = [];
    patterns.forEach(re => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(foldedLower)) !== null) {
        const startFold = m.index;
        const endFold = m.index + (m[0]?.length || 0);
        if (endFold <= startFold) continue;
        const startOrig = map[startFold];
        const endOrig = (endFold - 1 < map.length) ? map[endFold - 1] + 1 : chunk.length;
        ranges.push([startOrig, endOrig]);
        // proteção: se regex puder casar vazio, evita loop infinito
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    });

    if (!ranges.length) continue;

    // mesclar sobreposições
    ranges.sort((a,b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];
    let [cs, ce] = ranges[0];
    for (let k = 1; k < ranges.length; k++) {
      const [s, e] = ranges[k];
      if (s <= ce) {
        ce = Math.max(ce, e);
      } else {
        merged.push([cs, ce]);
        [cs, ce] = [s, e];
      }
    }
    merged.push([cs, ce]);

    // reconstrói com marcação
    let out = '';
    let last = 0;
    for (const [s, e] of merged) {
      out += chunk.slice(last, s);
      out += `<mark class="hl">${chunk.slice(s, e)}</mark>`;
      last = e;
    }
    out += chunk.slice(last);

    parts[i] = out;
  }

  return parts.join('');
}

// ============================================================================================
// Pequeno CSS opcional (se quiser personalizar o amarelo do <mark> padrão do navegador)
// Coloque no seu CSS global:
// .hl { background: #fff59d; padding: 0 1px; border-radius: 2px; }
// ============================================================================================

// ============================== AUX: extrair search term do payload =========================
function getSearchQuery(data) {
  // 1) candidatos em ordem de prioridade
  const candidates = [
    data?.term,
    data?.search_term
  ].filter(v => typeof v === 'string' && v.trim() !== '');

  if (!candidates.length) {
    console.log('||| Display.js|||  getSearchQuery final term: (vazio)');
    return '';
  }

  // 2) pega o primeiro candidato não vazio
  let chosen = String(candidates[0]);

  // 3) se houver "prefixo:valor", extrai o prefixo apenas (parte antes do ':')
  const colonIdx = chosen.indexOf(':');
  if (colonIdx >= 0) {
    chosen = chosen.slice(0, colonIdx);
  }

  // 4) normalizações leves
  let term = chosen
    .trim()
    .replace(/^"(.*)"$/, '$1')   // remove aspas externas
    .replace(/\s+/g, ' ');       // colapsa espaços múltiplos

  // 5) normalização para highlight: minúsculas e sem acentos
  term = term
    .toLowerCase()
    .normalize('NFD')                // separa base + diacríticos
    .replace(/[\u0300-\u036f]/g, ''); // remove os diacríticos

  console.log('||| Display.js|||  getSearchQuery final term:', term);
  return term;
}







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



