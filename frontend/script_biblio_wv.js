let biblioWvController = null;

function parsePagesInput(rawInput) {
  const raw = String(rawInput || '');
  const chunks = raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  const numbers = chunks
    .map(token => Number.parseInt(token, 10))
    .filter(n => Number.isFinite(n) && n > 0);

  return Array.from(new Set(numbers)).sort((a, b) => a - b);
}

function setStatus(message, type = 'info') {
  const el = document.getElementById('biblioStatus');
  if (!el) return;
  el.textContent = message || '';
  el.style.color = type === 'error' ? 'var(--error)' : 'var(--gray-600)';
}

function getSelectedBookTitle() {
  const active = document.querySelector('#booksContainer .book-pill.active');
  return active ? (active.dataset.title || active.textContent || '').trim() : '';
}

function getSelectedBookSigla() {
  const active = document.querySelector('#booksContainer .book-pill.active');
  return active ? (active.dataset.sigla || '').trim() : '';
}

function getSelectedStyle() {
  const active = document.querySelector('#styleContainer .search-type-pill.active');
  return active ? active.dataset.style : 'simples';
}

function mountBibliographyText(bibliografia, pages) {
  const biblio = String(bibliografia || '').trim().replace(/[.;\s]+$/, '');
  if (!Array.isArray(pages) || pages.length === 0) {
    return `${biblio}.`;
  }
  const pagesText = pages.join(', ');
  return `${biblio}; p. ${pagesText}.`;
}

document.addEventListener('DOMContentLoaded', () => {
  const resultsDiv = document.getElementById('results');
  const booksContainer = document.getElementById('booksContainer');
  const pagesInput = document.getElementById('pagesInput');
  const mountButton = document.getElementById('mountBiblioButton');
  const styleContainer = document.getElementById('styleContainer');
  const autoResizePagesInput = () => {
    if (!pagesInput) return;
    pagesInput.style.height = 'auto';
    pagesInput.style.height = `${pagesInput.scrollHeight}px`;
  };

  pagesInput?.addEventListener('input', autoResizePagesInput);
  autoResizePagesInput();

  styleContainer?.addEventListener('click', (event) => {
    const pill = event.target.closest('.search-type-pill');
    if (!pill) return;
    styleContainer.querySelectorAll('.search-type-pill').forEach(item => item.classList.remove('active'));
    pill.classList.add('active');
  });

  booksContainer?.addEventListener('click', (event) => {
    const pill = event.target.closest('.book-pill');
    if (!pill) return;

    const isActive = pill.classList.contains('active');
    booksContainer.querySelectorAll('.book-pill').forEach(item => item.classList.remove('active'));
    if (!isActive) {
      pill.classList.add('active');
    }
  });

  mountButton?.addEventListener('click', async () => {
    const selectedBookTitle = getSelectedBookTitle();
    const selectedBookSigla = getSelectedBookSigla();
    const selectedStyle = getSelectedStyle();
    const pages = parsePagesInput(pagesInput?.value || '');

    if (!selectedBookTitle) {
      showMessage(resultsDiv, 'Selecione 1 livro para montar a bibliografia.', 'error');
      return;
    }

    const originalButtonState = {
      html: mountButton.innerHTML,
      opacity: mountButton.style.opacity,
      cursor: mountButton.style.cursor,
    };

    if (mountButton.disabled) return;
    mountButton.disabled = true;
    mountButton.style.opacity = '0.7';
    mountButton.style.cursor = 'not-allowed';

    if (biblioWvController) biblioWvController.abort();
    biblioWvController = new AbortController();

    const timeoutId = setTimeout(() => {
      try { biblioWvController.abort(); } catch (e) {}
    }, 30000);

    try {
      setStatus('Montando bibliografia...');
      resultsDiv.innerHTML = '';
      insertLoading(resultsDiv, 'Consultando bibliografia da obra selecionada...');

      const response = await window.call_biblio_wv_build({
        book_title: selectedBookTitle,
        book_sigla: selectedBookSigla,
        style: selectedStyle,
      });

      removeLoading(resultsDiv);

      const finalText = mountBibliographyText(response?.text || '', pages);
      showSimple(resultsDiv, {
        text: finalText,
        ref: '',
      });

      setStatus('');
    } catch (error) {
      removeLoading(resultsDiv);
      const msg = error?.message || 'Erro ao montar bibliografia.';
      showMessage(resultsDiv, msg, 'error');
      setStatus('Falha ao montar bibliografia.', 'error');
    } finally {
      clearTimeout(timeoutId);
      mountButton.disabled = false;
      mountButton.innerHTML = originalButtonState.html;
      mountButton.style.opacity = originalButtonState.opacity;
      mountButton.style.cursor = originalButtonState.cursor;
      biblioWvController = null;
    }
  });

  setStatus('');
});
