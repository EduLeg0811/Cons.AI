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

    // Initialize LLM
    resetLLM();




//_________________________________________________________
// Quiz flow CORRIGIDO E APRIMORADO
//_________________________________________________________
async function quiz() {

    const originalButtonState = {
        html: searchButton?.innerHTML,
        opacity: searchButton?.style?.opacity,
        cursor: searchButton?.style?.cursor
    };

    if (searchButton?.disabled) return;

    // ✅ CORREÇÃO: desabilita botão uma única vez por ciclo
    searchButton.disabled = true;
    searchButton.style.opacity = '0.7';
    searchButton.style.cursor = 'not-allowed';

    try {
        // ✅ CORREÇÃO: limpar área SEM perder feedback depois da resposta
        if (!quizData && resultsDiv) resultsDiv.innerHTML = '';

        if (typeof insertLoading === 'function') {
            insertLoading(resultsDiv, 'Gerando pergunta...');
        }

        // ✅ manter chat_id consistente
        try {
            chat_id = getOrCreateChatId();
        } catch (_) {
            chat_id = chat_id || localStorage.getItem('cons_chat_id') || null;
        }

        // ✅ CORREÇÃO MAIOR: só usar query minimalista
        // Deixar TODA regra para o PROMPT_QUIZ_PERGUNTA
        const paramQuestion = {
            query: 'Continue.',
            model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
            temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE),
            vector_store_names: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
            instructions: PROMPT_QUIZ_PERGUNTA,
            use_session: true,
            chat_id: chat_id
        };

        if (!quizData) {
            quizData = await call_llm({ ...paramQuestion, timeout_ms: 60000 });
        }

        // ✅ Remover loading antes de mostrar pergunta
        if (typeof removeLoading === 'function') removeLoading(resultsDiv);

        const quizParsed = parseQuizResponse(quizData);
        const pergunta = quizParsed.pergunta;
        const opcoes = quizParsed.opcoes;

        // ✅ Reset visual antes de exibir nova pergunta
        resultsDiv.innerHTML = '';
        showQuiz(resultsDiv, {
            nivel: quizParsed.nivel,
            pergunta: quizParsed.pergunta,
            opcoes: quizParsed.opcoes
        });
        
        
        // ✅ aguardando clique corretamente
        const userAnswer = await new Promise((resolve) => {

            let clickTimer = setTimeout(() => {
                resolve(null); // ✅ Sem redirecionar a página
            }, 120000); // 2 minutos

            const onClick = (ev) => {
                const btn = ev.target.closest('.quiz-badge-btn');
                if (!btn) return;
                const txt = btn.closest('.quiz-option-row')
                              ?.querySelector('.quiz-option-text')
                              ?.textContent?.trim();
                resultsDiv.removeEventListener('click', onClick);
                clearTimeout(clickTimer);
                resolve(txt);
            };

            // ✅ EVITA handlers duplicados
            resultsDiv.removeEventListener('click', onClick);
            resultsDiv.addEventListener('click', onClick);
        });

        if (!userAnswer) {
            const warn = document.createElement('div');
            warn.className = 'warning';
            warn.textContent = 'Tempo esgotado. Clique no botão para nova pergunta.';
            resultsDiv.appendChild(warn);

            quizData = null; // ✅ Garante nova pergunta
            return;
        }

        // ✅ Feedback automático pelo LLM
        insertLoading(resultsDiv, 'Analisando...');

        const respComment = await call_llm({
            query: 'Resposta do usuário: ' + userAnswer,
            model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
            temperature: 0.0, // ✅ garantir fidelidade de avaliação
            vector_store_names: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
            instructions: PROMPT_QUIZ_RESPOSTA,
            use_session: true,
            chat_id: chat_id
        });

        if (respComment?.chat_id) {
            chat_id = respComment.chat_id;
            localStorage.setItem('cons_chat_id', chat_id);
        }

        removeLoading(resultsDiv);
        showSimple(resultsDiv, respComment);

        // ✅ Carregar PRÓXIMA PERGUNTA usando continuidade do LLM
        quizData = await call_llm({ ...paramQuestion, timeout_ms: 60000 });

    } catch (error) {
        console.error('Quiz error:', error);
        resultsDiv.innerHTML = `<div class="error">${error?.message}</div>`;
    } finally {
        // ✅ botão reativado somente aqui
        searchButton.disabled = false;
        searchButton.innerHTML = originalButtonState.html;
        searchButton.style.opacity = originalButtonState.opacity;
        searchButton.style.cursor = originalButtonState.cursor;
    }
}


//______________________________________________________________________________________________
// Parser atualizado COM suporte a "Nível:" (novo formato do prompt)
//______________________________________________________________________________________________
function parseQuizResponse(response) {
    
    try {
        let raw = String(response?.text || '').trim();
        if (!raw) return { nivel: '', pergunta: '', opcoes: [] };

        raw = raw.replace(/```[\s\S]*?```/g, '').replace(/\r/g, '');

        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

        let nivel = '';
        let pergunta = '';
        let opcoes = [];

        // 1️⃣ Captura o nível, se existir
        if (lines[0].startsWith('Nível:')) {
            nivel = lines.shift().replace(/^Nível:\s*/i, '').trim();
        }

        // 2️⃣ Extrair pergunta
        const idxPergunta = lines.findIndex(l => /^Pergunta:/i.test(l));

        if (idxPergunta >= 0) {
            pergunta = lines[idxPergunta]
                .replace(/^Pergunta:\s*/i, '')
                .trim();
        } else {
            // ✅ fallback: primeira linha após o nível é a pergunta
            pergunta = lines[0] || '';
        }

        // ✅ Limpeza do enunciado: tira "Opções:" se vier colado
        pergunta = pergunta.replace(/^Opções:.*$/i, '').trim();

        // 3️⃣ Captura opções
        const optRegex = /^[1-4][)\.:\-]\s*(.+)$/;
        for (const l of lines) {
            if (optRegex.test(l)) {
                opcoes.push(l.replace(optRegex, '$1').trim());
            }
        }

        // 4️⃣ Garantia de exatamente 4 opções
        if (opcoes.length < 4) while (opcoes.length < 4) opcoes.push('');

        console.debug('[QUIZ PARSER] Nível extraído:', nivel);
        console.debug('[QUIZ PARSER] Pergunta extraída:', pergunta);
        console.debug('[QUIZ PARSER] Opções extraídas:', opcoes);

        return { nivel, pergunta, opcoes };
    } catch (e) {
        console.error('Parser error:', e);
        return { nivel: '', pergunta: '', opcoes: [] };
    }
}
});
