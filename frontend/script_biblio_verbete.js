let insertVerbeteController = null;

function setStatus(message, type = 'info') {
  const el = document.getElementById('biblioStatus');
  if (!el) return;
  el.textContent = message || '';
  el.style.color = type === 'error' ? 'var(--error)' : 'var(--gray-600)';
}

function autoResizeTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function setButtonState(button, { running = false, canRun = true } = {}) {
  if (!button) return;
  if (running) {
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Inserindo';
    button.style.opacity = '0.7';
    button.style.cursor = 'not-allowed';
    return;
  }

  button.innerHTML = '<i class="fas fa-list"></i> Bibliografia';
  button.disabled = !canRun;
  button.style.opacity = '';
  button.style.cursor = canRun ? '' : 'not-allowed';
}

function getSelectedStyle() {
  const active = document.querySelector('#styleContainer .search-type-pill.active');
  return active ? active.dataset.style : 'simples';
}

function extractApiError(error) {
  const fallback = error?.message || 'Erro ao processar verbetes.';
  const match = String(fallback).match(/"error"\s*:\s*"([^"]+)"/);
  return match ? match[1] : fallback;
}

document.addEventListener('DOMContentLoaded', () => {
  const resultsDiv = document.getElementById('results');
  const verbetesInput = document.getElementById('verbetesInput');
  const submitButton = document.getElementById('insertVerbeteButton');
  const styleContainer = document.getElementById('styleContainer');

  let isRunning = false;

  const refreshButton = () => {
    const canRun = String(verbetesInput?.value || '').trim().length > 0;
    setButtonState(submitButton, { running: isRunning, canRun });
  };

  verbetesInput?.addEventListener('input', () => {
    autoResizeTextarea(verbetesInput);
    refreshButton();
  });

  verbetesInput?.addEventListener('change', () => {
    autoResizeTextarea(verbetesInput);
    refreshButton();
  });

  styleContainer?.addEventListener('click', (event) => {
    const pill = event.target.closest('.search-type-pill');
    if (!pill) return;
    styleContainer.querySelectorAll('.search-type-pill').forEach(item => item.classList.remove('active'));
    pill.classList.add('active');
  });

  submitButton?.addEventListener('click', async () => {
    if (isRunning) return;

    const rawInput = String(verbetesInput?.value || '');
    if (!rawInput.trim()) {
      showMessage(resultsDiv, 'Informe ao menos um verbete.', 'error');
      return;
    }

    isRunning = true;
    refreshButton();

    try {
      //setStatus('Inserindo bibliografia de verbetes...');
      resultsDiv.innerHTML = '';
      insertLoading(resultsDiv, 'Inserindo bibliografia de verbetes...');

      if (insertVerbeteController) insertVerbeteController.abort();
      insertVerbeteController = new AbortController();

      const response = await window.call_insert_ref_verbete({
        titles: rawInput,
        style: getSelectedStyle(),
      });
      removeLoading(resultsDiv);

      const refList = String(response?.result?.ref_list || '').trim();
      const refBiblio = String(response?.result?.ref_biblio || '').trim();

      //showTitle(resultsDiv, `Verbetes: ${rawInput.trim()}`);

      if (refList) {
        showTitle(resultsDiv, 'Listagem de Verbetes');
        showSimple(resultsDiv, { text: refList, ref: '' });
      }

      if (refBiblio) {
        showTitle(resultsDiv, 'Bibliografia de Verbetes');
        showSimple(resultsDiv, { text: refBiblio, ref: '' });
      }

      if (!refList && !refBiblio) {
        showMessage(resultsDiv, 'Nenhum resultado foi retornado para os verbetes informados.', 'info');
      }

      try {
        if (window.logFeatureAccess) {
          const titles = rawInput
            .split(/[\n,;]+/)
            .map(item => item.trim())
            .filter(Boolean);
          window.logFeatureAccess({
            module: 'biblio_verbete',
            action: 'generate',
            label: 'Bibliografia de verbetes',
            value: rawInput,
            meta: {
              style: getSelectedStyle(),
              titles_count: titles.length,
              titles: titles,
            }
          });
        }
      } catch (logError) {
        console.error('Failed to log verbete bibliography access:', logError);
      }

      setStatus('');
    } catch (error) {
      removeLoading(resultsDiv);
      const msg = extractApiError(error) || 'Erro ao inserir bibliografia de verbetes.';
      showMessage(resultsDiv, msg, 'error');
      setStatus('Falha ao inserir bibliografia de verbetes.', 'error');
    } finally {
      isRunning = false;
      refreshButton();
      insertVerbeteController = null;
    }
  });

  autoResizeTextarea(verbetesInput);
  setStatus('');
  refreshButton();
});
