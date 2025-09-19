let controller = null;
let chat_id = null;
let quizData = null; // guarda a próxima pergunta pré-carregada

document.addEventListener('DOMContentLoaded', () => {
    const resultsDiv   = document.getElementById('results');
    const searchButton = document.getElementById('quizButton');

    // Initialize download buttons
    if (window?.downloadUtils?.initDownloadButtons) {
        window.downloadUtils.initDownloadButtons('quiz');
    }

    // Ação do botão
    if (searchButton) {
        searchButton.addEventListener('click', quiz);
        // Garante que não dispare submit se estiver dentro de <form>
        searchButton.setAttribute('type', 'button');
    }












    //_________________________________________________________
    // Quiz flow
    //_________________________________________________________
    async function quiz() {


        // Reset LLM data
        resetLLM();

        // Salva estado original do botão
        const originalButtonState = {
            html: searchButton?.innerHTML,
            opacity: searchButton?.style?.opacity,
            cursor: searchButton?.style?.cursor
        };

        // Evita reentrância
        if (searchButton?.disabled) return;

        // Desabilita botão durante o processamento
        if (searchButton) {
            searchButton.disabled = true;
            searchButton.style.opacity = '0.7';
            searchButton.style.cursor = 'not-allowed';
        }

        // O bridge controla abort/timeout (configurável). Não criamos AbortController local aqui.

        try {
            // Limpa e mostra loading
            if (resultsDiv) {
                resultsDiv.innerHTML = '';
                if (typeof insertLoading === 'function') {
                    insertLoading(resultsDiv, 'Formulando pergunta...');
                }
            }

            // Garante chat_id
            try {
                chat_id = getOrCreateChatId();
            } catch (_) {
                chat_id = chat_id || localStorage.getItem('cons_chat_id') || null;
            }

            // Busca pergunta caso ainda não exista uma pré-carregada
            // ------------------------------------------------------
            if (!quizData) {
                const paramQuestion = {
                    query: 'Formule uma nova pergunta sobre Conscienciologia. Não repita perguntas anteriores nem aborde temas semelhantes em sequência.',
                    model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
                    temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
                    vector_store_names: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
                    instructions: PROMPT_QUIZ_PERGUNTA,
                    use_session: true,
                    chat_id
                };
                const firstData = await call_llm({ ...paramQuestion, timeout_ms: 60000 });
                if (firstData?.chat_id) {
                    localStorage.setItem('cons_chat_id', firstData.chat_id);
                    chat_id = firstData.chat_id;
                }
                quizData = firstData;
            }

            // ------------------------------------------------------
            // Exibe pergunta atual
            if (typeof removeLoading === 'function') {
                removeLoading(resultsDiv);
            }
            const quizParsed = parseQuizResponse(quizData) || { pergunta: '', opcoes: [] };
            const pergunta = quizParsed.pergunta || '';
            const opcoes   = Array.isArray(quizParsed.opcoes) ? quizParsed.opcoes : [];
            if (typeof displayResults === 'function') {
                displayResults(resultsDiv, { pergunta, opcoes }, 'quiz');
            }

            // Aguarda resposta do usuário (com timeout)
            // -----------------------------------------
            const userAnswer = await new Promise((resolve, reject) => {
                let clickTimer = null;
                const onClick = (ev) => {
                    const btn = ev.target.closest('.quiz-badge-btn');
                    if (!btn) return;
                    const row = btn.closest('.quiz-option-row');
                    const txtEl = row?.querySelector('.quiz-option-text');
                    const ans = (txtEl?.textContent || '').trim();
                    resultsDiv.removeEventListener('click', onClick);
                    if (clickTimer) clearTimeout(clickTimer);
                    resolve(ans);
                };

                resultsDiv.addEventListener('click', onClick);

                // Timeout de inatividade para clique (p.ex., 60s)
                clickTimer = setTimeout(() => {
                    resultsDiv.removeEventListener('click', onClick);
                    reject(new Error('Tempo esgotado para escolher uma opção'));
                   
                    // Remove loading
                    if (typeof removeLoading === 'function') {
                        removeLoading(resultsDiv);
                    }
                    // Sai da função
                    try { if (typeof window.stop === 'function') window.stop(); } catch (e) {}
                    window.location.href = 'index.html';


                }, 100000);

            }).catch((e) => {
                // Mostra mensagem amigável e reabilita UI, mantendo a mesma pergunta
                console.warn('Quiz click timeout:', e.message);
                if (resultsDiv) {
                    const warn = document.createElement('div');
                    warn.className = 'warning';
                    warn.textContent = 'Tempo esgotado. Clique em uma opção ou no botão para tentar novamente.';
                    resultsDiv.appendChild(warn);
                }
                return null;
            });

            // ------------------------------------------------------

            if (!userAnswer) {
                return; // encerra a função mantendo quizData para próxima tentativa
            }

            if (typeof insertLoading === 'function') {
                insertLoading(resultsDiv, 'Analisando a resposta...');
            }

            console.log('Resposta do usuario:', userAnswer);

            // Envia resposta para avaliação
            // -----------------------------------------
            const respParam = {
                query: 'Resposta do usuario: ' + userAnswer,
                model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
                temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
                vector_store_names: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
                instructions: PROMPT_QUIZ_RESPOSTA,
                use_session: true,
                chat_id
            };
            const respComment = await call_llm({ ...respParam, timeout_ms: 60000 });
            if (respComment?.chat_id) {
                localStorage.setItem('cons_chat_id', respComment.chat_id);
                chat_id = respComment.chat_id;
            }
            

            console.log('Comentário LLM', respComment);

            removeLoading(resultsDiv);

            // Exibe Comentário
            displayResults(resultsDiv, respComment, 'ragbot');


            // Pré-carrega próxima pergunta
            // -----------------------------------------
           // Garante chat_id
           try {
            chat_id = getOrCreateChatId();
            } catch (_) {
                chat_id = chat_id || localStorage.getItem('cons_chat_id') || null;
            }

            const paramQuestion = {
                query: 'Formule uma nova pergunta sobre Conscienciologia. Não repita perguntas anteriores nem aborde temas semelhantes em sequência.',
                model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
                temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
                vector_store_names: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
                instructions: PROMPT_QUIZ_PERGUNTA,
                use_session: true,
                chat_id
            };
            const firstData = await call_llm({ ...paramQuestion, timeout_ms: 60000 });
            if (firstData?.chat_id) {
                localStorage.setItem('cons_chat_id', firstData.chat_id);
                chat_id = firstData.chat_id;
            }
            quizData = firstData;
   
        // ------------------------------------------------------

        console.log('>>>> Nova Pergunta Elaborada (Quiz Data): ', quizData);

            // Habilita botão
            if (searchButton) {
                searchButton.disabled = false;
                searchButton.innerHTML = originalButtonState.html;
                searchButton.style.opacity = originalButtonState.opacity;
                searchButton.style.cursor = originalButtonState.cursor;
            }

        } catch (error) {
            console.error('Error in quiz:', error);
            if (resultsDiv) {
                resultsDiv.innerHTML = `<div class="error"><p>${error?.message || 'An unexpected error occurred'}</p></div>`;
            }
        } finally {
            // Restaura botão
            if (searchButton) {
                searchButton.disabled = false;
                searchButton.innerHTML = originalButtonState.html;
                searchButton.style.opacity = originalButtonState.opacity;
                searchButton.style.cursor = originalButtonState.cursor;
            }
            controller = null;
        }
    }
});
















