// display.js - Centralized result rendering functionality (modularized)

// __________________________________________________________________________________________
// DOMPurify
// __________________________________________________________________________________________
// Import or reference DOMPurify for XSS protection (assumed loaded globally)
const sanitizeHtml = window.DOMPurify?.sanitize || (html => html);

// Evita TDZ e permite popular depois que todas as funções showX forem definidas
var renderers = Object.create(null);


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





// Collapse all open result panels and reset pill state when needed
function collapseAllPills() {
    document.querySelectorAll('.collapse-panel.open').forEach(panel => panel.classList.remove('open'));
    document.querySelectorAll('.pill.active').forEach(pill => pill.classList.remove('active'));
}

window.collapseAllPills = collapseAllPills;


// ===========================================================================
// showDeepdive (corrigido com IDs únicos)  + HIGHLIGHT
// ===========================================================================
function showDeepdive(container, data) {

  if (!container) {
      console.error('Results container not found');
      return;
  }

  // Guarda query atual (global leve para uso nos formatters)
  window.__lastSearchQuery = getSearchQuery(data);

  // 0) Garantir array de entrada
  const arr = Array.isArray(data.results) ? data.results : [];
  if (!arr.length) {
      container.insertAdjacentHTML(
          'beforeend',
          '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
      );
      return;
  }

  // 1) Normalizador de fonte/livro para exibição
  const normSourceName = (typeof window !== 'undefined' && typeof window.normSourceName === 'function')
      ? window.normSourceName
      : function _fallbackNormSourceName(src) {
          if (!src) return 'Results';
          let s = String(src);
          s = s.split(/[\\/]/).pop();
          s = s.replace(/\.(md|markdown|txt|xlsx)$/i, '');
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

  // 3) Summary badges (rows)
  const slug = (s) => String(s || 'all')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  let summaryRows = '<div class="summary-list-deepdive">';
  summaryRows += groupNames.map((name, idx) => {
    const n = groups[name].length;
    const target = `group-${slug(name)}-${idx}`;
    return `
      <div class="pill-row-deepdive" data-target="${target}">
        <span class="pill-label-deepdive">${escapeHtml(bookName(name))}</span>
        <span class="pill-count-deepdive">${n}</span>
      </div>`;
  }).join('');
  summaryRows += '</div>';
  container.insertAdjacentHTML('beforeend', summaryRows);
}



// ===========================================================================
// showSearch (corrigido com IDs únicos) + HIGHLIGHT
// ===========================================================================
function showSearch(container, data) {

  if (!container) {
      console.error('Results container not found');
      return;
  }

  // Guarda query atual para os formatters usarem
  window.__lastSearchQuery = getSearchQuery(data);

  // 0) Garantir array de entrada
  const arr = Array.isArray(data.results) ? data.results : [];
  if (!arr.length) {
      container.insertAdjacentHTML(
          'beforeend',
          '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
      );
      return;
  }

  // 1) Normalizador de fonte/livro para exibição
  const normSourceName = (typeof window !== 'undefined' && typeof window.normSourceName === 'function')
      ? window.normSourceName
      : function _fallbackNormSourceName(src) {
          if (!src) return 'Results';
          let s = String(src);
          s = s.split(/[\\/]/).pop();
          s = s.replace(/\.(md|markdown|txt|xlsx)$/i, '');
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

  // 3) Summary badges (rows)
  const totalCount = arr.length;
  const slug = (s) => String(s || 'all')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  const flag_grouping = document.getElementById('groupResults')?.checked ?? true;

  let summaryRows = '<div class="summary-list">';
  if (flag_grouping) {
      summaryRows += groupNames.map((name, idx) => {
          const n = groups[name].length;
          const target = `group-${slug(name)}-${idx}`; // ID único com índice
          return `<button class="pill pill-row accented" data-target="${target}">
                    <span class="pill-label">${escapeHtml(bookName(name))}</span>
                    <span class="count">${n}</span>
                  </button>`;
      }).join('');
  } else {
      summaryRows += `<button class="pill pill-row accented" data-target="all-results">
                        <span class="pill-label">Total</span>
                        <span class="count">${totalCount}</span>
                      </button>`;
  }
  summaryRows += '</div>';
  container.insertAdjacentHTML('beforeend', summaryRows);

  // 4) Renderização dos painéis
  if (flag_grouping) {
      groupNames.forEach((groupName, groupIndex) => {
          const groupItems = groups[groupName];
          let groupHtml = '';

          groupItems.forEach((item) => {
              const sourceName = item.source || item.file || item.book || 'Unknown';
              groupHtml += format_paragraphs_source(item, sourceName); // aplica highlight dentro
          });

          const panelId = `group-${slug(groupName)}-${groupIndex}`;
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
      const sortedItems = [...arr].sort((b, a) => (b.score || 0) - (a.score || 0));
      let groupHtml = '';
      sortedItems.forEach((item) => {
          const sourceName = item.source || item.file || item.book || 'Unknown';
          groupHtml += format_paragraphs_source(item, sourceName);
      });

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
  }

  // 5) Event delegation para toggle dos pills
  if (!container.__pillHandlerBound) {
    container.addEventListener('click', function(ev) {
        const btn = ev.target.closest('.pill');
        if (!btn) return;
        ev.preventDefault();
        const targetId = btn.getAttribute('data-target');
        if (!targetId) return;
        const safeId = `#${targetId.replace(/[^a-z0-9\\-_:]/gi, '')}`;
        const panel = container.querySelector(safeId) || container.querySelector(`#${targetId}`);
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
const format_paragraphs_source = (item, sourceName) => {
  if (sourceName === 'LO') return format_paragraph_LO(item);
  if (sourceName === 'DAC') return format_paragraph_DAC(item);
  if (sourceName === 'CCG') return format_paragraph_CCG(item);
  if (sourceName === 'EC' || sourceName === 'ECALL_DEF' || sourceName === 'ECWV' || sourceName === 'ECALL') {
    return format_paragraph_EC(item);
  }
  return format_paragraph_Default(item);
};


// ===========================================================================
// LO: Content_Text  Markdown_Text Title  Number  Score   (+ HIGHLIGHT)
// ===========================================================================
const format_paragraph_LO = (item) => {
    const title = item.title || '';
    const paragraph_number = item.number || '';
    const score = item.score || 0.00;
    const text = item.markdown || item.content_text || item.text || '';
    let source = item.source || '';
    source = bookName(source);

    const badgeParts = [];
    if (source) badgeParts.push(`<span class="metadata-badge estilo1"><strong>${escapeHtml(source)}</strong></span>`);
    if (title)  badgeParts.push(`<span class="metadata-badge estilo2"><strong>${escapeHtml(title)}</strong></span>`);
    if (window.CONFIG ? !!window.CONFIG.FULL_BADGES : FULL_BADGES) {
      if (paragraph_number) badgeParts.push(`<span class="metadata-badge estilo2"> #${escapeHtml(paragraph_number)}</span>`);
      if (score > 0.0)      badgeParts.push(`<span class="metadata-badge estilo2"> @${escapeHtml(score)}</span>`);
    }
    metaBadges = badgeParts.join('');

    const textCompleted = (score > 0.0) ? `**${title}**. ${text}` : text;

    const rawHtml = renderMarkdown(textCompleted);
    const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

    // >>> HIGHLIGHT <<<
    const q = window.__lastSearchQuery || '';
    const highlighted = highlightHtml(safeHtml, q);

    const showBadges = shouldShowRefBadges();
    const metaInline = buildMetaInlineLine([
        ['Source', source],
        ['Title', title],
        ['Number', paragraph_number],
        ...(score > 0.0 ? [['Score', score]] : []),
    ]);

    const finalHtml = showBadges
      ? `<div class="displaybox-item"><div class="displaybox-text markdown-content">${highlighted}</div>${metaBadges}</div>`
      : `<div class="displaybox-item"><div class="displaybox-text markdown-content">${highlighted}${metaInline}</div></div>`;

    return finalHtml;
};


// ===========================================================================
// DAC: Content_Text  Markdown  Title  Number  Source  Argumento  Section  (+ HIGHLIGHT)
// ===========================================================================
const format_paragraph_DAC = (item) => {
    const title = item.title || '';
    const score = item.score || 0.00;
    const paragraph_number = item.number || '';
    const text = item.markdown || item.content_text || item.text || '';
    const argumento = item.argumento || '';
    const section = item.section || '';
    let source = item.source || '';
    source = bookName(source);

    const badgeParts = [];
    if (source)   badgeParts.push(`<span class="metadata-badge estilo1"><strong>${escapeHtml(source)}</strong></span>`);
    if (title)    badgeParts.push(`<span class="metadata-badge estilo2"><strong>${escapeHtml(title)}</strong></span>`);
    if (argumento)badgeParts.push(`<span class="metadata-badge estilo2">${escapeHtml(argumento)}</span>`);
    if (section)  badgeParts.push(`<span class="metadata-badge estilo2"><em>${escapeHtml(section)}</em></span>`);
    if (window.CONFIG ? !!window.CONFIG.FULL_BADGES : FULL_BADGES) {
      if (paragraph_number) badgeParts.push(`<span class="metadata-badge estilo2"> #${escapeHtml(paragraph_number)}</span>`);
      if (score > 0.0)      badgeParts.push(`<span class="metadata-badge estilo2"> @${escapeHtml(score)}</span>`);
    }
    metaBadges = badgeParts.join('');

    const rawHtml = renderMarkdown(text);
    const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

    // >>> HIGHLIGHT <<<
    const highlighted = highlightHtml(safeHtml, window.__lastSearchQuery || '');

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
      ? `<div class="displaybox-item"><div class="displaybox-text markdown-content">${highlighted}</div>${metaBadges}</div>`
      : `<div class="displaybox-item"><div class="displaybox-text markdown-content">${highlighted}${metaInline}</div></div>`;

    return finalHtml;
};
    
    
// ===========================================================================
// CCG: Content_Text  Markdown_Text  Title  Number  Source  Folha  (+ HIGHLIGHT)
// ===========================================================================
const format_paragraph_CCG = (item) => {
    const title = item.title || '';
    const score = item.score || 0.00;
    const text = item.markdown || item.content_text || item.text || '';
    const folha = item.folha || '';
    let source = item.source || '';
    source = bookName(source);

    let question_number = '';
    if (score > 0.0) question_number = item.number || '';

    const badgeParts = [];
    if (source)          badgeParts.push(`<span class="metadata-badge estilo1"><strong>${escapeHtml(source)}</strong></span>`);
    if (title)           badgeParts.push(`<span class="metadata-badge estilo2"><strong>${escapeHtml(title)}</strong></span>`);
    if (folha)           badgeParts.push(`<span class="metadata-badge estilo2">(${escapeHtml(folha)})</span>`);
    if (question_number) badgeParts.push(`<span class="metadata-badge estilo2"> #${escapeHtml(question_number)}</span>`);
    if (window.CONFIG ? !!window.CONFIG.FULL_BADGES : FULL_BADGES) {
      if (score > 0.0) badgeParts.push(`<span class="metadata-badge estilo2"> @${escapeHtml(score)}</span>`);
    }
    metaBadges = badgeParts.join('');
    
    const rawHtml  = renderMarkdown(text);
    const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

    // >>> HIGHLIGHT <<<
    const highlighted = highlightHtml(safeHtml, window.__lastSearchQuery || '');

    const showBadges = shouldShowRefBadges();
    const metaInline = buildMetaInlineLine([
        ['Source', source],
        ['Title', title],
        ['Folha', folha],
        ['Number', question_number],
        ...(score > 0.0 ? [['Score', score]] : []),
    ]);

    const finalHtml = showBadges
      ? `<div class="displaybox-item"><div class="displaybox-text markdown-content">${highlighted}</div>${metaBadges}</div>`
      : `<div class="displaybox-item"><div class="displaybox-text markdown-content">${highlighted}${metaInline}</div></div>`;

    return finalHtml;
};

  
// ===========================================================================
// EC: Content_Text  Markdown_Text  Title  Number  Source ... (+ HIGHLIGHT)
// ===========================================================================
const format_paragraph_EC = (item) => {
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

    const badgeParts = [];
    if (source)           badgeParts.push(`<span class="metadata-badge estilo1"><strong>${escapeHtml(source)}</strong></span>`);
    if (title)            badgeParts.push(`<span class="metadata-badge estilo2"><strong>${escapeHtml(title)}</strong></span>`);
    if (area)             badgeParts.push(`<span class="metadata-badge estilo2"><em>${escapeHtml(area)}</em></span>`);
    if (verbete_number)   badgeParts.push(`<span class="metadata-badge estilo2"> #${escapeHtml(verbete_number)}</span>`);
    if (theme)            badgeParts.push(`<span class="metadata-badge estilo2"> ${escapeHtml(theme)}</span>`);
    if (author)           badgeParts.push(`<span class="metadata-badge estilo2"> ${escapeHtml(author)}</span>`);
    if (date)             badgeParts.push(`<span class="metadata-badge estilo2"> ${escapeHtml(date)}</span>`);
    if (window.CONFIG ? !!window.CONFIG.FULL_BADGES : FULL_BADGES) {
      if (score > 0.0)    badgeParts.push(`<span class="metadata-badge estilo2"> @${escapeHtml(score)}</span>`);
    }
    metaBadges = badgeParts.join('');
      
    const rawHtml = renderMarkdown(text);
    const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

    // >>> HIGHLIGHT <<<
    const highlighted = highlightHtml(safeHtml, window.__lastSearchQuery || '');

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
      ? `<div class="displaybox-item"><div class="displaybox-text markdown-content">${highlighted}</div>${metaBadges}</div>`
      : `<div class="displaybox-item"><div class="displaybox-text markdown-content">${highlighted}${metaInline}</div></div>`;

    return finalHtml;
};

  
// ===========================================================================
// Default: Content_Text  Markdown_Text Title  Number  Score  (+ HIGHLIGHT)
// ===========================================================================
const format_paragraph_Default = (item) => {
    const title = item.title || '';
    const paragraph_number = item.number || '';
    const score = item.score || 0.00;
    const text = item.markdown || item.content_text || item.text || '';
    let source = item.source || '';
    source = bookName(source);

    const badgeParts = [];
    if (source) badgeParts.push(`<span class="metadata-badge estilo1"><strong>${escapeHtml(source)}</strong></span>`);
    if (title)  badgeParts.push(`<span class="metadata-badge estilo2"><strong>${escapeHtml(title)}</strong></span>`);
    if (window.CONFIG ? !!window.CONFIG.FULL_BADGES : FULL_BADGES) {
      if (paragraph_number) badgeParts.push(`<span class="metadata-badge estilo2"> #${escapeHtml(paragraph_number)}</span>`);
      if (score > 0.0)      badgeParts.push(`<span class="metadata-badge estilo2"> @${escapeHtml(score)}</span>`);
    }
    metaBadges = badgeParts.join('');

    const textCompleted = (score > 0.0) ? `**${title}**. ${text}` : text;

    const rawHtml = renderMarkdown(textCompleted);
    const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

    // >>> HIGHLIGHT <<<
    const highlighted = highlightHtml(safeHtml, window.__lastSearchQuery || '');

    const showBadges = shouldShowRefBadges();
    const metaInline = buildMetaInlineLine([
        ['Source', source],
        ['Title', title],
        ['Number', paragraph_number],
        ...(score > 0.0 ? [['Score', score]] : []),
    ]);

    const finalHtml = showBadges
      ? `<div class="displaybox-item"><div class="displaybox-text markdown-content">${highlighted}</div>${metaBadges}</div>`
      : `<div class="displaybox-item"><div class="displaybox-text markdown-content">${highlighted}${metaInline}</div></div>`;

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
      </div>
    </div>`;
    container.insertAdjacentHTML('beforeend', html);
}


// ________________________________________________________________________________________
// Show Verbetopedia (simplificada — ordenação por score)  + HIGHLIGHT
// ________________________________________________________________________________________
function showVerbetopedia(container, data) {
    if (!container) {
        console.error('Results container not found');
        return;
    }

console.log('||| Display.js|||  showVerbetopedia data:', data);

    // Query atual para highlight
    window.__lastSearchQuery = getSearchQuery(data);

    const arr = Array.isArray(data.results) ? data.results : [];
    if (!arr.length) {
        container.insertAdjacentHTML(
            'beforeend',
            '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
        );
        return;
    }

    const items = arr.map(item => {
        const metaData = extractMetadata(item, 'verbetopedia');
        return { ...item, _meta: metaData };
    });

    items.sort((a, b) => {
        const sa = (typeof a._meta.score === 'number') ? a._meta.score : -Infinity;
        const sb = (typeof b._meta.score === 'number') ? b._meta.score : -Infinity;
        return sa - sb; // menor primeiro
    });

    const contentHtml = items.map(item => {
        let content = (
            (typeof item.markdown === 'string' && item.markdown) ||
            (typeof item.page_content === 'string' && item.page_content) ||
            (typeof item.text === 'string' && item.text) ||
            ''
        );
        const rawHtml  = renderMarkdown(content);
        const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

        // >>> HIGHLIGHT <<<
        const highlighted = highlightHtml(safeHtml, window.__lastSearchQuery || '');

        const metaData = item._meta;
        const titleHtml = `
          <strong>${metaData.title}</strong> (${metaData.area})  ●  <em>${metaData.author}</em>  ●  #${metaData.number}  ●  ${metaData.date}
        `;
        const scoreHtml = (typeof metaData.score === 'number' && !Number.isNaN(metaData.score))
            ? `<span class="rag-badge">Score: ${metaData.score.toFixed(2)}</span>` : '';

        // Monta link PDF
        let arquivo = metaData.title;
        arquivo = arquivo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ç/g, "c").replace(/Ç/g, "C");
        const verbLink = VERBETES_URL + encodeURIComponent(arquivo) + ".pdf";
        const pdfLink = `
            <a href="${verbLink}" target="_blank" rel="noopener noreferrer"
               title="Abrir PDF em nova aba" style="margin-left: 8px; color: red; font-size: 1.1em;">
                <i class="fas fa-file-pdf"></i>
            </a>`;

        return `
        <div class="displaybox-item">
            <div class="displaybox-header verbetopedia-header" style="text-align: left; padding-left: 0; color:rgb(20, 30, 100)">
                <span class="header-text">${titleHtml}</span>
            </div>
            <div class="displaybox-text">
                <span class="displaybox-text markdown-content">${highlighted}</span>
                ${(window.CONFIG ? !!window.CONFIG.FULL_BADGES : FULL_BADGES) ? `<span class="metadata-badge">${scoreHtml}</span>` : ''}
                ${pdfLink}
            </div>
        </div>`;
    }).join('');

    const groupHtml = `
    <div class="displaybox-group">
        <div class="displaybox-header">
            <span style="color: blue; font-size: 16px; font-weight: bold;">Enciclopédia da Conscienciologia</span>
            <span class="score-badge" style="font-size: 12px">${items.length} resultado${items.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="displaybox-content">
            ${contentHtml}
        </div>
    </div>`;
    container.insertAdjacentHTML('beforeend', groupHtml);

    // Badge + painel colapsável
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
// Show RAGbot
// ________________________________________________________________________________________
function showRagbot(container, data) {
  const text = data?.text || 'No text available.';
  const mdHtml = renderMarkdown(text);

  metadata = extractMetadata(data, 'ragbot');
  const citations = metadata?.citations;
  const total_tokens_used = metadata?.total_tokens_used;
  const model = metadata?.model;
  const temperature = metadata?.temperature;
    
  const html = `
    <div class="displaybox-container ragbot-box">
      <div class="displaybox-content">
        <div class="displaybox-text markdown-content">${mdHtml}</div>
      </div>
    </div>`;
  container.insertAdjacentHTML('beforeend', html);
}


// ________________________________________________________________________________________
// Show RAGbot (inline badges only)
// ________________________________________________________________________________________
function showRagbot2(container, data) {
  try {
    if (!container || !data) return;

    let md = {};
    try { md = extractMetadata(data, 'ragbot') || {}; } catch {}

    const title = (md?.title || data?.title || '').toString();
    const citations = (md?.citations || data?.citations || '').toString();
    const totalTokens = md?.total_tokens_used ?? data?.total_tokens_used;
    const model = md?.model ?? data?.model;
    const temperature = md?.temperature ?? data?.temperature;

    const parts = [];
    if (title) parts.push(`<span class="metadata-badge title"><strong>${escapeHtml(title)}</strong></span>`);
    if (citations) parts.push(`<span class="metadata-badge citation">Citations: ${escapeHtml(citations)}</span>`);
    if (model !== undefined && model !== null && model !== '') parts.push(`<span class="metadata-badge model">Model: ${escapeHtml(String(model))}</span>`);
    if (totalTokens !== undefined && totalTokens !== null && totalTokens !== '') parts.push(`<span class="metadata-badge tokens">Tokens: ${escapeHtml(String(totalTokens))}</span>`);
    if (temperature !== undefined && temperature !== null && temperature !== '') parts.push(`<span class="metadata-badge temperature">Temp: ${escapeHtml(String(temperature))}</span>`);

    if (!parts.length) return;

    const metaHtml = `<div class="metadata-container">${parts.join('')}</div>`;
    container.insertAdjacentHTML('beforeend', metaHtml);
  } catch (e) {
    console.warn('showRagbot2: failed to render badges', e);
  }
}


// ________________________________________________________________________________________
// Show Quiz (stub seguro; remova do assign final se não usar)
// ________________________________________________________________________________________
function showQuiz(container, data) {
  if (!container) return;
  const arr = Array.isArray(data?.results) ? data.results : [];
  if (!arr.length) {
    container.insertAdjacentHTML('beforeend',
      '<div class="displaybox-container"><div class="displaybox-content">No quiz items.</div></div>');
    return;
  }
  const html = arr.map((it, i) => {
    const q = (it?.question || it?.text || '').toString();
    const a = (it?.answer || '').toString();
    return `
      <div class="displaybox-item">
        <div class="displaybox-text"><strong>Q${i+1}.</strong> ${escapeHtml(q)}</div>
        ${a ? `<div class="meta-inline" style="margin-top:6px;"><em>Answer:</em> ${escapeHtml(a)}</div>` : ''}
      </div>`;
  }).join('');
  container.insertAdjacentHTML('beforeend', `
    <div class="displaybox-group">
      <div class="displaybox-header"><span>Quiz</span><span class="score-badge">${arr.length}</span></div>
      <div class="displaybox-content">${html}</div>
    </div>`);
}


// ________________________________________________________________________________________
// Show Lexverb  (+ HIGHLIGHT)
// ________________________________________________________________________________________
function showLexverb(container, data) {

    if (!container) {
        console.error('Results container not found');
        return;
    }

    // Query atual
    window.__lastSearchQuery = getSearchQuery(data);

    const arr = Array.isArray(data.results) ? data.results : [];
    if (!arr.length) {
        container.insertAdjacentHTML(
            'beforeend',
            '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
        );
        return;
    }
   
    const contentHtml = arr.map(item => {
        const metaData = item.metadata;
        let content = metaData.markdown || metaData.page_content || metaData.text || metaData.paragraph || '';
        const rawHtml  = renderMarkdown(content);
        const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

        // >>> HIGHLIGHT <<<
        const highlighted = highlightHtml(safeHtml, window.__lastSearchQuery || '');

        const titleHtml = `
          <strong>${metaData.title}</strong> (${metaData.area})  ●  <em>${metaData.author}</em>  ●  #${metaData.number}  ●  ${metaData.date}
        `;

        // PDF link
        let arquivo = metaData.title;
        arquivo = arquivo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ç/g, "c").replace(/Ç/g, "C");
        const verbLink = VERBETES_URL + encodeURIComponent(arquivo) + ".pdf";
        const pdfLink = `
            <a href="${verbLink}" target="_blank" rel="noopener noreferrer"
               title="Abrir PDF em nova aba" style="margin-left: 8px; color: red; font-size: 1.1em;">
                <i class="fas fa-file-pdf"></i>
            </a>`;

        return `
        <div class="displaybox-item">
            <div class="displaybox-header verbetopedia-header" style="text-align: left; padding-left: 0; color:rgba(20, 30, 100)">
                <span class="header-text">${titleHtml}</span>
            </div>
            <div class="displaybox-text">
                <span class="displaybox-text markdown-content">${highlighted}</span>
                ${pdfLink}
            </div>
        </div>`;
    }).join('');

    const groupHtml = `
    <div class="displaybox-group">
        <div class="displaybox-header">
            <span style="color: blue; font-size: 16px; font-weight: bold;">Enciclopédia da Conscienciologia</span>
            <span class="score-badge" style="font-size: 12px">${arr.length} resultado${arr.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="displaybox-content">
            ${contentHtml}
        </div>
    </div>`;
    container.insertAdjacentHTML('beforeend', groupHtml);

    // Badge + painel
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
// Show Conscienciogramopedia (simplificada — ordenação por score)  (+ HIGHLIGHT)
// ________________________________________________________________________________________
function showCcg(container, data) {
    if (!container) {
        console.error('Results container not found');
        return;
    }

    window.__lastSearchQuery = getSearchQuery(data);

    const arr = Array.isArray(data.results) ? data.results : [];
    if (!arr.length) {
        container.insertAdjacentHTML(
            'beforeend',
            '<div class="displaybox-container"><div class="displaybox-content">No results to display.</div></div>'
        );
        return;
    }

    const items = arr.map(item => {
        const metaData = extractMetadata(item, 'ccg');
        return { ...item, _meta: metaData };
    });

    items.sort((a, b) => {
        const sa = (typeof a._meta.score === 'number') ? a._meta.score : -Infinity;
        const sb = (typeof b._meta.score === 'number') ? b._meta.score : -Infinity;
        return sa - sb;
    });

    const contentHtml = items.map(item => {
        let content = (
            (typeof item.markdown === 'string' && item.markdown) ||
            (typeof item.page_content === 'string' && item.page_content) ||
            (typeof item.text === 'string' && item.text) ||
            ''
        );

        const rawHtml  = renderMarkdown(content);
        const safeHtml = (window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml);

        // >>> HIGHLIGHT <<<
        const highlighted = highlightHtml(safeHtml, window.__lastSearchQuery || '');

        const metaData = item._meta;
        const titleHtml = `<strong>${metaData.title}</strong>  ●  ${metaData.folha}  ●  #${metaData.number}`;
        const scoreHtml = (typeof metaData.score === 'number' && !Number.isNaN(metaData.score))
            ? `<span class="rag-badge">Score: ${metaData.score.toFixed(2)}</span>` : '';

        return `
        <div class="displaybox-item">
            <div class="displaybox-header verbetopedia-header" style="text-align: left; padding-left: 0; color:rgb(20, 30, 100)">
                <span class="header-text">${titleHtml}</span>
            </div>
            <div class="displaybox-text">
                <span class="displaybox-text markdown-content">${highlighted}</span>
                ${(window.CONFIG ? !!window.CONFIG.FULL_BADGES : FULL_BADGES) ? `<span class="metadata-badge">${scoreHtml}</span>` : ''}
            </div>
        </div>`;
    }).join('');

    const groupHtml = `
    <div class="displaybox-group">
        <div class="displaybox-header">
            <span style="color: blue; font-size: 16px; font-weight: bold;">Conscienciograma</span>
            <span class="score-badge" style="font-size: 12px">${items.length} resultado${items.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="displaybox-content">
            ${contentHtml}
        </div>
    </div>`;
    container.insertAdjacentHTML('beforeend', groupHtml);

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
      <div class="spinner" style="
          width:16px;height:16px;border:2px solid #ddd;border-top-color:#999;border-radius:50%;
          animation: spin .8s linear infinite;"></div>
    </div>
  `);
}

function removeLoading(container) {
  if (!container) return;
  const loadingContainer = container.querySelector('.loading-container');
  if (loadingContainer) loadingContainer.remove();
}

// CSS (opcional): coloque no seu stylesheet global
// @keyframes spin { to { transform: rotate(360deg); } }
// .loading-container .loading { font-size: 0.95rem; color: var(--gray-700, #444); }





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


/**
 * ======================================================================================================================
 * Displays results based on search type
 * @param {HTMLElement} container - The container element
 * @param {Object} data - The data payload
 * @param {string} type - The search type key
 * ======================================================================================================================
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


// ===== Renderer assignments =====
// Popular o mapeamento no final do arquivo
// Como renderers foi criado com var lá no topo, não há risco de “Cannot access 'renderers' before initialization”.
Object.assign(renderers, {
  ragbot: showRagbot,
  lexical: showSearch,
  semantical: showSearch,
  title: showTitle,
  simple: showSimple,
  verbetopedia: showVerbetopedia,
  ccg: showCcg,
  quiz: showQuiz,        // remova esta linha se não usar quiz
  lexverb: showLexverb,
  deepdive: showDeepdive
});
