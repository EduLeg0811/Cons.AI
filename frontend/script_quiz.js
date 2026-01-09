// script_quiz.js (ENXUTO) - Quiz flow com gabarito determinístico + progressão simples
let controller = null;
let chat_id = null;
let quizData = null; // próxima pergunta pré-carregada (objeto/resp do call_llm)

document.addEventListener('DOMContentLoaded', () => {
  const resultsDiv   = document.getElementById('results');
  const searchButton = document.getElementById('quizButton');

  // ---------------------------------------------
  // Helpers (pequenos e únicos)
  // ---------------------------------------------
  const norm = (s) => (s ?? '').toString().replace(/\s+/g, ' ').trim();

  function getOrFallbackChatId() {
    try { return getOrCreateChatId(); } catch (_) {}
    try { return chat_id || localStorage.getItem('cons_chat_id') || null; } catch (_) {}
    return chat_id || null;
  }

  function getResponseText(resp) {
    try {
      if (typeof resp?.text === 'string') return resp.text;
      if (typeof resp?.results?.[0]?.text === 'string') return resp.results[0].text;
      if (typeof resp === 'string') return resp;
      return '';
    } catch { return ''; }
  }

  function tryParseJsonResponse(resp) {
    try {
      let raw = resp?.text ?? resp?.results?.[0]?.text ?? resp;
      if (raw && typeof raw === 'object') return raw;

      raw = String(raw || '').trim();
      if (!raw) return null;

      // remove fences
      let block = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

      // se veio double-stringified
      if ((block.startsWith('"') && block.endsWith('"')) || (block.startsWith("'") && block.endsWith("'"))) {
        try {
          const maybe = JSON.parse(block);
          if (maybe && typeof maybe === 'object') return maybe;
          if (typeof maybe === 'string') block = maybe;
        } catch {}
      }

      const obj = JSON.parse(block);
      return (obj && typeof obj === 'object') ? obj : null;
    } catch {
      return null;
    }
  }

  function validateQuizJson(json) {
    try {
      if (!json) return false;
      const ops = Array.isArray(json.opcoes) ? json.opcoes.slice(0, 4) : [];
      if (ops.length !== 4) return false;

      const norms = ops.map(norm).filter(Boolean);
      if (norms.length !== 4) return false;
      if (new Set(norms).size !== 4) return false;

      const idx = Number(json.correta_index);
      if (!(idx >= 1 && idx <= 4)) return false;

      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------
  // Shuffle preservando o gabarito (1..4)
  // ---------------------------------------------
  function shuffleOptionsPreservingCorrect(opcoes, corretaIndex) {
    try {
      const idx = Number(corretaIndex);
      if (!Array.isArray(opcoes) || opcoes.length !== 4 || !(idx >= 1 && idx <= 4)) {
        return { opcoes, correta_index: idx };
      }

      const items = opcoes.map((text, i) => ({ text, originalIndex: i + 1 }));
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }

      const newIndex = items.findIndex(it => it.originalIndex === idx) + 1;
      return {
        opcoes: items.map(it => it.text),
        correta_index: (newIndex >= 1 && newIndex <= 4) ? newIndex : idx
      };
    } catch {
      return { opcoes, correta_index: Number(corretaIndex) };
    }
  }

  // ---------------------------------------------
  // Progressão simples: Fácil → Médio → Difícil a cada 5 acertos seguidos
  // (Se errar, zera a sequência. Mantém nível no erro.)
  // ---------------------------------------------
  const LEVELS = ['Fácil', 'Médio', 'Difícil'];

  function getQuizLevel() {
    try { return localStorage.getItem('quiz_level') || 'Fácil'; } catch { return 'Fácil'; }
  }
  function setQuizLevel(lv) {
    try { localStorage.setItem('quiz_level', String(lv || 'Fácil')); } catch {}
  }
  function levelUp(lv) {
    const i = LEVELS.indexOf(lv);
    return LEVELS[Math.min(LEVELS.length - 1, Math.max(0, i + 1))] || lv;
  }

  function getStreak() {
    try { return Number(localStorage.getItem('quiz_correct_streak') || 0); } catch { return 0; }
  }
  function setStreak(n) {
    try { localStorage.setItem('quiz_correct_streak', String(Number(n) || 0)); } catch {}
  }

  function applyProgression(isCorrect) {
    if (isCorrect === true) {
      const next = getStreak() + 1;
      setStreak(next);
      if (next >= 5) {
        const lv = getQuizLevel();
        setQuizLevel(levelUp(lv));
        setStreak(0);
      }
    } else if (isCorrect === false) {
      setStreak(0);
    }
  }

 


// ________________________________________________________________________________________
// markCorrectBadge ✅ ENXUTO (compatível com display_quiz_enxuto.js)
// - Pinta SEMPRE pelo gabarito (corretaIndex 1..4)
// - Mira a caixa certa pelo quizId (data-quiz-id)
// - Não usa texto, não usa regex, não usa data-opt
// ________________________________________________________________________________________
function markCorrectBadge(container, corretaIndex, quizId) {
  try {
    if (!container) return;

    const idx = Number(corretaIndex); // 1..4
    if (!(idx >= 1 && idx <= 4)) return;

    // 1) Encontra o quiz-box certo
    let box = null;

    if (quizId != null) {
      box = container.querySelector(`.quiz-box[data-quiz-id="${quizId}"]`);
    }

    // Fallback: último quiz-box existente (caso quizId não seja passado)
    if (!box) {
      const boxes = container.querySelectorAll('.quiz-box');
      box = boxes.length ? boxes[boxes.length - 1] : null;
    }
    if (!box) return;

    // 2) Encontra a linha correta (data-index é 0..3; corretaIndex é 1..4)
    const row = box.querySelector(`.quiz-option-row[data-index="${idx - 1}"]`);
    if (!row) return;

    const badge = row.querySelector('.quiz-badge');
    if (!badge) return;

    // 3) Pinta
    row.style.backgroundColor = 'rgba(22, 163, 74, 0.12)';
    row.style.borderRadius = '10px';
    row.style.padding = '6px 8px';

    badge.classList.add('correct');
    badge.style.backgroundColor = '#16a34a';
    badge.style.borderColor = '#16a34a';
    badge.style.color = '#ffffff';
  } catch {
    // silencioso, como o resto do seu display
  }
}













  // ---------------------------------------------
  // Inicializações
  // ---------------------------------------------
  if (window?.downloadUtils?.initDownloadButtons) {
    window.downloadUtils.initDownloadButtons('quiz');
  }

  if (searchButton) {
    searchButton.addEventListener('click', quiz);
    searchButton.setAttribute('type', 'button');
  }

  resetLLM();

  // ---------------------------------------------
  // Quiz (fluxo enxuto)
  // ---------------------------------------------
  async function quiz() {
    if (!resultsDiv || !searchButton) return;
    if (searchButton.disabled) return;

    const originalButtonState = {
      html: searchButton.innerHTML,
      opacity: searchButton.style.opacity,
      cursor: searchButton.style.cursor
    };

    searchButton.disabled = true;
    searchButton.style.opacity = '0.7';
    searchButton.style.cursor = 'not-allowed';

    try {
      // 1) limpar área e mostrar loading
      resultsDiv.innerHTML = '';
      if (typeof insertLoading === 'function') insertLoading(resultsDiv, 'Gerando pergunta...');

      // 2) chat_id
      chat_id = getOrFallbackChatId();

      // 3) montar instruções dinâmicas apenas com nível
      const currentLevel = getQuizLevel();
      const dynamicHeader = `Nível solicitado: ${currentLevel}.`;

      const paramQuestion = {
        query: 'Gerar nova pergunta.',
        model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
        reasoning_effort: 'none',
        verbosity: 'low',
        temperature: 0.3,
        vector_store_names: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
        instructions: `${dynamicHeader}\n\n${PROMPT_QUIZ_PERGUNTA}`,
        use_session: true,
        chat_id: chat_id
      };

      // 4) obter pergunta (usa pré-carregada se existir)
      let respQ = quizData || await call_llm({ ...paramQuestion, timeout_ms: 60000 });

      // 5) parse e validação; se falhar, 1 retry
      let quizJson = tryParseJsonResponse(respQ);
      if (!validateQuizJson(quizJson)) {
        respQ = await call_llm({ ...paramQuestion, timeout_ms: 60000 });
        quizJson = tryParseJsonResponse(respQ);
      }
      if (!validateQuizJson(quizJson)) {
        throw new Error('Resposta do LLM inválida (JSON do quiz).');
      }

      // 6) normalizar payload
      let quizParsed = {
        nivel: String(quizJson.nivel || currentLevel).trim(),
        pergunta: String(quizJson.pergunta || '').trim(),
        opcoes: Array.isArray(quizJson.opcoes) ? quizJson.opcoes.slice(0, 4) : [],
        correta_index: Number(quizJson.correta_index || 0),
        topico: String(quizJson.topico || '').trim()
      };

      // 7) shuffle preservando gabarito
      const shuffled = shuffleOptionsPreservingCorrect(quizParsed.opcoes, quizParsed.correta_index);
      quizParsed.opcoes = shuffled.opcoes;
      quizParsed.correta_index = Number(shuffled.correta_index);

      // 8) render
      const quizId = showQuiz(resultsDiv, {
        nivel: quizParsed.nivel,
        pergunta: quizParsed.pergunta,
        opcoes: quizParsed.opcoes
      });


      // 9) aguardar clique do usuário (1..4)
      const picked = await new Promise((resolve) => {
        const onClick = (ev) => {
          const btn = ev.target.closest('.quiz-badge-btn');
          if (!btn) return;
          const idx0 = Number(btn.getAttribute('data-index'));
          if (!(idx0 >= 0 && idx0 <= 3)) return;
          resultsDiv.removeEventListener('click', onClick);
          resolve(idx0 + 1); // 1..4
        };
        resultsDiv.addEventListener('click', onClick);
      });

      // 10) correção local (gabarito determinístico)
      const gabaritoIdx = Number(quizParsed.correta_index); // 1..4
      const isCorrect = (picked === gabaritoIdx);

      // 11) progressão de nível (5 acertos seguidos)
      applyProgression(isCorrect);

      // 12) pedir comentário/explicação ao LLM (sem inferir gabarito do texto!)
      if (typeof insertLoading === 'function') insertLoading(resultsDiv, 'Analisando...');

      const op = quizParsed.opcoes.map(o => String(o || '').trim());
      const evalPayload = [
        `Pergunta: ${quizParsed.pergunta}`,
        `Opções: 1) ${op[0]} 2) ${op[1]} 3) ${op[2]} 4) ${op[3]}`,
        `Usuário escolheu: ${picked} — ${op[picked - 1] || ''}`,
        `Correta: ${gabaritoIdx} — ${op[gabaritoIdx - 1] || ''}`
      ].join(' | ');

      const respComment = await call_llm({
        query: evalPayload,
        model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
        temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
        vector_store_names: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
        instructions: PROMPT_QUIZ_RESPOSTA,
        use_session: true,
        chat_id: chat_id
      });

      if (respComment?.chat_id) {
        chat_id = respComment.chat_id;
        try { localStorage.setItem('cons_chat_id', chat_id); } catch {}
      }

      // 13) pintar a correta (sempre pelo gabarito) no quizId correto
      // pintar a correta ANTES de qualquer novo conteúdo
      requestAnimationFrame(() => {
        markCorrectBadge(resultsDiv, gabaritoIdx, quizId);
      });

      if (typeof removeLoading === 'function') removeLoading(resultsDiv);
      showSimple(resultsDiv, respComment);

      // 14) pré-carregar próxima pergunta
      quizData = await call_llm({ ...paramQuestion, timeout_ms: 60000 });

    } catch (error) {
      console.error('Quiz error:', error);
      if (typeof removeLoading === 'function') removeLoading(resultsDiv);
      resultsDiv.innerHTML = `<div class="error">${String(error?.message || error)}</div>`;
    } finally {
      searchButton.disabled = false;
      searchButton.innerHTML = originalButtonState.html;
      searchButton.style.opacity = originalButtonState.opacity;
      searchButton.style.cursor = originalButtonState.cursor;
    }
  }
});

