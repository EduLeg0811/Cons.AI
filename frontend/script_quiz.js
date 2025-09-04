let controller = null;

document.addEventListener('DOMContentLoaded', () => {
    const resultsDiv   = document.getElementById('results');
    const searchButton = document.getElementById('quizButton');
  
    // Initialize download buttons
    window.downloadUtils.initDownloadButtons('quiz');

    searchButton.addEventListener('click', quiz);

    // Garante que nunca dispare submit se for parar dentro de <form>
    searchButton.setAttribute('type', 'button');



//______________________________________________________________________________________________
// Quiz
//______________________________________________________________________________________________
async function quiz() {

    
    // Save original button state for restoration
    const originalButtonState = {
        html: searchButton.innerHTML,
        opacity: searchButton.style.opacity,
        cursor: searchButton.style.cursor
    };

    // Se já estiver desabilitado, evita reentrância por clique/Enter
    if (searchButton?.disabled) return;

    // Desabilita e mostra "searching"
    searchButton.disabled = true;
    //searchButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';
    searchButton.style.opacity = '0.7';
    searchButton.style.cursor = 'not-allowed';

    // Cancela requisição anterior, se houver
    if (controller) controller.abort();
    controller = new AbortController();
    let timeoutId = null;
    timeoutId = setTimeout(() => controller.abort(), 30000); // 30s

    
    try {
        
        
        //Clear container at first
        resultsDiv.innerHTML = '';
        

        // _________________________________________________________________________________        
        // 1. Primeira Interação
        // _________________________________________________________________________________           
        insertLoading(resultsDiv, "Formulando pergunta...");

        
        //call_llm   
        //***************************************************************************************** 
        const chat_id = getOrCreateChatId();

        let paramRAGbot = {
            query: "Formule uma nova pergunta sobre Conscienciologia. Não repita perguntas anteriores nem aborde temas semelhantes em sequência.",
            model: MODEL_LLM,
            temperature: TEMPERATURE,
            vector_store_names: OPENAI_RAGBOT,
            instructions: PROMPT_QUIZ_PERGUNTA,
            use_session: true,
            chat_id                     // <<< NOVO
        };

        console.log('*********paramRAGbot', paramRAGbot);

        let quizData = await call_llm(paramRAGbot);
        if (quizData.chat_id) localStorage.setItem('cons_chat_id', quizData.chat_id); // <<< NOVO
        
        //***************************************************************************************** 
    
        console.log('*********quizData', quizData);
                
        // Display results
        removeLoading(resultsDiv);

        const quizParsed = parseQuizResponse(quizData) || { pergunta: '', opcoes: [] };
        let pergunta = quizParsed.pergunta || '';
        let opcoes   = Array.isArray(quizParsed.opcoes) ? quizParsed.opcoes : [];

        console.log('*********quizParsed', quizParsed);

        // Renderiza via display.js
        displayResults(resultsDiv, { pergunta, opcoes }, 'quiz');


        // Loop de interação: aguarda resposta
        // aguarda a resposta do usuário (clique em alguma opção)
        while (true) {
            // Aguarda a resposta do usuario (clique em alguma opcao) - captura localmente
            const userAnswer = await new Promise((resolve) => {
                const onClick = (ev) => {
                    const btn = ev.target.closest('.quiz-badge-btn');
                    if (!btn) return; // ignora cliques fora dos botoes
                    const row = btn.closest('.quiz-option-row');
                    const txtEl = row?.querySelector('.quiz-option-text');
                    const ans = (txtEl?.textContent || '').trim();
                    resultsDiv.removeEventListener('click', onClick);
                    resolve(ans);
                };
                resultsDiv.addEventListener('click', onClick);
            });

            console.log('*********userAnswer', userAnswer);

            insertLoading(resultsDiv, 'Analisando resposta...');

            // call_llm
            //***************************************************************************************** 
            let param = {
                query: 'Resposta do usuario: ' + userAnswer,
                model: MODEL_LLM,
                temperature: TEMPERATURE,
                vector_store_names: OPENAI_RAGBOT,
                instructions: PROMPT_QUIZ_RESPOSTA,
                use_session: true,
                chat_id
            };

            console.log('*********param', param);

            const respData = await call_llm(param);
            //***************************************************************************************** 

            console.log('*********respData', respData);

            if (respData?.chat_id) {
                localStorage.setItem('cons_chat_id', respData.chat_id);
            }
            removeLoading(resultsDiv);
            displayResults(resultsDiv, respData, 'ragbot');

            
            // Reabilita o botão "Pergunta" após exibir o comentário
            if (searchButton) {
                searchButton.disabled = false;
                searchButton.innerHTML = originalButtonState.html;
                searchButton.style.opacity = originalButtonState.opacity;
                searchButton.style.cursor = originalButtonState.cursor;
            }
        }

    } catch (error) {
        console.error('Error in quiz:', error);
        resultsDiv.innerHTML = `<div class="error"><p>${error.message || 'An unexpected error occurred'}</p></div>`;
        } finally {
            // Re-enable the search button and restore original state
            if (searchButton) {
                searchButton.disabled = false;
                searchButton.innerHTML = originalButtonState.html;
                searchButton.style.opacity = originalButtonState.opacity;
                searchButton.style.cursor = originalButtonState.cursor;
                }
        clearTimeout(timeoutId);
        controller = null;        
    }

}

});






//______________________________________________________________________________________________
// Parseia a resposta do LLM em "pergunta" e 4 "opções"
// Otimizado para formatos comuns: linhas (A/B/C/D ou 1/2/3/4) e inline com ponto-e-vírgula.
//______________________________________________________________________________________________
function parseQuizResponse(response) {
    
    
    
    // Parseia a resposta do LLM em "pergunta" e 4 "opções"
    // Otimizado para formatos comuns: linhas (A/B/C/D ou 1/2/3/4) e inline com ponto-e-vírgula.
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

            // Garante exatamente 4 itens (preenche com vazios se faltar)
            if (opcoes.length < 4) {
                while (opcoes.length < 4) opcoes.push('');
            } else if (opcoes.length > 4) {
                opcoes = opcoes.slice(0, 4);
            }

            // Expõe para uso posterior (próximo TODO)
            console.debug('[quiz] Pergunta extraída:', pergunta);
            console.debug('[quiz] Opções extraídas:', opcoes);


            return {pergunta, opcoes};
            
            

        } catch (e) {
            console.warn('Falha ao parsear quiz do LLM:', e);
            return { pergunta: '', opcoes: [] };
        }


    }