//______________________________________________________________________________________________
// Parseia a resposta do LLM em "pergunta" e 4 "opções".
//______________________________________________________________________________________________
function parseQuizResponse(response) {
    try {
        let raw = '';
        if (typeof response === 'string') {
            raw = response;
        } else if (response && typeof response === 'object') {
            raw = String(response.text || '');
        }
        if (!raw) return { pergunta: '', opcoes: [] };

        const text = raw.replace(/```[\s\S]*?```/g, '').replace(/\r\n?/g, '\n').trim();
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        // 1) Tenta extrair opções por linhas tipo: "A) ...", "1. ...", "- ..."
        const optLineRegex = /^(?:[A-Da-d][)\.:\-]|[1-4][)\.:\-]|[-*])\s+(.*)$/;
        let firstOptIdx = lines.findIndex(l => optLineRegex.test(l));

        let pergunta = '';
        let opcoes = [];

        if (firstOptIdx >= 0) {
            pergunta = lines.slice(0, firstOptIdx).join(' ').replace(/^Pergunta\s*[:\-]\s*/i, '').trim();
            for (let i = firstOptIdx; i < lines.length && opcoes.length < 4; i++) {
                const m = lines[i].match(optLineRegex);
                if (m && m[1]) {
                    const val = m[1].replace(/^[-*]\s*/, '').trim();
                    if (val) opcoes.push(val);
                }
            }
        }

        // 2) Se não encontrou 4 opções por linhas, tenta padrão inline: "A) x; B) y; C) z; D) w"
        if (opcoes.length < 4) {
            const single = lines.join(' ');
            const tryExtract = (pattern) => {
                const arr = [];
                let mm;
                while ((mm = pattern.exec(single)) && arr.length < 4) {
                    const val = (mm[2] || '').trim();
                    if (val) arr.push(val);
                }
                return arr;
            };

            // Letras A-D
            let arr = tryExtract(/([A-Da-d])[)\.:\-]\s*([^;\n]+?)(?=\s+[A-Da-d][)\.:\-]|\s*;|$)/g);
            if (arr.length < 4) {
                // Números 1-4
                arr = tryExtract(/([1-4])[)\.:\-]\s*([^;\n]+?)(?=\s+[1-4][)\.:\-]|\s*;|$)/g);
            }
            if (arr.length >= 2 && opcoes.length < 4) {
                opcoes = arr.slice(0, 4);
                if (!pergunta) {
                    // Pergunta é o texto anterior ao primeiro marcador
                    const idxA = single.search(/[A-Da-d][)\.:\-]\s+/);
                    const idx1 = single.search(/[1-4][)\.:\-]\s+/);
                    const idx = [idxA, idx1].filter(i => i >= 0).sort((a,b)=>a-b)[0];
                    pergunta = (idx >= 0 ? single.slice(0, idx) : single)
                        .replace(/^Pergunta\s*[:\-]\s*/i, '')
                        .trim();
                }
            }
        }

        // 3) Fallback simples: primeira linha como pergunta; próximas 4 linhas como opções
        if (!pergunta) pergunta = (lines[0] || '').replace(/^Pergunta\s*[:\-]\s*/i, '').trim();
        if (opcoes.length < 4) {
            const rest = lines.slice(1).filter(l => !/^\*\*?/.test(l));
            for (const l of rest) {
                if (opcoes.length >= 4) break;
                // ignora linhas que parecem títulos
                if (/^#+\s/.test(l)) continue;
                if (optLineRegex.test(l)) {
                    opcoes.push(l.replace(optLineRegex, '$1').trim());
                } else if (/^[-*]\s+/.test(l)) {
                    opcoes.push(l.replace(/^[-*]\s+/, '').trim());
                }
            }
        }

        // Garante exatamente 4 itens
        if (opcoes.length < 4) {
            while (opcoes.length < 4) opcoes.push('');
        } else if (opcoes.length > 4) {
            opcoes = opcoes.slice(0, 4);
        }

        console.debug('[quiz] Pergunta extraída:', pergunta);
        console.debug('[quiz] Opções extraídas:', opcoes);
        return { pergunta, opcoes };

    } catch (e) {
        console.warn('Falha ao parsear quiz do LLM:', e);
        return { pergunta: '', opcoes: [] };
    }
}
