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

        // ====== Nível e tópicos recentes (progressão) ======
        const LEVELS = ["Fácil","Médio","Médio-Alto","Alto","Muito Alto","Especialista"];
        function getQuizLevel(){
            try { return localStorage.getItem('quiz_level') || 'Fácil'; } catch { return 'Fácil'; }
        }
        function setQuizLevel(lv){ try { localStorage.setItem('quiz_level', lv); } catch {} }
        function levelUp(lv){ const i = LEVELS.indexOf(lv); return LEVELS[Math.min(LEVELS.length-1, Math.max(0, i+1))] || lv; }
        function levelDown(lv){ const i = LEVELS.indexOf(lv); return LEVELS[Math.max(0, i-1)] || lv; }
        function getRecentTopics(){
            try { return JSON.parse(localStorage.getItem('quiz_recent_topics')||'[]'); } catch { return []; }
        }
        function pushRecentTopic(t){
            try {
                const arr = getRecentTopics();
                const norm = (t||'').toString().trim();
                if (norm){
                    // dedup + cap 10
                    const set = new Set([norm, ...arr]);
                    const next = Array.from(set).slice(0,10);
                    localStorage.setItem('quiz_recent_topics', JSON.stringify(next));
                }
            } catch {}
        }

        const currentLevel = getQuizLevel();
        const recentTopics = getRecentTopics();

        // ====== Instruções dinâmicas: nível + evitar tópicos recentes ======
        const dynamicHeader = [
            `Nível solicitado: ${currentLevel}.`,
            recentTopics.length ? `Evite repetir estes tópicos: ${recentTopics.join(', ')}.` : ''
        ].filter(Boolean).join('\n');

        const paramQuestion = {
            query: '`Gerar nova pergunta com outra temática diferente das anteriores.',
            model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
            effort: 'medium',
            max_output_tokens: 350,
            // Temperatura mais baixa para perguntas mais objetivas e consistentes
            temperature: 0.3,
            vector_store_names: (window.CONFIG?.OPENAI_RAGBOT ?? OPENAI_RAGBOT),
            instructions: `${dynamicHeader}\n\n${PROMPT_QUIZ_PERGUNTA}`,
            use_session: true,
            chat_id: chat_id
        };


   

        if (!quizData) {
            quizData = await call_llm({ ...paramQuestion, timeout_ms: 60000 });
        }

        // ====== Parser JSON-first com fallback ======
        function normalizeText(s){ return (s||'').toString().replace(/\s+/g,' ').trim(); }
        function tryParseJsonResponse(resp){
            try {
                // Try multiple sources: text, results[0].text, or direct string/object
                let raw = resp?.text ?? resp?.results?.[0]?.text ?? resp;
                if (typeof raw !== 'string') {
                    // If already object, return a shallow validated object
                    if (raw && typeof raw === 'object') return raw;
                    raw = '';
                }
                raw = String(raw).trim();
                // Remove code fences if present
                let block = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
                // Strip wrapping quotes if accidentally double-stringified
                if ((block.startsWith('"') && block.endsWith('"')) || (block.startsWith("'") && block.endsWith("'"))) {
                    try { block = JSON.parse(block); } catch { /* keep as is */ }
                    if (typeof block !== 'string') return (block && typeof block === 'object') ? block : null;
                }
                const obj = JSON.parse(block);
                return obj && typeof obj === 'object' ? obj : null;
            } catch { return null; }
        }
        function validateQuiz(json){
            try{
                if (!json) return false;
                const ops = Array.isArray(json.opcoes) ? json.opcoes.slice(0,4) : [];
                if (ops.length !== 4) return false;
                const norms = ops.map(o=>normalizeText(o)).filter(Boolean);
                if (norms.length !== 4) return false;
                // unicidade
                if (new Set(norms).size !== 4) return false;
                // tamanho balanceado (<=50% de diferença relativa) — relaxado para evitar falso negativo
                const lens = norms.map(x=>x.length);
                const min = Math.max(1, Math.min(...lens));
                const max = Math.max(...lens);
                if ((max - min)/min > 0.5) return false;
                // termos proibidos nas opções
                const banned = /(correta|errada|obviamente|claramente)\b/i;
                if (norms.some(t=>banned.test(t))) return false;
                // correta_index coerente
                const idx = Number(json.correta_index);
                if (!(idx>=1 && idx<=4)) return false;
                return true;
            }catch{ return false; }
        }

        // Qualidade adicional: simplicidade e anti-repetição
        function getRecentQuestions(){
            try { return JSON.parse(localStorage.getItem('quiz_recent_questions')||'[]'); } catch { return []; }
        }
        function pushRecentQuestion(q){
            try{
                const arr = getRecentQuestions();
                const norm = normalizeText(q);
                if (!norm) return;
                const set = new Set([norm, ...arr]);
                const next = Array.from(set).slice(0,20);
                localStorage.setItem('quiz_recent_questions', JSON.stringify(next));
            } catch {}
        }
        function getRecentOptions(){
            try { return JSON.parse(localStorage.getItem('quiz_recent_options')||'[]'); } catch { return []; }
        }
        function pushRecentOptions(opts){
            try{
                const prev = new Set(getRecentOptions());
                const next = Array.from(new Set([ ...opts.map(normalizeText).filter(Boolean), ...prev ])).slice(0,80);
                localStorage.setItem('quiz_recent_options', JSON.stringify(next));
            } catch {}
        }
        function qualityCheck(json){
            try{
                const q = normalizeText(json?.pergunta);
                const ops = Array.isArray(json?.opcoes) ? json.opcoes.map(normalizeText).filter(Boolean) : [];
                if (!q || ops.length!==4) return false;
                // limites de tamanho para simplicidade
                if (q.length > 240) return false;
                const lens = ops.map(x=>x.length);
                if (lens.some(L=>L<30 || L>220)) return false;
                // anti-repetição (pergunta e opções)
                const rq = new Set(getRecentQuestions());
                if (rq.has(q)) return false;
                const ro = new Set(getRecentOptions());
                // nenhuma opção recente pode se repetir
                if (ops.some(o=>ro.has(o))) return false;
                return true;
            } catch { return false; }
        }

        // Parse JSON e tente regenerar APENAS se não houver JSON utilizável
        let quizJson = tryParseJsonResponse(quizData);
        if (!quizJson){
            // tenta 1 regeneração somente quando não há JSON
            quizData = await call_llm({ ...paramQuestion, timeout_ms: 60000 });
            quizJson = tryParseJsonResponse(quizData);
        }

        // Caso haja JSON mas falhe qualidade (complexidade/repetição), tentar 1 regeneração com pista
        if (quizJson && !qualityCheck(quizJson)){
            const fixHeader = [
                dynamicHeader,
                'Atenção: não repetir pergunta nem opções recentes; focar em 1–2 conceitos; enunciado breve e direto; variar o tema.'
            ].filter(Boolean).join('\n');
            const retryParams = { ...paramQuestion, instructions: `${fixHeader}\n\n${PROMPT_QUIZ_PERGUNTA}` };
            quizData = await call_llm({ ...retryParams, timeout_ms: 60000 });
            const parsedRetry = tryParseJsonResponse(quizData);
            if (parsedRetry) quizJson = parsedRetry;
        }

        // ✅ Remover loading antes de mostrar pergunta
        if (typeof removeLoading === 'function') removeLoading(resultsDiv);

        let quizParsed;
        if (quizJson){
            quizParsed = {
                nivel: String(quizJson.nivel||'').trim(),
                pergunta: String(quizJson.pergunta||'').trim(),
                opcoes: Array.isArray(quizJson.opcoes) ? quizJson.opcoes.slice(0,4) : [],
                correta_index: Number(quizJson.correta_index||0),
                topico: String(quizJson.topico||'').trim()
            };
        } else {
            // fallback legacy parser
            quizParsed = parseQuizResponse(quizData);
        }
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

        // ====== Correção local (se houver gabarito JSON) + progressão de nível ======
        let isCorrect = null;
        try{
            if (quizParsed && typeof quizParsed.correta_index === 'number' && quizParsed.correta_index>=1 && quizParsed.correta_index<=4){
                const norms = opcoes.map(normalizeText);
                const pickedNorm = normalizeText(userAnswer);
                const pickedIdx = norms.findIndex(x=>x===pickedNorm) + 1; // 1..4
                if (pickedIdx>=1) {
                    isCorrect = (pickedIdx === quizParsed.correta_index);
                }
            }
        } catch {}

        // atualiza nível, tópicos e memória de repetição
        try {
            if (quizParsed?.topico) pushRecentTopic(quizParsed.topico);
            // memória de repetição
            pushRecentQuestion(quizParsed?.pergunta||'');
            pushRecentOptions(Array.isArray(quizParsed?.opcoes)?quizParsed.opcoes:[]);
            const lv = currentLevel;
            if (isCorrect === true) setQuizLevel(levelUp(lv));
            else if (isCorrect === false) setQuizLevel(levelDown(lv));
        } catch {}

        // ✅ Feedback automático pelo LLM
        insertLoading(resultsDiv, 'Analisando...');

        const respComment = await call_llm({
            query: 'Resposta do usuário: ' + userAnswer,
            model: (window.CONFIG?.MODEL_LLM ?? MODEL_LLM),
            temperature: (window.CONFIG?.TEMPERATURE ?? TEMPERATURE), // ✅ garantir fidelidade de avaliação
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
