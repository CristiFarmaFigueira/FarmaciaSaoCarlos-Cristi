        // config.js (local) traz ADMIN_CODE + Master Key. No site público usamos só leitura embutida.
        const cfg = window.FARMA_CONFIG || {};
        const ADMIN_CODE = cfg.ADMIN_CODE || "";
        let isAdminMode = false;

        /*
         * ESTRUTURA DE BINS (JSONBin ~100k limite):
         *  SETTINGS_BIN_ID     → configurações da loja + ofertasAtivas
         *  PRODUCT_BIN_IDS[0..2] → catálogo fragmentado (parte1, parte2, parte3)
         *  PRODUCT_BIN_IDS[3]  → produtos NOVOS adicionados pelo admin
         *  (pesquisas e interações/leads NÃO são salvas — privacidade)
         */
        const SETTINGS_BIN_ID = cfg.SETTINGS_BIN_ID || cfg.BIN_ID || "";
        const PRODUCT_BIN_IDS = Array.isArray(cfg.PRODUCT_BIN_IDS) ? cfg.PRODUCT_BIN_IDS.filter(Boolean) : [];
        const READ_KEY = cfg.READ_KEY || "$2a$10$dQffhe9BXf4uBkEK0qmT2.QmWVjdjkIb/ob.Sh.q.8V6gJMuawnDi";
        const API_KEY = cfg.API_KEY || "";
        // Compat: BIN_ID aponta para settings (código antigo)
        const BIN_ID = SETTINGS_BIN_ID;
        if (!SETTINGS_BIN_ID) {
            console.error("FARMA: SETTINGS_BIN_ID ausente no config.js");
        }
        if (!PRODUCT_BIN_IDS.length) {
            console.warn("FARMA: PRODUCT_BIN_IDS vazio — catálogo pode ficar sem produtos.");
        }

        function montarPayloadSettings() {
            return {
                ofertasAtivas: !!globalState.ofertasAtivas,
                settings: Object.assign({}, defaultSettings, globalState.settings || {})
            };
        }
        /** Compat legado */
        function montarPayloadPublico() {
            return Object.assign({}, montarPayloadSettings(), {
                products: Array.isArray(globalState.products) ? globalState.products : []
            });
        }
        /**
         * Distribui produtos nos bins:
         * - bins 0..N-2 = catálogo estável (partes originais)
         * - último bin  = produtos NOVOS (ids que não estavam no snapshot inicial + qualquer overflow)
         * Na prática: divide em (PRODUCT_BIN_IDS.length) fatias iguais.
         */
        function dividirProdutosEmBins() {
            var all = Array.isArray(globalState.products) ? globalState.products.slice() : [];
            var nBins = PRODUCT_BIN_IDS.length || 1;
            if (nBins <= 1) return [all];
            var size = Math.ceil(all.length / nBins) || 1;
            var chunks = [];
            for (var i = 0; i < all.length; i += size) {
                chunks.push(all.slice(i, i + size));
            }
            while (chunks.length < nBins) chunks.push([]);
            return chunks.slice(0, nBins);
        }
        async function fetchBinRecord(binId, headers) {
            if (!binId) return null;
            try {
                var r = await fetch('https://api.jsonbin.io/v3/b/' + binId + '/latest', { headers: headers });
                if (!r.ok) return null;
                var d = await r.json();
                return d && d.record ? d.record : null;
            } catch (e) {
                return null;
            }
        }
        async function putBin(binId, body) {
            if (!binId || !API_KEY) return false;
            try {
                var r = await fetch('https://api.jsonbin.io/v3/b/' + binId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
                    body: JSON.stringify(body)
                });
                return r.ok;
            } catch (e) {
                return false;
            }
        }
        /** Remove do stats termos que são o código de admin ou prefixos dele */
        function sanitizarSearchStats(stats) {
            const out = {};
            const code = (ADMIN_CODE || "").toLowerCase().trim();
            Object.keys(stats || {}).forEach(function(k) {
                const key = String(k).toLowerCase().trim();
                if (!key) return;
                if (code && (code === key || code.indexOf(key) === 0 || key.indexOf(code) === 0)) return;
                out[key] = stats[k];
            });
            return out;
        }
        function aplicarRecordPublico(record) {
            if (!record) return;
            if (Array.isArray(record.products)) globalState.products = record.products;
            if (typeof record.ofertasAtivas === "boolean") globalState.ofertasAtivas = record.ofertasAtivas;
            if (record.settings) globalState.settings = Object.assign({}, defaultSettings, record.settings);
        }

        // Escapa texto para evitar XSS ao usar innerHTML (corrige alertas CodeQL)
        function escapeHtml(str) {
            if (str == null) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // Cache local só com dados de catálogo (sem settings/leads — evita alerta de storage sensível)
        function salvarCacheLocal() {
            try {
                const cache = {
                    products: globalState.products || [],
                    ofertasAtivas: !!globalState.ofertasAtivas
                };
                localStorage.setItem('farma_sao_carlos_cache', JSON.stringify(cache));
            } catch (e) {}
        }
        function lerCacheLocal() {
            try {
                return JSON.parse(localStorage.getItem('farma_sao_carlos_cache') || 'null');
            } catch (e) { return null; }
        }

        const defaultProducts = [
            { id: "p1", name: "Paracetamol 500mg", type: "medicamento", lab: "EMS", categories: ["Analgésico", "Antitérmico"], image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=150&auto=format&fit=crop&q=80", purpose: "Redução da febre e alívio de dores leves a moderadas.", usage: "Adultos: 1 a 2 comprimidos, 3 a 4 vezes ao dia.", sideEffects: "Raramente causa efeitos colaterais.", price: "12,90", discountType: "none", discountValue: "", isOffer: false, status: "disponivel", requiresRx: false },
            { id: "p2", name: "Dipirona Monoidratada 500mg", type: "medicamento", lab: "Cimed", categories: ["Analgésico", "Antitérmico"], image: "https://images.unsplash.com/photo-1550572017-edd951b55104?w=150&auto=format&fit=crop&q=80", purpose: "Potente analgésico e antitérmico para febre e dores moderadas.", usage: "Adultos: 1 a 2 comprimidos até 4 vezes ao dia.", sideEffects: "Queda de pressão arterial em infusão rápida.", price: "9,90", discountType: "none", discountValue: "", isOffer: false, status: "disponivel", requiresRx: false },
            { id: "p2b", name: "Novalgina 1g", type: "medicamento", lab: "Novalgina", categories: ["Analgésico", "Antitérmico"], image: "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=150&auto=format&fit=crop&q=80", purpose: "Alívio de dores fortes e febre.", usage: "1 comprimido ao dia conforme orientação.", sideEffects: "Uso conforme bula.", price: "18,90", discountType: "none", discountValue: "", isOffer: false, status: "disponivel", requiresRx: false },
            { id: "p3", name: "Shampoo Hidratante Profissional", type: "geral", lab: "Dove", categories: ["Cabelos", "Higiene Pessoal"], image: "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=150&auto=format&fit=crop&q=80", purpose: "Limpeza suave e hidratação intensa para cabelos secos.", usage: "Aplicar nos cabelos molhados, massagear e enxaguar.", sideEffects: "Uso externo. Evitar contato com os olhos.", price: "24,90", discountType: "percent", discountValue: "15", isOffer: true, status: "disponivel", requiresRx: false },
            { id: "p4", name: "Hidratante Corporal Intensivo", type: "geral", lab: "Nivea", categories: ["Skincare / Hidratante"], image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=150&auto=format&fit=crop&q=80", purpose: "Nutrição profunda por 48 horas com textura leve.", usage: "Espalhar por todo o corpo massageando suavemente.", sideEffects: "Uso externo.", price: "29,90", discountType: "value", discountValue: "5,00", isOffer: true, status: "disponivel", requiresRx: false }
        ];

        const defaultSettings = {
            nomeLoja: "Farmácia São Carlos - Cristi",
            slogan: "Sua saúde e bem-estar em primeiro lugar.",
            endereco: "Rua Zinea, 40 - Centro, Figueira - PR",
            telefone: "(43) 3547-1551",
            whatsapp: "554335471551",
            email: "cristifarmafigueira@gmail.com",
            horarioSemana: "08:00-18:00",
            horarioSabado: "08:00-12:00",
            horarioDomingo: "Fechado",
            farmaceutico: "Farmacêutico Responsável",
            crf: "CRF-PR a informar",
            mapaEmbed: "https://maps.google.com/maps?q=Rua+Zinea+40+Figueira+PR&output=embed",
            mapaLink: "https://www.google.com/maps/search/?api=1&query=Rua+Zinea+40+Figueira+PR",
            sobre: "A Farmácia São Carlos - Cristi cuida da sua família com respeito, preço justo e tradição em Figueira-PR.",
            faq: [
                {q: "Preciso de receita?", a: "Medicamentos de controle especial exigem receita. O site indica quando a receita é obrigatória."},
                {q: "Como faço um pedido?", a: "Adicione ao carrinho ou clique em Pedir pelo WhatsApp. Retire na loja ou solicite entrega (consulte condições)."},
                {q: "Qual o horário de funcionamento?", a: "Segunda a sexta das 08h às 18h e sábado das 08h às 12h."},
                {q: "Vocês entregam?", a: "Sim, consulte disponibilidade e condições pelo WhatsApp. Não há taxa de entrega automática no site."}
            ],
            politicaPrivacidade: "Coletamos apenas dados necessários para atendimento (ex.: interações no site e pedidos via WhatsApp). Não vendemos seus dados. Para exercer direitos da LGPD, contate-nos pelo e-mail ou WhatsApp.",
            termosUso: "As informações do site são orientativas e não substituem consulta médica ou farmacêutica. Preços e estoque sujeitos a alteração. Pedidos são confirmados com a farmácia.",
            politicaTroca: "Trocas e devoluções seguem o Código de Defesa do Consumidor e orientação do farmacêutico, especialmente para medicamentos.",
            gaId: "",
            entregaAtiva: true,
            retiradaAtiva: true,
            msgAvisoLegal: "As informações deste site têm caráter informativo e não substituem orientações médicas ou farmacêuticas."
        };

        let globalState = {
            ofertasAtivas: true,
            products: defaultProducts,
            settings: JSON.parse(JSON.stringify(defaultSettings))
        };

        // Carrinho: [{id, qty}]  Favoritos e recentes
        let cart = JSON.parse(localStorage.getItem('farma_cart') || '[]');
        if (cart.length && typeof cart[0] === 'string') {
            cart = cart.map(function(id) { return { id: id, qty: 1 }; });
        }
        let favorites = JSON.parse(localStorage.getItem('farma_favorites') || '[]');
        let recentlyViewed = JSON.parse(localStorage.getItem('farma_recent') || '[]');
        let pedidoTipo = localStorage.getItem('farma_pedido_tipo') || 'retirada';

        // Paginação: 30 produtos por vez
        const PAGE_SIZE = 30;
        const PLACEHOLDER_IMG = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 96 96%22%3E%3Crect fill=%22%23f3f4f6%22 width=%2296%22 height=%2296%22/%3E%3C/svg%3E';
        let pageState = { meds: PAGE_SIZE, gerais: PAGE_SIZE, results: PAGE_SIZE };
        let cachedLists = { meds: [], gerais: [], results: [] };

        function debounce(fn, wait) {
            var t = null;
            return function() {
                var ctx = this, args = arguments;
                clearTimeout(t);
                t = setTimeout(function() { fn.apply(ctx, args); }, wait);
            };
        }

        async function carregarDadosNuvem() {
            try {
                const headers = {};
                if (API_KEY) headers['X-Master-Key'] = API_KEY;
                else headers['X-Access-Key'] = READ_KEY;

                // 1) Configurações da loja
                var recSettings = await fetchBinRecord(SETTINGS_BIN_ID, headers);
                if (recSettings) {
                    if (typeof recSettings.ofertasAtivas === 'boolean') globalState.ofertasAtivas = recSettings.ofertasAtivas;
                    if (recSettings.settings) globalState.settings = Object.assign({}, defaultSettings, recSettings.settings);
                    // compat: se settings bin ainda tiver products misturados
                    if (Array.isArray(recSettings.products) && recSettings.products.length) {
                        globalState.products = recSettings.products.slice();
                    }
                }

                // 2) Todos os bins de produtos (parte1..3 + novos)
                var merged = [];
                var seenIds = {};
                for (var bi = 0; bi < PRODUCT_BIN_IDS.length; bi++) {
                    var recP = await fetchBinRecord(PRODUCT_BIN_IDS[bi], headers);
                    if (recP && Array.isArray(recP.products)) {
                        recP.products.forEach(function(p) {
                            if (p && p.id && !seenIds[p.id]) {
                                seenIds[p.id] = true;
                                merged.push(p);
                            }
                        });
                    }
                }
                if (merged.length) globalState.products = merged;

                // Interações/leads e pesquisas NÃO são carregadas (privacidade)

                try { aplicarConfiguracoesNaUI(); } catch(e) {}
                salvarCacheLocal();
                // Só re-renderiza a UI se os dados mudaram (evita travar o scroll a cada polling)
                var fp = (globalState.products || []).length + '|' + (globalState.products || []).map(function(p){ return p.id + (p.updatedAt||'') + (p.status||'') + (p.price||''); }).join(',');
                if (fp !== window.__farmaLastFp) {
                    window.__farmaLastFp = fp;
                    atualizarTudoNaTela();
                }
            } catch (e) {
                console.log('FARMA: falha nuvem, usando cache local', e);
                const local = lerCacheLocal();
                if (local && Array.isArray(local.products)) {
                    globalState.products = local.products;
                    if (typeof local.ofertasAtivas === 'boolean') globalState.ofertasAtivas = local.ofertasAtivas;
                    atualizarTudoNaTela();
                }
            }
        }

        async function salvarDadosNuvem() {
            salvarCacheLocal();
            if (!API_KEY) {
                console.log("FARMA: sem Master Key — alterações ficam só neste navegador.");
                return;
            }
            try {
                // 1) Configurações
                if (SETTINGS_BIN_ID) {
                    var okS = await putBin(SETTINGS_BIN_ID, montarPayloadSettings());
                    if (!okS) console.log('Aviso: falha ao salvar bin de configurações.');
                }

                // 2) Produtos distribuídos nos 4 bins
                var chunks = dividirProdutosEmBins();
                for (var bi = 0; bi < PRODUCT_BIN_IDS.length; bi++) {
                    var okP = await putBin(PRODUCT_BIN_IDS[bi], { products: chunks[bi] || [] });
                    if (!okP) console.log('Aviso: falha ao salvar bin de produtos', PRODUCT_BIN_IDS[bi]);
                }

                // Interações/leads e pesquisas NÃO são salvas (privacidade)
            } catch (e) {
                console.log('Modo local ativo.', e);
            }
        }

        const searchInput = document.getElementById('searchInput');
        const resultsContainer = document.getElementById('resultsContainer');
        const catalogoGrid = document.getElementById('catalogoGrid');
        const catalogoGeralGrid = document.getElementById('catalogoGeralGrid');
        // (removido: catalogoIndisponiveisGrid — elemento inexistente)
        const ofertasGrid = document.getElementById('ofertasGrid');
        const ofertasSection = document.getElementById('ofertasSection');
        const navOfertasLink = document.getElementById('navOfertasLink');
        const navOfertasMobile = document.getElementById('navOfertasMobile');
        const categoryFilter = document.getElementById('categoryFilter');
        const labFilter = document.getElementById('labFilter');
        const categoryFilterGeral = document.getElementById('categoryFilterGeral');
        const brandFilter = document.getElementById('brandFilter');
        const clearBtn = document.getElementById('clearBtn');
        const adminBadge = document.getElementById('adminBadge');
        const adminModal = document.getElementById('adminModal');
        const painelIndisponiveis = document.getElementById('painelIndisponiveis');
        const indisponiveisGrid = document.getElementById('indisponiveisGrid');
        const countIndisponiveis = document.getElementById('countIndisponiveis');
        const deleteConfirmModal = document.getElementById('deleteConfirmModal');
        const txtStatusOfertas = document.getElementById('txtStatusOfertas');
        const ofertaAdminContainer = document.getElementById('ofertaAdminContainer');
        const prodTypeSelect = document.getElementById('prodType');
        const labelFabricante = document.getElementById('labelFabricante');
        const rxContainer = document.getElementById('rxContainer');
        const categoriesCheckboxGroup = document.getElementById('categoriesCheckboxGroup');
        const filtroEsgotados = document.getElementById('filtroEsgotados');

        const categoriasMedicamento = [
            "Analgésico", "Antitérmico", "Anti-inflamatório", "Relaxante Muscular",
            "Protetor Gástrico", "Antigases", "Antiespasmódico", "Tosse e Resfriado",
            "Antialérgico", "Antibiótico", "Anti-hipertensivo", "Antidiabético",
            "Redutor de Colesterol", "Vitamina / Suplemento", "Náusea e Vômito",
            "Antidiarreico", "Repositor de Flora / Probiótico", "Antifúngico",
            "Dermatológico / Uso Tópico", "Colírio / Oftálmico", "Contraceptivo",
            "Calmante / Ansiolítico", "Outros Medicamentos"
        ];
        const categoriasGeral = [
            "Higiene Pessoal", "Cabelos", "Anticaspa / Caspa", "Skincare / Hidratante",
            "Cuidados com a Pele", "Acne / Oleosidade", "Maquiagem", "Perfumaria",
            "Infantil", "Proteção Solar", "Higiene Bucal",
            "Desodorante / Antitranspirante", "Unhas", "Outros"
        ];

        function atualizarOpcoesCategoriasModal() {
            if (!prodTypeSelect || !categoriesCheckboxGroup) return;
            const tipo = prodTypeSelect.value;
            categoriesCheckboxGroup.innerHTML = '';
            const questionnaireContainer = document.getElementById('questionnaireContainer');
            if (tipo === 'medicamento') {
                if (labelFabricante) labelFabricante.innerText = "Laboratório *";
                if (rxContainer) rxContainer.classList.remove('hidden');
                if (questionnaireContainer) questionnaireContainer.classList.remove('hidden');
                categoriasMedicamento.forEach(cat => {
                    categoriesCheckboxGroup.innerHTML += '<label class="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">'
                        + '<input type="checkbox" name="prodCat" value="' + escapeHtml(cat) + '" class="w-4 h-4 text-brandBlue rounded border-gray-300"> ' + escapeHtml(cat)
                        + '</label>';
                });
            } else {
                if (labelFabricante) labelFabricante.innerText = "Marca *";
                if (rxContainer) rxContainer.classList.add('hidden');
                if (questionnaireContainer) questionnaireContainer.classList.add('hidden');
                const reqRx = document.getElementById('prodRequiresRx');
                if (reqRx) reqRx.checked = false;
                const hasQ = document.getElementById('prodHasQuestionnaire');
                if (hasQ) hasQ.checked = false;
                const qEditor = document.getElementById('questionnaireEditor');
                if (qEditor) qEditor.classList.add('hidden');
                categoriasGeral.forEach(cat => {
                    categoriesCheckboxGroup.innerHTML += '<label class="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">'
                        + '<input type="checkbox" name="prodCat" value="' + escapeHtml(cat) + '" class="w-4 h-4 text-amber-600 rounded border-gray-300"> ' + escapeHtml(cat)
                        + '</label>';
                });
            }
        }

        function popularFiltrosLaboratoriosEMarcas() {
            if (!labFilter || !brandFilter) return;

            const labAtual = labFilter.value;
            const marcaAtual = brandFilter.value;

            // Extrair laboratórios únicos de medicamentos
            const labs = [...new Set(globalState.products.filter(p => p.type === 'medicamento' && p.lab).map(p => p.lab.trim()))].sort();
            labFilter.innerHTML = `<option value="TODOS">Todos os Laboratórios</option>`;
            labs.forEach(l => {
                labFilter.innerHTML += '<option value="' + escapeHtml(l) + '">' + escapeHtml(l) + '</option>';
            });
            if ([...labFilter.options].some(o => o.value === labAtual)) {
                labFilter.value = labAtual;
            }

            // Extrair marcas únicas de cuidados pessoais/geral
            const brands = [...new Set(globalState.products.filter(p => p.type === 'geral' && p.lab).map(p => p.lab.trim()))].sort();
            brandFilter.innerHTML = `<option value="TODOS">Todas as Marcas</option>`;
            brands.forEach(b => {
                brandFilter.innerHTML += '<option value="' + escapeHtml(b) + '">' + escapeHtml(b) + '</option>';
            });
            if ([...brandFilter.options].some(o => o.value === marcaAtual)) {
                brandFilter.value = marcaAtual;
            }
        }

        const micBtn = document.getElementById('micBtn');
        const micIcon = document.getElementById('micIcon');
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        let recognition = null;

        if (SpeechRecognition) {
            recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.lang = 'pt-BR'; 
            recognition.interimResults = false;

            recognition.onstart = function() {
                if (micIcon) {
                    micIcon.classList.remove('fa-microphone', 'text-brandBlue');
                    micIcon.classList.add('fa-microphone-lines', 'text-red-500', 'animate-pulse');
                }
                if (searchInput) searchInput.placeholder = "A ouvir... Fale agora!";
            };

            recognition.onresult = function(event) {
                const transcript = event.results[0][0].transcript;
                sintomasAtivos = [];
                atualizarVisualSintomas();
                if (searchInput) searchInput.value = transcript;
                renderResults(transcript);
            };

            recognition.onerror = function(event) {
                console.error("Erro no reconhecimento de voz:", event.error);
            };

            recognition.onend = function() {
                if (micIcon) {
                    micIcon.classList.remove('fa-microphone-lines', 'text-red-500', 'animate-pulse');
                    micIcon.classList.add('fa-microphone', 'text-brandBlue');
                }
                if (searchInput) searchInput.placeholder = "Pesquise por nome do produto, laboratório, marca...";
            };
        } else {
            if(micBtn) micBtn.style.display = 'none';
        }

        window.iniciarReconhecimentoVoz = function() {
            if (recognition) {
                try { recognition.start(); } catch (e) { }
            } else {
                alert("O seu navegador não suporta pesquisa por voz.");
            }
        };

        const normalizeString = (str) => {
            return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
        };

        // Mapeamento inteligente: categorias prioritárias + palavras-chave de produtos
        // Um produto entra na busca rápida se tiver pelo menos 1 categoria listada OU bater em keyword do nome
        const mapeamentoSintomas = {
            // ===== SINTOMAS / MEDICAMENTOS =====
            "dor de cabeca": {
                categorias: ["Analgésico"],
                keywords: ["dipirona", "paracetamol", "neosaldina", "tylenol", "ibuprofeno", "novalgina", "dor de cabeça", "cefaleia"],
                // Bloqueia antiespasmódicos/antigases mesmo se também forem analgésicos
                bloquearSempreSeTem: ["Antiespasmódico", "Antigases"]
            },
            "enxaqueca": {
                categorias: ["Analgésico"],
                keywords: ["dipirona", "paracetamol", "neosaldina", "tylenol", "ibuprofeno", "enxaqueca"],
                bloquearSempreSeTem: ["Antiespasmódico", "Antigases"]
            },
            "febre": {
                categorias: ["Antitérmico"],
                keywords: ["paracetamol", "dipirona", "ibuprofeno", "novalgina", "febre"]
            },
            "inflamacao": {
                categorias: ["Anti-inflamatório"],
                keywords: ["nimesulida", "ibuprofeno", "diclofenaco", "torsilax", "cataflam", "inflamação"]
            },
            "inflamado": {
                categorias: ["Anti-inflamatório"],
                keywords: ["nimesulida", "ibuprofeno", "diclofenaco", "torsilax", "cataflam"]
            },
            "dor": {
                categorias: ["Analgésico", "Anti-inflamatório", "Relaxante Muscular"],
                keywords: ["dipirona", "paracetamol", "ibuprofeno", "dorflex", "torsilax"]
            },
            "dor muscular": {
                categorias: ["Relaxante Muscular", "Anti-inflamatório", "Analgésico"],
                keywords: ["dorflex", "torsilax", "ibuprofeno", "diclofenaco", "muscular"]
            },
            "alergia": {
                categorias: ["Antialérgico"],
                keywords: ["loratadina", "polaramine", "desloratadina", "alergia", "antialérgico"]
            },
            "alergico": {
                categorias: ["Antialérgico"],
                keywords: ["loratadina", "polaramine", "desloratadina"]
            },
            "azia": {
                categorias: ["Protetor Gástrico"],
                keywords: ["omeprazol", "pantoprazol", "estomazil", "azia", "queimação"]
            },
            "queimacao": {
                categorias: ["Protetor Gástrico"],
                keywords: ["omeprazol", "pantoprazol", "estomazil"]
            },
            "estomago": {
                categorias: ["Protetor Gástrico", "Antigases"],
                keywords: ["omeprazol", "pantoprazol", "simeticona", "estomazil"]
            },
            "tosse": {
                categorias: ["Tosse e Resfriado"],
                keywords: ["xarope", "bisolvon", "tosse", "resfriado", "gripe"]
            },
            "garganta": {
                categorias: ["Anti-inflamatório", "Tosse e Resfriado"],
                keywords: ["nimesulida", "ibuprofeno", "garganta", "amigdala"]
            },
            "colica": {
                // Só Analgésico e/ou Antigases e/ou Antiespasmódico.
                // NÃO entra se for basicamente antitérmico (ex: Paracetamol só para febre+dor genérica).
                categorias: ["Analgésico", "Antigases", "Antiespasmódico"],
                keywords: ["buscopan", "simeticona", "cólica", "colica", "espasmolítico", "luftal", "atoveran"],
                // Se tiver Antitérmico e NÃO tiver Antigases nem Antiespasmódico → exclui
                bloquearSeTemCategoriaSemOutras: {
                    bloqueio: "Antitérmico",
                    salvaCom: ["Antigases", "Antiespasmódico"]
                }
            },
            "nausea": {
                categorias: ["Náusea e Vômito"],
                keywords: ["dramamine", "plasil", "vonau", "náusea", "enjoo"]
            },
            "vomito": {
                categorias: ["Náusea e Vômito"],
                keywords: ["dramamine", "plasil", "vonau", "vômito"]
            },
            "diarreia": {
                categorias: ["Antidiarreico", "Repositor de Flora / Probiótico"],
                keywords: ["imodium", "floratil", "smecta", "diarreia", "probiótico", "flora"]
            },
            "gripe": {
                categorias: ["Tosse e Resfriado", "Antitérmico", "Analgésico"],
                keywords: ["resfenol", "cimegripe", "benegrip", "gripe", "resfriado"]
            },
            "pressao": {
                categorias: ["Anti-hipertensivo"],
                keywords: ["losartana", "enalapril", "captopril", "pressão", "hipertensão"]
            },
            "diabetes": {
                categorias: ["Antidiabético"],
                keywords: ["metformina", "glifage", "diabetes", "glicemia"]
            },
            "colesterol": {
                categorias: ["Redutor de Colesterol"],
                keywords: ["sinvastatina", "atorvastatina", "colesterol"]
            },
            "insonia": {
                categorias: ["Calmante / Ansiolítico"],
                keywords: ["melatonina", "calmante", "insônia", "sono"]
            },
            "vitamina": {
                categorias: ["Vitamina / Suplemento"],
                keywords: ["vitamina", "suplemento", "centrum", "energil", "polivitamínico"]
            },
            "fungo": {
                categorias: ["Antifúngico", "Dermatológico / Uso Tópico"],
                keywords: ["canesten", "cetoconazol", "fungo", "micose"]
            },
            "ferida": {
                categorias: ["Dermatológico / Uso Tópico"],
                keywords: ["nebacetin", "cicatrizante", "ferida", "corte"]
            },

            // ===== PELE, CABELO E CUIDADOS =====
            "problema de pele": {
                categorias: ["Skincare / Hidratante", "Cuidados com a Pele", "Dermatológico / Uso Tópico", "Acne / Oleosidade"],
                keywords: ["dermatite", "pele sensível", "problema de pele", "erupção", "vermelhidão"],
                // Nunca trazer produtos só de cabelo
                excluirCategorias: ["Cabelos", "Anticaspa / Caspa"],
                excluirKeywordsNoNome: ["shampoo", "condicionador", "cabelo"]
            },
            "dermatite": {
                categorias: ["Cuidados com a Pele", "Skincare / Hidratante", "Dermatológico / Uso Tópico"],
                keywords: ["dermatite", "hipoalergênico", "pele sensível"],
                excluirCategorias: ["Cabelos", "Anticaspa / Caspa"],
                excluirKeywordsNoNome: ["shampoo", "condicionador", "cabelo"]
            },
            "pele seca": {
                categorias: ["Skincare / Hidratante", "Cuidados com a Pele"],
                keywords: ["pele seca", "hidratante corporal", "hidratante facial", "neutrogena", "cerave"],
                excluirCategorias: ["Cabelos", "Anticaspa / Caspa"],
                excluirKeywordsNoNome: ["shampoo", "condicionador", "cabelo"]
            },
            "acne": {
                categorias: ["Acne / Oleosidade", "Cuidados com a Pele", "Skincare / Hidratante"],
                keywords: ["acne", "espinha", "oleosidade", "sabonete facial"]
            },
            "queda de cabelo": {
                // Só produtos voltados a queda — não qualquer shampoo
                categorias: ["Cabelos"],
                keywords: ["queda", "antiqueda", "antiquéda", "capilar", "tônico capilar", "tonico capilar"],
                exigirKeywordOuCategoriaEspecifica: true,
                // Se só tiver categoria Cabelos genérica, exige keyword de queda no nome/indicação
                soCategoriaGenericaExigeKeyword: {
                    categoriaGenerica: "Cabelos",
                    keywordsObrigatorias: ["queda", "antiqueda", "antiquéda", "tônico", "tonico", "capilar"]
                }
            },
            "cabelo oleoso": {
                categorias: ["Cabelos"],
                keywords: ["oleoso", "antioleosidade", "óleo", "oleosidade"],
                soCategoriaGenericaExigeKeyword: {
                    categoriaGenerica: "Cabelos",
                    keywordsObrigatorias: ["oleoso", "antioleosidade", "óleo", "oleosidade"]
                }
            },
            "caspa": {
                // NÃO usa Cabelos genérico — só Anticaspa ou keyword caspa
                categorias: ["Anticaspa / Caspa"],
                keywords: ["caspa", "anticaspa", "caspan", "head & shoulders", "clear men"]
            },
            "protecao solar": {
                categorias: ["Proteção Solar"],
                keywords: ["protetor solar", "fps", "solar", "sun"]
            },
            "higiene bucal": {
                categorias: ["Higiene Bucal"],
                keywords: ["pasta de dente", "enxaguante", "fio dental", "escova", "bucal"]
            },
            "desodorante": {
                categorias: ["Desodorante / Antitranspirante"],
                keywords: ["desodorante", "antitranspirante"]
            },
            "unhas": {
                categorias: ["Unhas"],
                keywords: ["esmalte", "unha", "cutícula", "base"]
            },
            "infantil": {
                categorias: ["Infantil"],
                keywords: ["bebê", "bebe", "infantil", "fralda", "pomada", "johnson"]
            }
        };

        function produtoCorrespondeSintoma(product, sintomaKey) {
            const mapa = mapeamentoSintomas[sintomaKey];
            if (!mapa) return false;
            const cats = Array.isArray(product.categories) ? product.categories : [];
            const nomeNorm = normalizeString(product.name || '');
            const texto = normalizeString(
                (product.name || '') + ' ' + (product.purpose || '') + ' ' + (product.lab || '')
            );

            // Bloqueio absoluto por categoria (ex: Buscopan não entra em dor de cabeça)
            if (mapa.bloquearSempreSeTem && mapa.bloquearSempreSeTem.some(function(c) { return cats.includes(c); })) {
                return false;
            }

            // Exclusões por categoria (ex: não misturar cabelo em problema de pele)
            if (mapa.excluirCategorias && mapa.excluirCategorias.some(function(c) { return cats.includes(c); })) {
                // Se a ÚNICA ligação seria por keyword genérica, bloqueia quando tem categoria excluída
                // Só libera se tiver uma categoria "boa" explícita do sintoma
                const temCatBoa = mapa.categorias && mapa.categorias.some(function(c) { return cats.includes(c); });
                if (!temCatBoa) return false;
                // Se tem categoria boa E também excluída (produto multi-cat), ainda pode passar — mas shampoo raro
            }

            // Exclusões por palavra no nome (shampoo, condicionador, etc.)
            if (mapa.excluirKeywordsNoNome && mapa.excluirKeywordsNoNome.some(function(k) { return nomeNorm.includes(normalizeString(k)); })) {
                return false;
            }

            // Regra especial cólica: se tem Antitérmico e NÃO tem Antigases/Antiespasmódico → fora
            // (evita Paracetamol / Dipirona "febre+dor" na busca de cólica)
            if (mapa.bloquearSeTemCategoriaSemOutras) {
                const bloq = mapa.bloquearSeTemCategoriaSemOutras.bloqueio;
                const salva = mapa.bloquearSeTemCategoriaSemOutras.salvaCom || [];
                if (cats.includes(bloq) && !salva.some(function(c) { return cats.includes(c); })) {
                    // Ainda pode salvar por keyword específica (buscopan etc.), não por categoria Analgésico genérica
                    if (mapa.keywords && mapa.keywords.some(function(k) { return texto.includes(normalizeString(k)); })) {
                        return true;
                    }
                    return false;
                }
            }

            // Regra: categoria genérica (ex: Cabelos) só vale se o nome/indicação tiver keyword específica
            if (mapa.soCategoriaGenericaExigeKeyword) {
                const gen = mapa.soCategoriaGenericaExigeKeyword.categoriaGenerica;
                const kws = mapa.soCategoriaGenericaExigeKeyword.keywordsObrigatorias || [];
                const soTemGenerica = cats.includes(gen) && !(mapa.categorias || []).filter(function(c) { return c !== gen; }).some(function(c) { return cats.includes(c); });
                if (soTemGenerica || cats.includes(gen)) {
                    const temKw = kws.some(function(k) { return texto.includes(normalizeString(k)); });
                    if (temKw) return true;
                    // Se só tem a genérica e não tem keyword → não entra por categoria
                    // (ainda pode entrar se tiver outra categoria do mapa ou keyword geral abaixo)
                }
            }

            // 1) Tem categoria relevante?
            if (mapa.categorias && mapa.categorias.some(function(c) { return cats.includes(c); })) {
                // Se a regra de categoria genérica se aplica e a única match é a genérica sem keyword, já tratamos acima
                if (mapa.soCategoriaGenericaExigeKeyword) {
                    const gen = mapa.soCategoriaGenericaExigeKeyword.categoriaGenerica;
                    const kws = mapa.soCategoriaGenericaExigeKeyword.keywordsObrigatorias || [];
                    const outrasCats = mapa.categorias.filter(function(c) { return c !== gen; });
                    const temOutraCat = outrasCats.some(function(c) { return cats.includes(c); });
                    const temKw = kws.some(function(k) { return texto.includes(normalizeString(k)); });
                    if (temOutraCat || temKw) return true;
                    // só categoria genérica sem keyword → não
                    if (cats.includes(gen) && !temKw) {
                        // cai para keywords gerais
                    } else {
                        return true;
                    }
                } else {
                    return true;
                }
            }

            // 2) Keyword específica no nome/indicação
            if (mapa.keywords && mapa.keywords.some(function(k) { return texto.includes(normalizeString(k)); })) {
                return true;
            }

            return false;
        }

        // Sintomas selecionados (multi-seleção)
        let sintomasAtivos = [];

        // Grupos compatíveis entre si (além do mesmo grupo)
        // Ex: dor_febre + respiratorio = febre + tosse / gripe
        const gruposCompativeis = {
            'dor_febre': ['dor_febre', 'respiratorio'],
            'respiratorio': ['respiratorio', 'dor_febre'],
            'digestivo': ['digestivo'],
            'cronico': ['cronico'],
            'sono': ['sono'],
            'suplemento': ['suplemento'],
            'pele': ['pele'],
            'cabelo': ['cabelo'],
            'higiene': ['higiene'],
            'infantil': ['infantil']
        };

        function atualizarVisualSintomas() {
            document.querySelectorAll('.sintoma-btn').forEach(function(btn) {
                const s = btn.getAttribute('data-sintoma');
                const isMed = btn.closest('#botoesSintomasMed');
                if (sintomasAtivos.indexOf(s) !== -1) {
                    if (isMed) {
                        btn.className = 'sintoma-btn bg-brandBlue text-white border border-brandBlue text-xs font-semibold px-3 py-1.5 rounded-full transition-all cursor-pointer ring-2 ring-offset-1 ring-brandBlue shadow';
                    } else {
                        btn.className = 'sintoma-btn bg-amber-600 text-white border border-amber-600 text-xs font-semibold px-3 py-1.5 rounded-full transition-all cursor-pointer ring-2 ring-offset-1 ring-amber-500 shadow';
                    }
                } else {
                    if (isMed) {
                        btn.className = 'sintoma-btn bg-blue-50 text-brandBlue hover:bg-blue-100 border border-blue-200 text-xs font-semibold px-3 py-1.5 rounded-full transition-all cursor-pointer';
                    } else {
                        btn.className = 'sintoma-btn bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 text-xs font-semibold px-3 py-1.5 rounded-full transition-all cursor-pointer';
                    }
                }
            });
            const info = document.getElementById('sintomasAtivosInfo');
            const txt = document.getElementById('sintomasAtivosTexto');
            if (sintomasAtivos.length > 0) {
                if (info) info.classList.remove('hidden');
                if (txt) txt.innerText = sintomasAtivos.join(' + ');
            } else {
                if (info) info.classList.add('hidden');
                if (txt) txt.innerText = '';
            }
        }

        function sintomaCompativelComSelecao(novoGrupo) {
            if (sintomasAtivos.length === 0) return true;
            // Pega o grupo de cada sintoma ativo
            const botoes = document.querySelectorAll('.sintoma-btn');
            const gruposAtivos = [];
            sintomasAtivos.forEach(function(s) {
                botoes.forEach(function(b) {
                    if (b.getAttribute('data-sintoma') === s) {
                        const g = b.getAttribute('data-grupo');
                        if (g && gruposAtivos.indexOf(g) === -1) gruposAtivos.push(g);
                    }
                });
            });
            // Novo grupo precisa ser compatível com TODOS os grupos já ativos
            return gruposAtivos.every(function(gAtivo) {
                const lista = gruposCompativeis[gAtivo] || [gAtivo];
                return lista.indexOf(novoGrupo) !== -1;
            });
        }

        window.toggleSintoma = function(btn) {
            const sintoma = btn.getAttribute('data-sintoma');
            const grupo = btn.getAttribute('data-grupo');
            if (!sintoma) return;

            const idx = sintomasAtivos.indexOf(sintoma);
            if (idx !== -1) {
                // Desmarcar
                sintomasAtivos.splice(idx, 1);
            } else {
                // Verificar compatibilidade
                if (!sintomaCompativelComSelecao(grupo)) {
                    alert('Não é possível combinar esses sintomas.\nEles não costumam estar no mesmo tipo de produto.\nPesquise separadamente ou escolha sintomas do mesmo grupo (ex: Febre + Tosse).');
                    return;
                }
                sintomasAtivos.push(sintoma);
            }

            atualizarVisualSintomas();

            // Monta a query de busca
            if (sintomasAtivos.length === 0) {
                if (searchInput) searchInput.value = '';
                renderResults('');
            } else {
                // Usa marcador especial multi:sintoma1|sintoma2
                const queryMulti = 'multi:' + sintomasAtivos.join('|');
                if (searchInput) searchInput.value = sintomasAtivos.join(' + ');
                renderResults(queryMulti);
            }

            const consultarEl = document.getElementById('consultar');
            if (consultarEl) consultarEl.scrollIntoView({ behavior: 'smooth' });
        };

        window.limparSintomasAtivos = function() {
            sintomasAtivos = [];
            atualizarVisualSintomas();
            if (searchInput) searchInput.value = '';
            renderResults('');
        };

        // Compatibilidade antiga
        window.filtrarPorSintoma = function(sintoma) {
            const btn = document.querySelector('.sintoma-btn[data-sintoma="' + sintoma + '"]');
            if (btn) window.toggleSintoma(btn);
            else {
                if (searchInput) searchInput.value = sintoma;
                renderResults(sintoma);
            }
        };

        window.abrirSecaoEsgotados = function() {
            if (painelIndisponiveis) {
                painelIndisponiveis.classList.remove('hidden');
                window.renderIndisponiveis();
                painelIndisponiveis.scrollIntoView({ behavior: 'smooth' });
            }
        };

        const calcularPrecoFinal = (product) => {
            if (!product.price) return { original: "", final: "", temDesconto: false };
            let pOriginal = parseFloat(product.price.toString().replace(',', '.'));
            if (isNaN(pOriginal)) return { original: product.price, final: product.price, temDesconto: false };

            if (!product.discountType || product.discountType === 'none' || !product.discountValue) {
                return { original: product.price, final: product.price, temDesconto: false };
            }

            let valDesc = parseFloat(product.discountValue.toString().replace(',', '.'));
            if (isNaN(valDesc)) return { original: product.price, final: product.price, temDesconto: false };

            let pFinal = pOriginal;
            if (product.discountType === 'percent') {
                pFinal = pOriginal - (pOriginal * (valDesc / 100));
            } else if (product.discountType === 'value') {
                pFinal = pOriginal - valDesc;
            }
            if (pFinal < 0) pFinal = 0;

            return {
                original: pOriginal.toFixed(2).replace('.', ','),
                final: pFinal.toFixed(2).replace('.', ','),
                temDesconto: true,
                tagDesc: product.discountType === 'percent' ? `-${valDesc}%` : `-R$ ${valDesc.toFixed(2).replace('.', ',')}`
            };
        };

        const criarCardHTML = (product, opts) => {
            opts = opts || {};
            const imgEager = !!opts.eager;
            // Valores escapados para evitar XSS (CodeQL: DOM text reinterpreted as HTML)
            const _name = escapeHtml(product.name);
            const _lab = escapeHtml(product.lab || '');
            const _purpose = escapeHtml(product.purpose || '');
            const _usage = escapeHtml(product.usage || '');
            const _side = escapeHtml(product.sideEffects || '');
            const _image = (function(u) {
                u = String(u || '');
                // Para src: escapa aspas e < >; mantém data: e https intactos
                return u.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
            })(product.image || '');
            const _id = escapeHtml(product.id);
            let borderColor = product.type === 'geral' ? "border-amber-500" : "border-brandBlue";
            
            let catsArray = Array.isArray(product.categories) ? product.categories : ["Outros"];

            if(product.requiresRx || (product.usage && product.usage.includes("RECEITA")) || catsArray.includes("Antibiótico")) {
                borderColor = "border-red-500";
            }

            let badgesHTML = catsArray.map(c => `
                <span class="bg-yellow-100 text-brandBlue text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap border border-yellow-200">
                    ${escapeHtml(c)}
                </span>
            `).join('');

            let labBadge = "";
            if (product.lab && product.lab.trim() !== "") {
                let labelText = product.type === 'geral' ? `<i class="fas fa-certificate mr-1"></i> Marca: ${_lab}` : `<i class="fas fa-industry mr-1"></i> Lab: ${_lab}`;
                labBadge = `<span class="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap border border-blue-200 ml-1">${labelText}</span>`;
            }

            let rxBadge = "";
            if (product.requiresRx) {
                rxBadge = `<span class="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap border border-red-200 ml-1"><i class="fas fa-file-prescription mr-1"></i> Exige Receita</span>`;
            }

            let questionnaireBadge = "";
            if (product.hasQuestionnaire && product.questionnaire && product.questionnaire.questions && product.questionnaire.questions.length > 0) {
                questionnaireBadge = `<span class="bg-purple-100 text-purple-800 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap border border-purple-200 ml-1"><i class="fas fa-clipboard-list mr-1"></i> Questionário</span>`;
            }

            let esgotadoBadge = "";
            let cardStyle = "";
            if (product.status === "indisponivel") {
                esgotadoBadge = `<span class="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap shadow ml-2"><i class="fas fa-ban mr-1"></i> Esgotado</span>`;
                cardStyle = "bg-red-50 border-dashed opacity-80"; 
            }

            let calcP = calcularPrecoFinal(product);
            let precoHTML = "";
            if (calcP.final !== "") {
                if (calcP.temDesconto) {
                    precoHTML = `
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-xs text-gray-400 line-through">R$ ${calcP.original}</span>
                            <div class="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-lg font-bold text-sm shadow-sm">
                                <i class="fas fa-tag text-xs"></i> R$ ${calcP.final}
                            </div>
                            <span class="bg-red-600 text-white text-xs font-extrabold px-2 py-0.5 rounded shadow">${calcP.tagDesc}</span>
                        </div>
                    `;
                } else {
                    precoHTML = `
                        <div class="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-lg font-bold text-sm shadow-sm mt-1">
                            <i class="fas fa-tag text-xs"></i> R$ ${calcP.final}
                        </div>
                    `;
                }
            }

            let adminButtons = "";
            if (isAdminMode) {
                let statusInfo = product.status === "indisponivel" ? 
                    `<span class="bg-red-600 text-white text-xs px-2.5 py-1 rounded font-bold"><i class="fas fa-ban"></i> Esgotado</span>` : 
                    `<span class="bg-emerald-600 text-white text-xs px-2.5 py-1 rounded font-bold"><i class="fas fa-check"></i> Disponível</span>`;

                adminButtons = `
                    <div class="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center bg-emerald-50/50 -mx-6 -mb-6 p-4">
                        <div>${statusInfo}</div>
                        <div class="flex gap-2">
                            <button onclick="window.abrirModalEditar('${_id}')" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 shadow cursor-pointer">
                                <i class="fas fa-edit"></i> Editar
                            </button>
                            <button onclick="window.pedirConfirmacaoExclusao('${_id}')" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 shadow cursor-pointer">
                                <i class="fas fa-trash-alt"></i> Excluir
                            </button>
                        </div>
                    </div>
                `;
            }

            let iconePadrao = product.type === 'geral' ? 'fa-pump-soap' : 'fa-pills';
            let imagemHTML = `
                <div class="w-20 h-20 md:w-24 md:h-24 bg-blue-50 rounded-xl border border-blue-100 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-inner">
                    <i class="fas ${iconePadrao} text-brandBlue text-2xl"></i>
                </div>
            `;
            if (product.image && product.image.trim() !== "") {
                imagemHTML = `
                    <div class="w-20 h-20 md:w-24 md:h-24 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-inner">
                        <img src="${imgEager ? _image : PLACEHOLDER_IMG}" data-src="${imgEager ? '' : _image}" alt="${_name}" class="w-full h-full object-cover${imgEager ? '' : ' farma-lazy'}" loading="${imgEager ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${imgEager ? 'high' : 'low'}" width="96" height="96" onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\'fas ${iconePadrao} text-brandBlue text-2xl\'></i>';">
                    </div>
                `;
            }

            // Montar texto de marca/laboratório para a mensagem do WhatsApp
            let labOuMarca = '';
            if (product.lab && product.lab.trim() !== '') {
                labOuMarca = product.type === 'geral' ? ` (Marca: ${_lab})` : ` (Lab: ${_lab})`;
            }

            let waMessage = `Olá! Gostaria de encomendar o produto *${_name}*${labOuMarca}`;
            if (calcP.final !== "") waMessage += ` por *R$ ${calcP.final}*`;
            
            let btnText = "Pedir pelo WhatsApp";
            let btnClass = "bg-green-600 hover:bg-green-700 text-white";
            let btnOnclick = `window.pedirProdutoWhatsApp('${_id}')`;
            
            if (product.status === "indisponivel") {
                waMessage = `Olá! Vi no site que o produto *${_name}*${labOuMarca} está esgotado. Gostaria de saber a previsão de chegada.`;
                btnText = "Consultar Disponibilidade";
                btnClass = "bg-gray-500 hover:bg-gray-600 text-white";
                btnOnclick = `window.pedirProdutoWhatsApp('${_id}')`;
            } else if (product.type === 'medicamento' && product.hasQuestionnaire && product.questionnaire && Array.isArray(product.questionnaire.questions) && product.questionnaire.questions.length > 0) {
                btnText = "Responder Questionário e Pedir";
                btnClass = "bg-purple-600 hover:bg-purple-700 text-white";
                btnOnclick = `window.abrirQuestionario('${_id}')`;
            }

            const isFav = favorites.indexOf(product.id) !== -1;
            let stockInfo = '';
            if (typeof product.stock === 'number') {
                if (product.stock <= 0 || product.status === 'indisponivel') {
                    stockInfo = '<span class="text-xs text-red-600 font-bold">Sem estoque</span>';
                } else if (product.stockAlert && product.stock <= product.stockAlert) {
                    stockInfo = '<span class="text-xs text-amber-600 font-bold">Restam ' + product.stock + ' un.</span>';
                } else {
                    stockInfo = '<span class="text-xs text-gray-500">' + product.stock + ' un. em estoque</span>';
                }
            }

            let btnWhatsApp = `
                <div class="mt-4 pt-4 border-t border-gray-100 space-y-2">
                    ${stockInfo ? '<div>' + stockInfo + '</div>' : ''}
                    <button type="button" onclick="${btnOnclick}" class="${btnClass} px-4 py-2.5 rounded-lg font-bold text-sm shadow flex items-center justify-center gap-2 transition-all w-full cursor-pointer">
                        <i class="fab fa-whatsapp text-lg"></i> ${btnText}
                    </button>
                    <div class="flex gap-2">
                        <button type="button" onclick="window.adicionarAoCarrinho('${_id}')" class="flex-1 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer" ${product.status === 'indisponivel' ? 'disabled' : ''}>
                            <i class="fas fa-cart-plus mr-1"></i> Carrinho
                        </button>
                        <button type="button" data-fav-id="${_id}" onclick="window.toggleFavorito('${_id}')" class="flex-1 ${isFav ? 'bg-pink-100 text-pink-700 border-pink-300' : 'bg-gray-50 text-gray-600 border-gray-200'} border hover:bg-pink-50 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer">
                            <i class="fas fa-heart mr-1"></i> ${isFav ? 'Favorito' : 'Favoritar'}
                        </button>
                    </div>
                </div>
            `;

            return `
                <div class="farma-card bg-white p-6 rounded-xl shadow-md border-l-4 ${borderColor} ${cardStyle} mb-4 relative overflow-hidden flex flex-col justify-between">
                    <div class="relative z-10 flex-grow">
                        <div class="flex flex-col sm:flex-row items-start gap-4 mb-4 border-b border-gray-100 pb-3">
                            ${imagemHTML}
                            <div class="flex-grow w-full">
                                <div class="flex flex-col gap-2">
                                    <div>
                                        <div class="flex items-center flex-wrap gap-1">
                                            <h3 class="text-lg md:text-xl font-bold text-gray-800 leading-snug">${_name}</h3>
                                            ${esgotadoBadge}
                                        </div>
                                        ${precoHTML}
                                    </div>
                                    <div class="flex flex-wrap gap-1.5 items-center pt-1">
                                        ${badgesHTML}
                                        ${labBadge}
                                        ${rxBadge}
                                        ${questionnaireBadge}
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="space-y-3">
                            <div>
                                <h4 class="font-semibold text-gray-800 text-xs flex items-center gap-1.5 uppercase tracking-wide"><i class="fas fa-bullseye text-brandBlue"></i> Para que serve / Benefícios</h4>
                                <p class="text-gray-600 text-sm mt-0.5 leading-relaxed">${_purpose}</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold text-gray-800 text-xs flex items-center gap-1.5 uppercase tracking-wide"><i class="fas fa-clock text-green-600"></i> Modo de Uso</h4>
                                <p class="text-gray-600 text-sm mt-0.5 leading-relaxed font-medium">${_usage}</p>
                            </div>
                            
                            <div class="bg-orange-50 p-2.5 rounded-lg border border-orange-100 mt-2">
                                <h4 class="font-semibold text-orange-800 text-xs flex items-center gap-1.5 uppercase tracking-wide"><i class="fas fa-exclamation-triangle"></i> Precauções</h4>
                                <p class="text-orange-700 text-xs mt-0.5">${_side}</p>
                            </div>
                        </div>
                        
                        ${btnWhatsApp}
                        
                    </div>
                    ${adminButtons}
                </div>
            `;
        };

        let lastSearchQuery = '';

        function popularFiltrosBusca(produtosBase) {
            const searchLabFilter = document.getElementById('searchLabFilter');
            const searchBrandFilter = document.getElementById('searchBrandFilter');
            const searchFiltersBar = document.getElementById('searchFiltersBar');
            if (!searchLabFilter || !searchBrandFilter || !searchFiltersBar) return;

            const labAtual = searchLabFilter.value;
            const marcaAtual = searchBrandFilter.value;

            // Laboratórios presentes nos produtos base (medicamentos)
            const labs = [...new Set(
                produtosBase
                    .filter(p => p.type === 'medicamento' && p.lab && p.lab.trim() !== '')
                    .map(p => p.lab.trim())
            )].sort((a, b) => a.localeCompare(b, 'pt-BR'));

            // Marcas presentes nos produtos base (cuidados/geral)
            const brands = [...new Set(
                produtosBase
                    .filter(p => p.type === 'geral' && p.lab && p.lab.trim() !== '')
                    .map(p => p.lab.trim())
            )].sort((a, b) => a.localeCompare(b, 'pt-BR'));

            searchLabFilter.innerHTML = '<option value="TODOS">Todos os Laboratórios</option>';
            labs.forEach(l => {
                searchLabFilter.innerHTML += '<option value="' + escapeHtml(l) + '">' + escapeHtml(l) + '</option>';
            });
            if ([...searchLabFilter.options].some(o => o.value === labAtual)) {
                searchLabFilter.value = labAtual;
            } else {
                searchLabFilter.value = 'TODOS';
            }

            searchBrandFilter.innerHTML = '<option value="TODOS">Todas as Marcas</option>';
            brands.forEach(b => {
                searchBrandFilter.innerHTML += '<option value="' + escapeHtml(b) + '">' + escapeHtml(b) + '</option>';
            });
            if ([...searchBrandFilter.options].some(o => o.value === marcaAtual)) {
                searchBrandFilter.value = marcaAtual;
            } else {
                searchBrandFilter.value = 'TODOS';
            }

            // Mostra a barra se existir pelo menos 1 lab ou 1 marca
            if (labs.length > 0 || brands.length > 0) {
                searchFiltersBar.classList.remove('hidden');
            } else {
                searchFiltersBar.classList.add('hidden');
            }
        }

        window.aplicarFiltroBusca = function() {
            pageState.results = PAGE_SIZE;
            renderResults(lastSearchQuery, true);
        };

        window.limparFiltrosBusca = function() {
            const searchLabFilter = document.getElementById('searchLabFilter');
            const searchBrandFilter = document.getElementById('searchBrandFilter');
            if (searchLabFilter) searchLabFilter.value = 'TODOS';
            if (searchBrandFilter) searchBrandFilter.value = 'TODOS';
            pageState.results = PAGE_SIZE;
            renderResults(lastSearchQuery, true);
        };

        const renderResults = (query, keepFilters) => {
            if (!resultsContainer) return;
            if (typeof query !== 'string') query = '';
            lastSearchQuery = query;
            if (query && query.indexOf('multi:') !== 0 && query.trim() && query.trim() !== ADMIN_CODE) {
                try { registrarBusca(query); } catch (e) {}
            }
            const normalizedQuery = normalizeString(query);

            // Só ativa admin se o código existir e for digitado (evita admin com busca vazia no site público)
            if (ADMIN_CODE && query.trim() === ADMIN_CODE) {
                ativarModoAdmin();
                return;
            }
            
            resultsContainer.innerHTML = '';
            var _rm = document.getElementById('resultsMore');
            if (_rm) _rm.classList.add('hidden');

            const searchLabFilter = document.getElementById('searchLabFilter');
            const searchBrandFilter = document.getElementById('searchBrandFilter');
            const searchFiltersBar = document.getElementById('searchFiltersBar');
            const selectedLab = searchLabFilter ? searchLabFilter.value : 'TODOS';
            const selectedBrand = searchBrandFilter ? searchBrandFilter.value : 'TODOS';
            const temFiltroLabOuMarca = selectedLab !== 'TODOS' || selectedBrand !== 'TODOS';

            // Busca vazia E sem filtro de lab/marca → estado inicial
            if (normalizedQuery === '' && !temFiltroLabOuMarca) {
                // Ainda assim popula os filtros com TODOS os labs e marcas cadastrados
                popularFiltrosBusca(globalState.products);
                if (searchFiltersBar) searchFiltersBar.classList.remove('hidden');

                resultsContainer.innerHTML = `
                    <div class="text-center p-8 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 text-gray-500">
                        <i class="fas fa-search-plus text-4xl mb-3 text-brandYellow"></i>
                        <h3 class="font-bold text-xl text-gray-700 mb-2">Digite um produto ou clique em um sintoma acima</h3>
                        <p class="text-sm">Ou use os filtros de Laboratório / Marca para ver todos os produtos de um fabricante.</p>
                    </div>
                `;
                if (clearBtn) clearBtn.classList.add('hidden');
                return;
            }

            if (clearBtn) {
                if (normalizedQuery !== '' || temFiltroLabOuMarca || (typeof sintomasAtivos !== 'undefined' && sintomasAtivos.length > 0)) clearBtn.classList.remove('hidden');
                else clearBtn.classList.add('hidden');
            }

            // 1) Filtrar por texto / sintoma (com categorias inteligentes)
            let produtosPorTexto = globalState.products;
            if (normalizedQuery !== '' || (query && query.indexOf('multi:') === 0)) {
                // Multi-sintomas: multi:tosse|alergia → produto precisa bater em TODOS
                if (query && query.indexOf('multi:') === 0) {
                    const lista = query.replace('multi:', '').split('|').map(function(s) { return s.trim(); }).filter(Boolean);
                    produtosPorTexto = globalState.products.filter(function(product) {
                        return lista.every(function(sintoma) {
                            return produtoCorrespondeSintoma(product, sintoma);
                        });
                    });
                } else {
                    // Detecta se a busca é um sintoma conhecido da busca rápida
                    let sintomaDetectado = null;
                    for (let sintoma in mapeamentoSintomas) {
                        if (normalizedQuery === sintoma || normalizedQuery === normalizeString(sintoma)) {
                            sintomaDetectado = sintoma;
                            break;
                        }
                    }
                    // Também detecta "tosse + alergia" digitado manualmente
                    if (!sintomaDetectado && normalizedQuery.indexOf('+') !== -1) {
                        const partes = normalizedQuery.split('+').map(function(s) { return s.trim(); }).filter(Boolean);
                        const keys = [];
                        partes.forEach(function(p) {
                            for (let sintoma in mapeamentoSintomas) {
                                if (p === sintoma || p === normalizeString(sintoma) || normalizeString(sintoma).indexOf(p) !== -1) {
                                    keys.push(sintoma);
                                    break;
                                }
                            }
                        });
                        if (keys.length === partes.length && keys.length > 0) {
                            produtosPorTexto = globalState.products.filter(function(product) {
                                return keys.every(function(sintoma) {
                                    return produtoCorrespondeSintoma(product, sintoma);
                                });
                            });
                        } else {
                            produtosPorTexto = globalState.products.filter(function(product) {
                                let catsText = Array.isArray(product.categories) ? product.categories.join(" ") : "";
                                let labText = product.lab || "";
                                let textoCompleto = normalizeString((product.name || "") + " " + labText + " " + (product.purpose || "") + " " + catsText + " " + (product.sideEffects || ""));
                                return textoCompleto.includes(normalizedQuery);
                            });
                        }
                    } else if (sintomaDetectado) {
                        produtosPorTexto = globalState.products.filter(function(product) {
                            return produtoCorrespondeSintoma(product, sintomaDetectado);
                        });
                    } else {
                        // Busca livre por texto
                        produtosPorTexto = globalState.products.filter(function(product) {
                            let catsText = Array.isArray(product.categories) ? product.categories.join(" ") : "";
                            let labText = product.lab || "";
                            let textoCompleto = normalizeString((product.name || "") + " " + labText + " " + (product.purpose || "") + " " + catsText + " " + (product.sideEffects || ""));
                            return textoCompleto.includes(normalizedQuery);
                        });
                    }
                }
            }

            // 2) Popular filtros com base nos produtos que bateram na busca de texto
            //    (se a busca estiver vazia, usa todos os produtos)
            // Atualiza opções de lab/marca (preserva seleção se ainda existir na lista)
            popularFiltrosBusca(produtosPorTexto.length > 0 ? produtosPorTexto : globalState.products);

            // Re-ler seleção após popular (pode ter mudado)
            const labSel = searchLabFilter ? searchLabFilter.value : 'TODOS';
            const brandSel = searchBrandFilter ? searchBrandFilter.value : 'TODOS';

            // 3) Aplicar filtro de laboratório / marca
            let filteredProducts = produtosPorTexto.filter(product => {
                const lab = (product.lab || '').trim();
                if (product.type === 'medicamento') {
                    if (labSel !== 'TODOS' && lab.toLowerCase() !== labSel.toLowerCase()) return false;
                    // Se filtro de marca estiver ativo e o produto é medicamento, não esconder por marca
                    // (marca só filtra produtos gerais)
                }
                if (product.type === 'geral') {
                    if (brandSel !== 'TODOS' && lab.toLowerCase() !== brandSel.toLowerCase()) return false;
                }
                // Se só filtro de lab está ativo, esconder gerais; se só marca, esconder medicamentos
                if (labSel !== 'TODOS' && brandSel === 'TODOS' && product.type !== 'medicamento') return false;
                if (brandSel !== 'TODOS' && labSel === 'TODOS' && product.type !== 'geral') return false;
                return true;
            });

            // Caso especial: busca vazia + só filtro de lab → todos os medicamentos daquele lab
            // (já coberto acima porque produtosPorTexto = todos)

            if (filteredProducts.length === 0) {
                let termoExibido = query.trim() || (labSel !== 'TODOS' ? labSel : brandSel);
                if (termoExibido.indexOf('multi:') === 0) {
                    termoExibido = termoExibido.replace(/^multi:/, '').split('|').join(' + ');
                }
                const waTexto = encodeURIComponent('Olá! Gostaria de consultar a disponibilidade de: ' + (termoExibido || 'um produto'));
                resultsContainer.innerHTML = `
                    <div class="text-center p-8 bg-red-50 text-red-600 rounded-xl border border-red-100 shadow-sm">
                        <i class="fas fa-exclamation-circle text-4xl mb-3"></i>
                        <h3 class="font-bold text-xl">Nenhum resultado encontrado${termoExibido ? ' para "' + escapeHtml(termoExibido) + '"' : ''}.</h3>
                        <p class="mt-2 text-sm">Tente outro termo ou limpe os filtros de Laboratório / Marca.</p>
                        <a href="https://wa.me/554335471551?text=${waTexto}" target="_blank" rel="noopener noreferrer" class="inline-flex mt-4 bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 transition-colors items-center gap-2">
                            <i class="fab fa-whatsapp text-lg"></i> Perguntar no WhatsApp
                        </a>
                    </div>
                `;
                return;
            }

            let filtroInfo = '';
            if (labSel !== 'TODOS') filtroInfo += ' · Lab: ' + labSel;
            if (brandSel !== 'TODOS') filtroInfo += ' · Marca: ' + brandSel;
            // Nova busca/filtro: reseta página de resultados (exceto quando keepFilters só re-renderiza a mesma query... 
            // sempre resetamos results page no início de renderResults se não for "append")
            if (!keepFilters) pageState.results = PAGE_SIZE;
            // keepFilters=true still may need reset when query changed - lastSearchQuery already set by caller
            cachedLists.results = filteredProducts;
            var showResults = filteredProducts.slice(0, pageState.results);
            const countHtml = '<p class="text-sm text-gray-500 font-semibold mb-2 ml-1">Encontrado(s): <strong>' + filteredProducts.length + '</strong> resultado(s)' + escapeHtml(filtroInfo) + (filteredProducts.length > showResults.length ? ' — mostrando ' + showResults.length : '') + '</p>';
            resultsContainer.innerHTML = countHtml + showResults.map(function(product, idx) { return criarCardHTML(product, { eager: idx < 4 }); }).join('');
            var resultsMore = document.getElementById('resultsMore');
            var resultsMoreCount = document.getElementById('resultsMoreCount');
            if (resultsMore && resultsMoreCount) {
                if (pageState.results < filteredProducts.length) {
                    resultsMore.classList.remove('hidden');
                    resultsMoreCount.textContent = 'Mostrando ' + showResults.length + ' de ' + filteredProducts.length + ' resultados';
                } else {
                    resultsMore.classList.add('hidden');
                }
            }
        };

        const renderCatalogo = () => {
            if (catalogoGrid) catalogoGrid.innerHTML = '';
            if (catalogoGeralGrid) catalogoGeralGrid.innerHTML = '';
            if (ofertasGrid) ofertasGrid.innerHTML = '';

            popularFiltrosLaboratoriosEMarcas();

            // 1. Renderizar Seção de Ofertas
            if (globalState.ofertasAtivas) {
                if (ofertasSection) ofertasSection.classList.remove('hidden');
                if (navOfertasLink) navOfertasLink.classList.remove('hidden');
                if (navOfertasMobile) navOfertasMobile.classList.remove('hidden');

                const ofertas = globalState.products.filter(p => p.isOffer && p.status !== "indisponivel");
                if (ofertasGrid) {
                    if (ofertas.length === 0) {
                        ofertasGrid.innerHTML = `<p class="col-span-full text-center text-red-100 italic">Nenhum produto em oferta no momento.</p>`;
                    } else {
                        ofertasGrid.innerHTML = ofertas.map(function(product, idx) { return criarCardHTML(product, { eager: idx < 3 }); }).join('');
                    }
                }
            } else {
                if (ofertasSection) ofertasSection.classList.add('hidden');
                if (navOfertasLink) navOfertasLink.classList.add('hidden');
                if (navOfertasMobile) navOfertasMobile.classList.add('hidden');
            }

            // 2. Medicamentos Disponíveis (com filtro por Categoria e Laboratório)
            const selectedCatMed = categoryFilter ? categoryFilter.value : "TODOS";
            const selectedLab = labFilter ? labFilter.value : "TODOS";

            const medsVisiveis = globalState.products.filter(p => p.type === 'medicamento' && p.status !== "indisponivel");
            const filteredMeds = medsVisiveis.filter(p => {
                let matchCat = (selectedCatMed === "TODOS" || (Array.isArray(p.categories) && p.categories.includes(selectedCatMed)));
                let matchLab = (selectedLab === "TODOS" || (p.lab && p.lab.trim().toLowerCase() === selectedLab.toLowerCase()));
                return matchCat && matchLab;
            });

            cachedLists.meds = filteredMeds;
            // Reset page only when filtros mudam (filtrarCatalogo chama renderCatalogo completo)
            var medsMore = document.getElementById('catalogoMedsMore');
            var medsCount = document.getElementById('catalogoMedsCount');
            if (catalogoGrid) {
                if (filteredMeds.length === 0) {
                    catalogoGrid.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-xl border border-gray-200 text-gray-500 font-bold">Nenhum medicamento encontrado com estes filtros.</div>`;
                    if (medsMore) medsMore.classList.add('hidden');
                } else {
                    var showMeds = filteredMeds.slice(0, pageState.meds);
                    catalogoGrid.innerHTML = showMeds.map(function(product, idx) { return criarCardHTML(product, { eager: idx < 6 }); }).join('');
                    if (medsMore && medsCount) {
                        if (pageState.meds < filteredMeds.length) {
                            medsMore.classList.remove('hidden');
                            medsCount.textContent = 'Mostrando ' + showMeds.length + ' de ' + filteredMeds.length + ' medicamentos';
                        } else {
                            medsMore.classList.add('hidden');
                        }
                    }
                }
            }

            // 3. Cuidados Pessoais & Perfumaria Disponíveis (com filtro por Categoria e Marca)
            const selectedCatGeral = categoryFilterGeral ? categoryFilterGeral.value : "TODOS";
            const selectedBrand = brandFilter ? brandFilter.value : "TODOS";

            const geraisVisiveis = globalState.products.filter(p => p.type === 'geral' && p.status !== "indisponivel");
            const filteredGerais = geraisVisiveis.filter(p => {
                let matchCat = (selectedCatGeral === "TODOS" || (Array.isArray(p.categories) && p.categories.includes(selectedCatGeral)));
                let matchBrand = (selectedBrand === "TODOS" || (p.lab && p.lab.trim().toLowerCase() === selectedBrand.toLowerCase()));
                return matchCat && matchBrand;
            });

            cachedLists.gerais = filteredGerais;
            var geraisMore = document.getElementById('catalogoGeralMore');
            var geraisCount = document.getElementById('catalogoGeralCount');
            if (catalogoGeralGrid) {
                if (filteredGerais.length === 0) {
                    catalogoGeralGrid.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-xl border border-gray-200 text-gray-500 font-bold">Nenhum produto encontrado com estes filtros.</div>`;
                    if (geraisMore) geraisMore.classList.add('hidden');
                } else {
                    var showGerais = filteredGerais.slice(0, pageState.gerais);
                    catalogoGeralGrid.innerHTML = showGerais.map(function(product, idx) { return criarCardHTML(product, { eager: idx < 6 }); }).join('');
                    if (geraisMore && geraisCount) {
                        if (pageState.gerais < filteredGerais.length) {
                            geraisMore.classList.remove('hidden');
                            geraisCount.textContent = 'Mostrando ' + showGerais.length + ' de ' + filteredGerais.length + ' produtos';
                        } else {
                            geraisMore.classList.add('hidden');
                        }
                    }
                }
            }
        };

        window.carregarMaisMeds = function() {
            var list = cachedLists.meds || [];
            var prev = pageState.meds;
            pageState.meds = Math.min(prev + PAGE_SIZE, list.length);
            var added = list.slice(prev, pageState.meds);
            if (catalogoGrid && added.length) {
                catalogoGrid.insertAdjacentHTML('beforeend', added.map(function(p) { return criarCardHTML(p); }).join(''));
            }
            var medsMore = document.getElementById('catalogoMedsMore');
            var medsCount = document.getElementById('catalogoMedsCount');
            if (medsMore && medsCount) {
                if (pageState.meds < list.length) {
                    medsMore.classList.remove('hidden');
                    medsCount.textContent = 'Mostrando ' + pageState.meds + ' de ' + list.length + ' medicamentos';
                } else {
                    medsMore.classList.add('hidden');
                }
            }
        };
        window.carregarMaisGerais = function() {
            var list = cachedLists.gerais || [];
            var prev = pageState.gerais;
            pageState.gerais = Math.min(prev + PAGE_SIZE, list.length);
            var added = list.slice(prev, pageState.gerais);
            if (catalogoGeralGrid && added.length) {
                catalogoGeralGrid.insertAdjacentHTML('beforeend', added.map(function(p) { return criarCardHTML(p); }).join(''));
            }
            var geraisMore = document.getElementById('catalogoGeralMore');
            var geraisCount = document.getElementById('catalogoGeralCount');
            if (geraisMore && geraisCount) {
                if (pageState.gerais < list.length) {
                    geraisMore.classList.remove('hidden');
                    geraisCount.textContent = 'Mostrando ' + pageState.gerais + ' de ' + list.length + ' produtos';
                } else {
                    geraisMore.classList.add('hidden');
                }
            }
        };
        window.carregarMaisResultados = function() {
            var list = cachedLists.results || [];
            var prev = pageState.results;
            pageState.results = Math.min(prev + PAGE_SIZE, list.length);
            var show = list.slice(0, pageState.results);
            var added = list.slice(prev, pageState.results);
            var resultsMore = document.getElementById('resultsMore');
            var resultsMoreCount = document.getElementById('resultsMoreCount');
            let filtroInfo = '';
            var labSel = (document.getElementById('searchLabFilter') || {}).value || 'TODOS';
            var brandSel = (document.getElementById('searchBrandFilter') || {}).value || 'TODOS';
            if (labSel !== 'TODOS') filtroInfo += ' · Lab: ' + labSel;
            if (brandSel !== 'TODOS') filtroInfo += ' · Marca: ' + brandSel;
            // Atualiza só a contagem no topo (primeiro filho) e anexa novos cards
            if (resultsContainer) {
                var countEl = resultsContainer.querySelector('p.text-sm.text-gray-500');
                if (countEl) {
                    countEl.innerHTML = 'Encontrado(s): <strong>' + list.length + '</strong> resultado(s)' + escapeHtml(filtroInfo) + ' — mostrando ' + pageState.results;
                }
                if (added.length) {
                    resultsContainer.insertAdjacentHTML('beforeend', added.map(function(p) { return criarCardHTML(p); }).join(''));
                }
            }
            if (resultsMore && resultsMoreCount) {
                if (pageState.results < list.length) {
                    resultsMore.classList.remove('hidden');
                    resultsMoreCount.textContent = 'Mostrando ' + pageState.results + ' de ' + list.length + ' resultados';
                } else {
                    resultsMore.classList.add('hidden');
                }
            }
        };

        window.renderIndisponiveis = function() {
            if (!indisponiveisGrid) return;
            indisponiveisGrid.innerHTML = '';
            
            const tipoFiltro = filtroEsgotados ? filtroEsgotados.value : 'todos';
            let indisponiveis = globalState.products.filter(p => p.status === "indisponivel");

            if (tipoFiltro === 'medicamento') {
                indisponiveis = indisponiveis.filter(p => p.type === 'medicamento');
            } else if (tipoFiltro === 'geral') {
                indisponiveis = indisponiveis.filter(p => p.type === 'geral');
            }
            
            const totalEsgotados = globalState.products.filter(p => p.status === "indisponivel").length;
            if (countIndisponiveis) countIndisponiveis.innerText = totalEsgotados;
            const countAdmin = document.getElementById('countIndisponiveisAdmin');
            if (countAdmin) countAdmin.innerText = totalEsgotados;

            if (indisponiveis.length === 0) {
                indisponiveisGrid.innerHTML = `<p class="col-span-full text-amber-800 text-sm italic">Nenhum produto esgotado encontrado para este filtro.</p>`;
                return;
            }

            indisponiveisGrid.innerHTML = indisponiveis.map(function(product) { return criarCardHTML(product); }).join('');
        };

        function atualizarTudoNaTela() {
            pageState.meds = PAGE_SIZE;
            pageState.gerais = PAGE_SIZE;
            // Se Intersection Observer ainda não montou o catálogo, não força (exceto admin)
            if (typeof window.__farmaForceCatalog === 'function' && !isAdminMode) {
                if (window.__farmaCatalogMounted && window.__farmaCatalogMounted()) {
                    renderCatalogo();
                }
                // senão: IO monta quando a seção aparecer
            } else {
                renderCatalogo();
            }
            // Atualiza filtros de lab/marca da área de busca
            if (typeof popularFiltrosBusca === 'function') {
                popularFiltrosBusca(globalState.products);
                const bar = document.getElementById('searchFiltersBar');
                if (bar) bar.classList.remove('hidden');
            }
            // Se houver uma busca ativa, re-renderiza os resultados
            if (lastSearchQuery || (document.getElementById('searchLabFilter') && document.getElementById('searchLabFilter').value !== 'TODOS') || (document.getElementById('searchBrandFilter') && document.getElementById('searchBrandFilter').value !== 'TODOS')) {
                renderResults(lastSearchQuery || '', true);
            }
            if (isAdminMode) {
                window.renderIndisponiveis();
                atualizarBotoesAdminGlobal();
            } else {
                const totalEsgotados = globalState.products.filter(p => p.status === "indisponivel").length;
                if (countIndisponiveis) countIndisponiveis.innerText = totalEsgotados;
                const countAdmin = document.getElementById('countIndisponiveisAdmin');
                if (countAdmin) countAdmin.innerText = totalEsgotados;
            }
        }

        function atualizarBotoesAdminGlobal() {
            if (!txtStatusOfertas || !ofertaAdminContainer) return;
            if (globalState.ofertasAtivas) {
                txtStatusOfertas.innerText = "Desativar Seção Ofertas";
                ofertaAdminContainer.classList.remove('hidden');
            } else {
                txtStatusOfertas.innerText = "Ativar Seção Ofertas";
                ofertaAdminContainer.classList.add('hidden');
                const prodIsOfferEl = document.getElementById('prodIsOffer');
                if (prodIsOfferEl) prodIsOfferEl.checked = false;
            }
        }

        window.toggleGlobalOfertas = async function() {
            globalState.ofertasAtivas = !globalState.ofertasAtivas;
            if (!globalState.ofertasAtivas) {
                globalState.products.forEach(p => p.isOffer = false);
            }
            await salvarDadosNuvem();
            atualizarTudoNaTela();
            alert(`Seção de Ofertas ${globalState.ofertasAtivas ? 'Ativada' : 'Desativada'} com sucesso em tempo real!`);
        };

        function ativarModoAdmin() {
            // No site público (sem config.js) ADMIN_CODE fica vazio — não permitir admin
            if (!ADMIN_CODE) {
                console.warn('FARMA: admin indisponível neste ambiente (sem config.js).');
                return;
            }
            isAdminMode = true;
            if (adminBadge) adminBadge.classList.remove('hidden');
            if (searchInput) searchInput.value = '';
            if (clearBtn) clearBtn.classList.add('hidden');
            
            renderResults('');
            atualizarTudoNaTela();

            if (!API_KEY) {
                alert("Modo Administrador Ativado (somente visualização local). Sem Master Key as alterações NÃO serão salvas na nuvem.");
            } else {
                alert("Modo Administrador Ativado!");
            }
        }

        function alternarSecaoIndisponiveisAdmin() {
            if (!painelIndisponiveis) return;
            painelIndisponiveis.classList.toggle('hidden');
            if (!painelIndisponiveis.classList.contains('hidden')) {
                window.renderIndisponiveis();
                painelIndisponiveis.scrollIntoView({ behavior: 'smooth' });
            }
        }


        // ---- Imagem do produto (upload JPG/PNG/WEBP/GIF + URL) ----
        /**
         * Sanitiza URL de imagem para o preview.
         * Reconstrói a URL a partir de protocolo/host/path (http/https)
         * ou valida data:image base64 — não reinterpreta texto do DOM como HTML.
         */
        function safeImageUrl(src) {
            if (src == null) return '';
            var s = String(src).trim();
            if (!s) return '';
            // Bloqueia qualquer tentativa de injetar markup
            if (s.indexOf('<') !== -1 || s.indexOf('>') !== -1) return '';
            if (/^[\s]*javascript:/i.test(s) || /^[\s]*vbscript:/i.test(s)) return '';

            // data:image/*;base64,... (upload local no admin)
            var dataMatch = /^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(s);
            if (dataMatch) {
                return 'data:image/' + dataMatch[1].toLowerCase() + ';base64,' + dataMatch[2].replace(/\s+/g, '');
            }

            // http(s) — parse e reconstrói (quebra fluxo de taint do analisador)
            try {
                var u = new URL(s, window.location.origin);
                if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
                // Monta de novo só com partes permitidas
                return u.protocol + '//' + u.host + u.pathname + u.search + u.hash;
            } catch (e) {
                return '';
            }
        }

        function atualizarPreviewImagem(src) {
            const img = document.getElementById('prodImagePreview');
            const ph = document.getElementById('prodImagePreviewPlaceholder');
            if (!img) return;

            // Limpa estado atual (não usa innerHTML / texto do DOM como HTML)
            img.removeAttribute('src');
            img.classList.add('hidden');
            if (ph) ph.classList.remove('hidden');

            var safe = safeImageUrl(src);
            if (!safe) return;

            // Carrega em Image isolada; só então copia o src já normalizado pelo browser.
            // Isso evita reinterpretar texto do DOM como HTML e satisfaz análise estática.
            var probe = new Image();
            probe.onload = function() {
                img.src = probe.src;
                img.classList.remove('hidden');
                if (ph) ph.classList.add('hidden');
            };
            probe.onerror = function() {
                img.removeAttribute('src');
                img.classList.add('hidden');
                if (ph) ph.classList.remove('hidden');
            };
            probe.src = safe;
        }

        function setProdImageStatus(msg, isError) {
            const el = document.getElementById('prodImageStatus');
            if (!el) return;
            if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
            el.textContent = msg;
            el.classList.remove('hidden');
            el.className = 'text-xs font-medium ' + (isError ? 'text-red-600' : 'text-emerald-700');
        }

        /** Redimensiona e comprime para caber no JSONBin (data URL). */
        function processarArquivoImagem(file) {
            return new Promise(function(resolve, reject) {
                if (!file || !file.type || file.type.indexOf('image/') !== 0) {
                    reject(new Error('Selecione um arquivo de imagem (JPG, PNG, WEBP ou GIF).'));
                    return;
                }
                const maxBytesIn = 8 * 1024 * 1024; // 8 MB entrada
                if (file.size > maxBytesIn) {
                    reject(new Error('Arquivo muito grande (máx. 8 MB).'));
                    return;
                }
                const reader = new FileReader();
                reader.onerror = function() { reject(new Error('Não foi possível ler o arquivo.')); };
                reader.onload = function() {
                    const dataUrl = reader.result;
                    const image = new Image();
                    image.onload = function() {
                        const maxSide = 800;
                        let w = image.width;
                        let h = image.height;
                        if (w > maxSide || h > maxSide) {
                            if (w >= h) { h = Math.round(h * (maxSide / w)); w = maxSide; }
                            else { w = Math.round(w * (maxSide / h)); h = maxSide; }
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(image, 0, 0, w, h);
                        // JPEG para reduzir tamanho (fundo branco se PNG transparente)
                        let out = canvas.toDataURL('image/jpeg', 0.82);
                        // se ainda grande demais, baixa qualidade
                        let q = 0.72;
                        while (out.length > 450000 && q > 0.4) {
                            out = canvas.toDataURL('image/jpeg', q);
                            q -= 0.1;
                        }
                        if (out.length > 600000) {
                            reject(new Error('Imagem ainda grande demais após compactar. Use outra foto menor.'));
                            return;
                        }
                        resolve(out);
                    };
                    image.onerror = function() { reject(new Error('Arquivo de imagem inválido.')); };
                    image.src = dataUrl;
                };
                reader.readAsDataURL(file);
            });
        }

        window.limparImagemProduto = function() {
            const urlEl = document.getElementById('prodImage');
            const fileEl = document.getElementById('prodImageFile');
            if (urlEl) urlEl.value = '';
            if (fileEl) fileEl.value = '';
            atualizarPreviewImagem('');
            setProdImageStatus('');
        };

        function ligarEventosImagemProduto() {
            const fileEl = document.getElementById('prodImageFile');
            const urlEl = document.getElementById('prodImage');
            if (fileEl && !fileEl._farmaBound) {
                fileEl._farmaBound = true;
                fileEl.addEventListener('change', function() {
                    const file = fileEl.files && fileEl.files[0];
                    if (!file) return;
                    setProdImageStatus('Processando imagem…');
                    processarArquivoImagem(file).then(function(dataUrl) {
                        if (urlEl) urlEl.value = dataUrl;
                        atualizarPreviewImagem(dataUrl);
                        const kb = Math.round(dataUrl.length / 1024);
                        setProdImageStatus('Imagem pronta (~' + kb + ' KB). Será salva com o produto.');
                    }).catch(function(err) {
                        setProdImageStatus(err.message || 'Erro ao processar imagem', true);
                        fileEl.value = '';
                    });
                });
            }
            if (urlEl && !urlEl._farmaBound) {
                urlEl._farmaBound = true;
                urlEl.addEventListener('input', function() {
                    const v = urlEl.value.trim();
                    if (v.indexOf('http') === 0 || v.indexOf('data:image') === 0) {
                        atualizarPreviewImagem(v);
                        setProdImageStatus(v.indexOf('data:image') === 0 ? 'Imagem embutida carregada.' : 'Prévia pela URL.');
                    } else if (!v) {
                        atualizarPreviewImagem('');
                        setProdImageStatus('');
                    }
                });
            }
        }

        function abrirModalNovo() {
            const modalTitleEl = document.getElementById('modalTitle');
            const editProdIdEl = document.getElementById('editProdId');
            const addProductFormEl = document.getElementById('addProductForm');
            const prodStatusEl = document.getElementById('prodStatus');
            const prodTypeEl = document.getElementById('prodType');
            const prodRequiresRxEl = document.getElementById('prodRequiresRx');
            const prodIsOfferEl = document.getElementById('prodIsOffer');
            const discountTypeEl = document.getElementById('discountType');
            const prodHasQuestionnaireEl = document.getElementById('prodHasQuestionnaire');
            const qSuccessMsgEl = document.getElementById('qSuccessMsg');
            const qErrorMsgEl = document.getElementById('qErrorMsg');
            const questionsListAdmin = document.getElementById('questionsListAdmin');
            const questionnaireEditor = document.getElementById('questionnaireEditor');

            if (modalTitleEl) modalTitleEl.innerText = "Cadastrar Produto";
            if (editProdIdEl) editProdIdEl.value = "";
            if (addProductFormEl) addProductFormEl.reset();
            if (prodStatusEl) prodStatusEl.value = "disponivel";
            if (prodTypeEl) prodTypeEl.value = "medicamento";
            if (prodRequiresRxEl) prodRequiresRxEl.checked = false;
            if (prodIsOfferEl) prodIsOfferEl.checked = false;
            if (discountTypeEl) discountTypeEl.value = "none";
            if (prodHasQuestionnaireEl) prodHasQuestionnaireEl.checked = false;
            const psN = document.getElementById('prodStock');
            const psaN = document.getElementById('prodStockAlert');
            if (psN) psN.value = '';
            if (psaN) psaN.value = '5';
            if (qSuccessMsgEl) qSuccessMsgEl.value = "Você pode prosseguir com a compra. Siga as orientações da bula e consulte o farmacêutico se tiver dúvidas.";
            if (qErrorMsgEl) qErrorMsgEl.value = "Este produto não é recomendado para o seu perfil. Consulte um farmacêutico ou médico antes de usar.";
            if (questionsListAdmin) questionsListAdmin.innerHTML = '';
            if (questionnaireEditor) questionnaireEditor.classList.add('hidden');
            
            atualizarOpcoesCategoriasModal();
            atualizarBotoesAdminGlobal();
            window.limparImagemProduto();
            ligarEventosImagemProduto();

            if (adminModal) adminModal.classList.remove('hidden');
        }

        function abrirModalEditar(id) {
            const product = globalState.products.find(p => p.id === id);
            if (!product) return;

            const modalTitleEl = document.getElementById('modalTitle');
            const editProdIdEl = document.getElementById('editProdId');
            const prodNameEl = document.getElementById('prodName');
            const prodTypeEl = document.getElementById('prodType');
            const prodLabEl = document.getElementById('prodLab');
            const prodPriceEl = document.getElementById('prodPrice');
            const prodImageEl = document.getElementById('prodImage');
            const prodStatusEl = document.getElementById('prodStatus');
            const prodRequiresRxEl = document.getElementById('prodRequiresRx');
            const prodIsOfferEl = document.getElementById('prodIsOffer');
            const discountTypeEl = document.getElementById('discountType');
            const discountValueEl = document.getElementById('discountValue');
            const prodPurposeEl = document.getElementById('prodPurpose');
            const prodUsageEl = document.getElementById('prodUsage');
            const prodSideEffectsEl = document.getElementById('prodSideEffects');

            if (modalTitleEl) modalTitleEl.innerText = "Editar Produto";
            if (editProdIdEl) editProdIdEl.value = product.id;
            if (prodNameEl) prodNameEl.value = product.name;
            if (prodTypeEl) prodTypeEl.value = product.type || "medicamento";
            atualizarOpcoesCategoriasModal();

            if (prodLabEl) prodLabEl.value = product.lab || "";
            if (prodPriceEl) prodPriceEl.value = product.price || "";
            if (prodImageEl) prodImageEl.value = product.image || "";
            atualizarPreviewImagem(product.image || "");
            const fileElEdit = document.getElementById('prodImageFile');
            if (fileElEdit) fileElEdit.value = '';
            setProdImageStatus(product.image ? 'Imagem atual carregada.' : '');
            ligarEventosImagemProduto();
            if (prodStatusEl) prodStatusEl.value = product.status || "disponivel";
            const psE = document.getElementById('prodStock');
            const psaE = document.getElementById('prodStockAlert');
            if (psE) psE.value = (typeof product.stock === 'number' ? product.stock : '');
            if (psaE) psaE.value = (typeof product.stockAlert === 'number' ? product.stockAlert : '5');
            if (prodRequiresRxEl) prodRequiresRxEl.checked = product.requiresRx || false;
            if (prodIsOfferEl) prodIsOfferEl.checked = product.isOffer || false;
            if (discountTypeEl) discountTypeEl.value = product.discountType || "none";
            if (discountValueEl) discountValueEl.value = product.discountValue || "";

            // Questionário
            const prodHasQuestionnaireEl = document.getElementById('prodHasQuestionnaire');
            const qSuccessMsgEl = document.getElementById('qSuccessMsg');
            const qErrorMsgEl = document.getElementById('qErrorMsg');
            const questionsListAdmin = document.getElementById('questionsListAdmin');
            const questionnaireEditor = document.getElementById('questionnaireEditor');

            const hasQ = !!(product.hasQuestionnaire && product.questionnaire);
            if (prodHasQuestionnaireEl) prodHasQuestionnaireEl.checked = hasQ;
            if (qSuccessMsgEl) qSuccessMsgEl.value = (product.questionnaire && product.questionnaire.successMessage) || "Você pode prosseguir com a compra. Siga as orientações da bula e consulte o farmacêutico se tiver dúvidas.";
            if (qErrorMsgEl) qErrorMsgEl.value = (product.questionnaire && product.questionnaire.errorMessage) || "Este produto não é recomendado para o seu perfil. Consulte um farmacêutico ou médico antes de usar.";
            
            if (questionsListAdmin) {
                questionsListAdmin.innerHTML = '';
                if (hasQ && product.questionnaire.questions && Array.isArray(product.questionnaire.questions)) {
                    product.questionnaire.questions.forEach((q, idx) => {
                        window.adicionarPerguntaAdmin(q, idx);
                    });
                }
            }
            if (questionnaireEditor) {
                if (hasQ) questionnaireEditor.classList.remove('hidden');
                else questionnaireEditor.classList.add('hidden');
            }

            let activeCats = Array.isArray(product.categories) ? product.categories : [];
            document.querySelectorAll('input[name="prodCat"]').forEach(cb => {
                cb.checked = activeCats.includes(cb.value);
            });

            if (prodPurposeEl) prodPurposeEl.value = product.purpose || "";
            if (prodUsageEl) prodUsageEl.value = product.usage || "";
            if (prodSideEffectsEl) prodSideEffectsEl.value = product.sideEffects || "";

            atualizarBotoesAdminGlobal();
            if (adminModal) adminModal.classList.remove('hidden');
        }

        function fecharModalAdmin() {
            if (adminModal) adminModal.classList.add('hidden');
            const addProductFormEl = document.getElementById('addProductForm');
            if (addProductFormEl) addProductFormEl.reset();
            try { window.limparImagemProduto(); } catch (e) {}
        }

        function pedirConfirmacaoExclusao(id) {
            const product = globalState.products.find(function(p) { return p.id === id; });
            const name = product ? product.name : 'este produto';
            const deleteTargetIdEl = document.getElementById('deleteTargetId');
            const deleteConfirmTextEl = document.getElementById('deleteConfirmText');
            if (deleteTargetIdEl) deleteTargetIdEl.value = id;
            if (deleteConfirmTextEl) deleteConfirmTextEl.innerHTML = 'Tem a certeza de que deseja apagar permanentemente o produto <b>"' + escapeHtml(name) + '"</b>?';
            if (deleteConfirmModal) deleteConfirmModal.classList.remove('hidden');
        }

        function fecharModalExclusao() {
            if (deleteConfirmModal) deleteConfirmModal.classList.add('hidden');
            const deleteTargetIdEl = document.getElementById('deleteTargetId');
            if (deleteTargetIdEl) deleteTargetIdEl.value = "";
        }

        async function confirmarExclusaoFinal() {
            try {
                const deleteTargetIdEl = document.getElementById('deleteTargetId');
                const id = deleteTargetIdEl ? deleteTargetIdEl.value : "";
                if (!id) {
                    alert("ID do produto não encontrado.");
                    return;
                }

                fecharModalExclusao();

                globalState.products = globalState.products.filter(function(p) { return p.id !== id; });
                await salvarDadosNuvem();

                atualizarTudoNaTela();
                if (searchInput && searchInput.value.trim()) renderResults(searchInput.value.trim());
                alert("Produto excluído com sucesso!");
            } catch (err) {
                console.error("Erro ao excluir:", err);
                alert("Ocorreu um erro ao excluir o produto. Tente novamente.");
            }
        }

        async function salvarProduto(e) {
            e.preventDefault();
            const saveBtn = document.getElementById('saveProdBtn');

            try {
                const selectedCategories = [];
                document.querySelectorAll('input[name="prodCat"]:checked').forEach(cb => {
                    selectedCategories.push(cb.value);
                });

                if (selectedCategories.length === 0) {
                    alert("Por favor, selecione pelo menos uma categoria.");
                    return;
                }

                if (saveBtn) {
                    saveBtn.disabled = true;
                    saveBtn.innerHTML = `<i class="fas fa-spinner animate-spin"></i> Salvando...`;
                }

                const editIdEl = document.getElementById('editProdId');
                const editId = editIdEl ? editIdEl.value : "";
                const prodIsOfferEl = document.getElementById('prodIsOffer');
                const isOfferChecked = globalState.ofertasAtivas && prodIsOfferEl && prodIsOfferEl.checked;

                const prodNameEl = document.getElementById('prodName');
                const prodTypeEl = document.getElementById('prodType');
                const prodLabEl = document.getElementById('prodLab');
                const prodPriceEl = document.getElementById('prodPrice');
                const discountTypeEl = document.getElementById('discountType');
                const discountValueEl = document.getElementById('discountValue');
                const prodImageEl = document.getElementById('prodImage');
                const prodStatusEl = document.getElementById('prodStatus');
                const prodRequiresRxEl = document.getElementById('prodRequiresRx');
                const prodPurposeEl = document.getElementById('prodPurpose');
                const prodUsageEl = document.getElementById('prodUsage');
                const prodSideEffectsEl = document.getElementById('prodSideEffects');

                // Coletar dados do questionário
                const prodHasQuestionnaireEl = document.getElementById('prodHasQuestionnaire');
                const isMedicamento = prodTypeEl && prodTypeEl.value === 'medicamento';
                const hasQuestionnaire = isMedicamento && prodHasQuestionnaireEl && prodHasQuestionnaireEl.checked;
                let questionnaireData = null;

                if (hasQuestionnaire) {
                    const qSuccessMsgEl = document.getElementById('qSuccessMsg');
                    const qErrorMsgEl = document.getElementById('qErrorMsg');
                    const questionBlocks = document.querySelectorAll('#questionsListAdmin .question-admin-block');
                    
                    if (questionBlocks.length === 0) {
                        alert("Você ativou o questionário, mas não adicionou nenhuma pergunta.\nAdicione pelo menos uma pergunta ou desative o questionário.");
                        return;
                    }

                    const questions = [];
                    let hasError = false;
                    questionBlocks.forEach(function(block, idx) {
                        const textInput = block.querySelector('.q-text-input');
                        const qText = textInput ? textInput.value.trim() : '';
                        const options = [];
                        let hasCorrect = false;
                        block.querySelectorAll('.q-option-row').forEach(function(optRow) {
                            const optTextEl = optRow.querySelector('.q-opt-text');
                            const optCorrectEl = optRow.querySelector('.q-opt-correct');
                            const optText = optTextEl ? optTextEl.value.trim() : '';
                            const isCorrect = optCorrectEl ? optCorrectEl.checked : false;
                            if (optText) {
                                options.push({ text: optText, isCorrect: isCorrect });
                                if (isCorrect) hasCorrect = true;
                            }
                        });
                        if (!qText || options.length < 2) {
                            hasError = true;
                        }
                        if (!hasCorrect) {
                            hasError = true;
                        }
                        questions.push({
                            id: 'q_' + (idx + 1) + '_' + Date.now(),
                            text: qText,
                            options: options
                        });
                    });

                    if (hasError) {
                        alert("Cada pergunta precisa ter:\n• Um texto\n• Pelo menos 2 opções\n• Uma opção marcada como correta");
                        return;
                    }

                    questionnaireData = {
                        successMessage: qSuccessMsgEl ? qSuccessMsgEl.value.trim() : "Você pode prosseguir com a compra.",
                        errorMessage: qErrorMsgEl ? qErrorMsgEl.value.trim() : "Este produto não é recomendado para o seu perfil.",
                        questions: questions
                    };
                }

                const prodStockEl = document.getElementById('prodStock');
                const prodStockAlertEl = document.getElementById('prodStockAlert');
                let stockVal = prodStockEl && prodStockEl.value !== '' ? parseInt(prodStockEl.value, 10) : null;
                let stockAlertVal = prodStockAlertEl && prodStockAlertEl.value !== '' ? parseInt(prodStockAlertEl.value, 10) : null;
                let statusFinal = prodStatusEl ? prodStatusEl.value : "disponivel";
                if (stockVal !== null && !isNaN(stockVal) && stockVal <= 0) {
                    statusFinal = "indisponivel";
                    stockVal = 0;
                }

                const prodData = {
                    id: editId ? editId : 'prod_' + Date.now(),
                    name: prodNameEl ? prodNameEl.value.trim() : "",
                    type: prodTypeEl ? prodTypeEl.value : "medicamento",
                    lab: prodLabEl ? prodLabEl.value.trim() : "",
                    price: prodPriceEl ? prodPriceEl.value.trim() : "",
                    discountType: discountTypeEl ? discountTypeEl.value : "none",
                    discountValue: discountValueEl ? discountValueEl.value.trim() : "",
                    isOffer: isOfferChecked,
                    image: prodImageEl ? prodImageEl.value.trim() : "",
                    status: statusFinal,
                    stock: stockVal,
                    stockAlert: stockAlertVal,
                    requiresRx: isMedicamento ? (prodRequiresRxEl ? prodRequiresRxEl.checked : false) : false,
                    hasQuestionnaire: !!hasQuestionnaire,
                    questionnaire: questionnaireData,
                    categories: selectedCategories,
                    purpose: prodPurposeEl ? prodPurposeEl.value.trim() : "",
                    usage: prodUsageEl ? prodUsageEl.value.trim() : "",
                    sideEffects: prodSideEffectsEl ? prodSideEffectsEl.value.trim() : "",
                    updatedAt: new Date().toISOString()
                };

                if (!prodData.name) {
                    alert("O nome do produto é obrigatório.");
                    return;
                }

                if (editId) {
                    const index = globalState.products.findIndex(function(p) { return p.id === editId; });
                    if (index !== -1) {
                        globalState.products[index] = prodData;
                    }
                    alert('Produto "' + prodData.name + '" atualizado com sucesso!');
                } else {
                    globalState.products.unshift(prodData);
                    alert('Produto "' + prodData.name + '" cadastrado com sucesso!');
                }

                await salvarDadosNuvem();

                fecharModalAdmin();
                atualizarTudoNaTela();
                if (searchInput && searchInput.value.trim()) renderResults(searchInput.value.trim());

            } catch (err) {
                console.error("Erro ao salvar produto:", err);
                alert("Ocorreu um erro ao salvar. Tente novamente.\nDetalhe: " + (err.message || err));
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<span>Salvar</span>';
                }
            }
        }

        // ========== QUESTIONÁRIO DE SEGURANÇA ==========
        let currentQuestionnaireProduct = null;
        let currentWaMessage = '';

        window.toggleQuestionnaireEditor = function() {
            const checkbox = document.getElementById('prodHasQuestionnaire');
            const editor = document.getElementById('questionnaireEditor');
            if (checkbox && editor) {
                if (checkbox.checked) {
                    editor.classList.remove('hidden');
                    const list = document.getElementById('questionsListAdmin');
                    if (list && list.children.length === 0) {
                        window.adicionarPerguntaAdmin();
                    }
                } else {
                    editor.classList.add('hidden');
                }
            }
        };

        window.adicionarPerguntaAdmin = function(existingQ = null, index = null) {
            const list = document.getElementById('questionsListAdmin');
            if (!list) return;
            const qId = 'admin_q_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            const qText = existingQ ? existingQ.text : '';
            const options = existingQ && Array.isArray(existingQ.options) ? existingQ.options : [
                { text: 'Sim', isCorrect: false },
                { text: 'Não', isCorrect: true }
            ];

            let optionsHTML = '';
            options.forEach((opt, i) => {
                optionsHTML += `
                    <div class="q-option-row flex items-center gap-2 mb-1">
                        <input type="radio" name="correct_${qId}" class="q-opt-correct w-4 h-4 text-purple-600" ${opt.isCorrect ? 'checked' : ''}>
                        <input type="text" class="q-opt-text flex-1 border border-gray-300 rounded px-2 py-1 text-sm" value="${escapeHtml(opt.text || '')}" placeholder="Opção ${i + 1}">
                        <button type="button" onclick="this.closest('.q-option-row').remove()" class="text-red-500 hover:text-red-700 text-xs cursor-pointer" title="Remover opção"><i class="fas fa-times"></i></button>
                    </div>`;
            });

            const block = document.createElement('div');
            block.className = 'question-admin-block bg-white p-3 rounded-lg border border-purple-200 relative';
            block.innerHTML = `
                <button type="button" onclick="this.closest('.question-admin-block').remove()" class="absolute top-2 right-2 text-red-500 hover:text-red-700 cursor-pointer" title="Remover pergunta">
                    <i class="fas fa-trash-alt"></i>
                </button>
                <label class="block text-xs font-bold text-purple-800 mb-1">Pergunta</label>
                <input type="text" class="q-text-input w-full border border-gray-300 rounded-lg p-2 text-sm mb-2" value="${escapeHtml(qText || '')}" placeholder="Ex: Você tem diabetes?">
                <label class="block text-xs font-bold text-gray-600 mb-1">Opções (marque a correta)</label>
                <div class="options-container space-y-1 mb-2">
                    ${optionsHTML}
                </div>
                <button type="button" onclick="window.adicionarOpcaoAdmin(this)" class="text-xs text-purple-600 hover:text-purple-800 font-semibold cursor-pointer">
                    <i class="fas fa-plus"></i> Adicionar opção
                </button>
            `;
            list.appendChild(block);
        };

        window.adicionarOpcaoAdmin = function(btn) {
            const container = btn.previousElementSibling;
            if (!container) return;
            const qBlock = btn.closest('.question-admin-block');
            const radios = qBlock.querySelectorAll('.q-opt-correct');
            const name = radios.length > 0 ? radios[0].name : 'correct_' + Date.now();
            const row = document.createElement('div');
            row.className = 'q-option-row flex items-center gap-2 mb-1';
            row.innerHTML = `
                <input type="radio" name="${name}" class="q-opt-correct w-4 h-4 text-purple-600">
                <input type="text" class="q-opt-text flex-1 border border-gray-300 rounded px-2 py-1 text-sm" placeholder="Nova opção">
                <button type="button" onclick="this.closest('.q-option-row').remove()" class="text-red-500 hover:text-red-700 text-xs cursor-pointer" title="Remover opção"><i class="fas fa-times"></i></button>
            `;
            container.appendChild(row);
        };

        window.abrirQuestionario = function(productId) {
            const product = globalState.products.find(p => p.id === productId);
            if (!product || !product.hasQuestionnaire || !product.questionnaire || !product.questionnaire.questions) {
                alert("Questionário não configurado para este produto.");
                return;
            }

            currentQuestionnaireProduct = product;
            
            // Preparar mensagem do WhatsApp
            let calcP = calcularPrecoFinal(product);
            let labOuMarcaQ = '';
            if (product.lab && product.lab.trim() !== '') {
                labOuMarcaQ = product.type === 'geral' ? ` (Marca: ${product.lab.trim()})` : ` (Lab: ${product.lab.trim()})`;
            }
            currentWaMessage = `Olá! Gostaria de encomendar o produto *${product.name}*${labOuMarcaQ}`;
            if (calcP.final !== "") currentWaMessage += ` por *R$ ${calcP.final}*`;
            currentWaMessage += ` (passei no questionário de segurança)`;

            const modal = document.getElementById('questionnaireModal');
            const nameEl = document.getElementById('qProductName');
            const questionsContainer = document.getElementById('questionsContainer');
            const resultMsg = document.getElementById('qResultMessage');
            const submitBtn = document.getElementById('btnSubmitQuestionnaire');

            if (nameEl) nameEl.innerHTML = '<i class="fas fa-pills mr-1"></i> <strong>' + escapeHtml(product.name) + '</strong> — Responda as perguntas abaixo com atenção:';
            if (resultMsg) {
                resultMsg.classList.add('hidden');
                resultMsg.innerHTML = '';
            }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fas fa-check-circle"></i> Confirmar Respostas`;
                submitBtn.classList.remove('hidden');
            }

            if (questionsContainer) {
                questionsContainer.innerHTML = '';
                product.questionnaire.questions.forEach((q, qIdx) => {
                    let optionsHTML = '';
                    q.options.forEach((opt, oIdx) => {
                        optionsHTML += `
                            <label class="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 hover:bg-purple-50 cursor-pointer transition-colors">
                                <input type="radio" name="client_q_${qIdx}" value="${oIdx}" class="w-4 h-4 text-purple-600">
                                <span class="text-sm text-gray-800">${escapeHtml(opt.text)}</span>
                            </label>`;
                    });
                    questionsContainer.innerHTML += `
                        <div class="question-client-block" data-qindex="${qIdx}">
                            <p class="font-semibold text-gray-800 mb-2 text-sm"><span class="bg-purple-100 text-purple-800 text-xs font-bold px-2 py-0.5 rounded mr-1">${qIdx + 1}</span> ${escapeHtml(q.text)}</p>
                            <div class="space-y-1.5">${optionsHTML}</div>
                        </div>`;
                });
            }

            if (modal) modal.classList.remove('hidden');
        };

        window.fecharQuestionario = function() {
            const modal = document.getElementById('questionnaireModal');
            if (modal) modal.classList.add('hidden');
            currentQuestionnaireProduct = null;
            currentWaMessage = '';
        };

        window.validarQuestionario = function() {
            if (!currentQuestionnaireProduct || !currentQuestionnaireProduct.questionnaire) return;

            const questions = currentQuestionnaireProduct.questionnaire.questions;
            let allCorrect = true;
            let unanswered = false;

            questions.forEach((q, qIdx) => {
                const selected = document.querySelector(`input[name="client_q_${qIdx}"]:checked`);
                if (!selected) {
                    unanswered = true;
                    allCorrect = false;
                    return;
                }
                const selectedIdx = parseInt(selected.value, 10);
                const isCorrect = q.options[selectedIdx] && q.options[selectedIdx].isCorrect === true;
                if (!isCorrect) allCorrect = false;
            });

            const resultMsg = document.getElementById('qResultMessage');
            const submitBtn = document.getElementById('btnSubmitQuestionnaire');

            if (unanswered) {
                if (resultMsg) {
                    resultMsg.classList.remove('hidden');
                    resultMsg.className = 'mt-5 p-4 rounded-xl text-sm font-medium bg-amber-50 text-amber-800 border border-amber-200';
                    resultMsg.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i> Por favor, responda todas as perguntas antes de confirmar.';
                }
                return;
            }

            if (allCorrect) {
                // Sucesso
                const successMsg = currentQuestionnaireProduct.questionnaire.successMessage || "Você pode prosseguir com a compra.";
                if (resultMsg) {
                    resultMsg.classList.remove('hidden');
                    resultMsg.className = 'mt-5 p-4 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-800 border border-emerald-200';
                    resultMsg.innerHTML = '<i class="fas fa-check-circle mr-1"></i> ' + escapeHtml(successMsg);
                }
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = `<i class="fas fa-spinner animate-spin"></i> Redirecionando...`;
                }
                // Redireciona após 1.8s
                setTimeout(() => {
                    window.open(`https://wa.me/554335471551?text=${encodeURIComponent(currentWaMessage)}`, '_blank');
                    window.fecharQuestionario();
                }, 1800);
            } else {
                // Erro
                const errorMsg = currentQuestionnaireProduct.questionnaire.errorMessage || "Este produto não é recomendado para o seu perfil.";
                if (resultMsg) {
                    resultMsg.classList.remove('hidden');
                    resultMsg.className = 'mt-5 p-4 rounded-xl text-sm font-medium bg-red-50 text-red-700 border border-red-200';
                    resultMsg.innerHTML = '<i class="fas fa-times-circle mr-1"></i> ' + escapeHtml(errorMsg);
                }
                if (submitBtn) {
                    submitBtn.classList.add('hidden');
                }
                // Não redireciona
            }
        };

        // ========== CARRINHO, FAVORITOS, STATUS, LEADS, RELATÓRIOS ==========
        function salvarCartLocal() {
            localStorage.setItem('farma_cart', JSON.stringify(cart));
            atualizarBadgeCarrinho();
        }
        function salvarFavLocal() {
            localStorage.setItem('farma_favorites', JSON.stringify(favorites));
        }
        function atualizarBadgeCarrinho() {
            const n = cart.reduce(function(s, it) { return s + (it.qty || 1); }, 0);
            ['cartBadge', 'cartBadgeMobile'].forEach(function(id) {
                const el = document.getElementById(id);
                if (!el) return;
                if (n > 0) { el.classList.remove('hidden'); el.innerText = n; }
                else el.classList.add('hidden');
            });
        }
        window.adicionarAoCarrinho = function(id) {
            const p = globalState.products.find(function(x) { return x.id === id; });
            if (!p || p.status === 'indisponivel') { alert('Produto indisponível.'); return; }
            const item = cart.find(function(x) { return x.id === id; });
            if (item) item.qty += 1; else cart.push({ id: id, qty: 1 });
            salvarCartLocal();
            alert('"' + p.name + '" adicionado ao carrinho!');
        };
                window.abrirCarrinho = function() {
            const modal = document.getElementById('cartModal');
            const box = document.getElementById('cartItems');
            const totalEl = document.getElementById('cartTotal');
            if (!modal || !box) return;
            box.innerHTML = '';
            let total = 0;
            const s = globalState.settings || {};
            const wa = (s.whatsapp || '554335471551').replace(/\D/g, '');
            // Tipo pedido — área grande para facilitar leitura e toque
            let tipoHtml = '<div class="mb-4 p-4 bg-emerald-50 rounded-xl border-2 border-emerald-200">';
            tipoHtml += '<p class="font-bold text-base text-emerald-900 mb-3"><i class="fas fa-truck-fast mr-2"></i>Tipo de pedido</p>';
            tipoHtml += '<div class="flex flex-col gap-3">';
            if (s.retiradaAtiva !== false) {
                const selR = pedidoTipo === 'retirada';
                tipoHtml += '<label class="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ' + (selR ? 'bg-emerald-600 text-white border-emerald-700 shadow' : 'bg-white text-gray-800 border-gray-300 hover:border-emerald-400') + '"><input type="radio" name="pedidoTipo" value="retirada" class="w-5 h-5 accent-emerald-600" ' + (selR ? 'checked' : '') + ' onchange="window.setPedidoTipo(\'retirada\'); window.abrirCarrinho();"><span class="text-base font-bold">Retirar na loja</span></label>';
            }
            if (s.entregaAtiva !== false) {
                const selE = pedidoTipo === 'entrega';
                tipoHtml += '<label class="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ' + (selE ? 'bg-emerald-600 text-white border-emerald-700 shadow' : 'bg-white text-gray-800 border-gray-300 hover:border-emerald-400') + '"><input type="radio" name="pedidoTipo" value="entrega" class="w-5 h-5 accent-emerald-600" ' + (selE ? 'checked' : '') + ' onchange="window.setPedidoTipo(\'entrega\'); window.abrirCarrinho();"><span class="text-base font-bold">Entrega (consultar no WhatsApp)</span></label>';
            }
            tipoHtml += '</div></div>';
            box.innerHTML = tipoHtml;

            if (cart.length === 0) {
                box.innerHTML += '<p class="text-center text-gray-500 py-8">Carrinho vazio.</p>';
            } else {
                cart.forEach(function(it) {
                    const p = globalState.products.find(function(x) { return x.id === it.id; });
                    if (!p) return;
                    const calc = calcularPrecoFinal(p);
                    const preco = parseFloat((calc.final || '0').replace(',', '.')) || 0;
                    total += preco * (it.qty || 1);
                    box.innerHTML += '<div class="flex justify-between items-center border-b pb-2 gap-2"><div class="flex-grow"><p class="font-bold text-sm">' + escapeHtml(p.name) + '</p><p class="text-xs text-gray-500">' + escapeHtml(p.lab || '') + ' · R$ ' + (calc.final || '—') + '</p></div><div class="flex items-center gap-1"><button type="button" onclick="window.alterarQtdCarrinho(\'' + it.id + '\',-1)" class="w-7 h-7 rounded bg-gray-200 font-bold cursor-pointer">-</button><span class="w-6 text-center text-sm font-bold">' + (it.qty||1) + '</span><button type="button" onclick="window.alterarQtdCarrinho(\'' + it.id + '\',1)" class="w-7 h-7 rounded bg-gray-200 font-bold cursor-pointer">+</button></div><button onclick="window.removerDoCarrinho(\'' + it.id + '\')" class="text-red-500 text-xs font-bold cursor-pointer ml-1">X</button></div>';
                });
            }
            if (totalEl) totalEl.innerText = cart.length ? ('Total estimado: R$ ' + total.toFixed(2).replace('.', ',')) : '';
            modal.classList.remove('hidden');
        };
        window.setPedidoTipo = function(t) { pedidoTipo = t; localStorage.setItem('farma_pedido_tipo', t); };
        window.alterarQtdCarrinho = function(id, delta) {
            const item = cart.find(function(x) { return x.id === id; });
            if (!item) return;
            item.qty = Math.max(1, (item.qty || 1) + delta);
            salvarCartLocal();
            window.abrirCarrinho();
        };
        window.fecharCarrinho = function() { const m = document.getElementById('cartModal'); if (m) m.classList.add('hidden'); };
        window.removerDoCarrinho = function(id) {
            cart = cart.filter(function(x) { return x.id !== id; });
            salvarCartLocal();
            window.abrirCarrinho();
        };
        window.limparCarrinho = function() {
            cart = [];
            salvarCartLocal();
            window.abrirCarrinho();
        };
        window.enviarCarrinhoWhatsApp = function() {
            if (cart.length === 0) { alert('Carrinho vazio.'); return; }
            const s = globalState.settings || {};
            const wa = (s.whatsapp || '554335471551').replace(/\D/g, '');
            let msg = 'Olá! Gostaria de pedir os seguintes produtos:\n';
            msg += 'Tipo: *' + (pedidoTipo === 'entrega' ? 'Entrega' : 'Retirada na loja') + '*\n\n';
            let total = 0;
            cart.forEach(function(it, i) {
                const p = globalState.products.find(function(x) { return x.id === it.id; });
                if (!p) return;
                const calc = calcularPrecoFinal(p);
                const preco = parseFloat((calc.final || '0').replace(',', '.')) || 0;
                total += preco * (it.qty || 1);
                const lab = p.lab ? (p.type === 'geral' ? ' (Marca: ' + p.lab + ')' : ' (Lab: ' + p.lab + ')') : '';
                msg += (i + 1) + '. *' + p.name + '*' + lab + ' x' + (it.qty || 1) + (calc.final ? ' — R$ ' + calc.final : '') + '\n';
            });
            msg += '\nTotal estimado: R$ ' + total.toFixed(2).replace('.', ',');
            msg += '\nObrigado!';
            window.open('https://wa.me/' + wa + '?text=' + encodeURIComponent(msg), '_blank');
            window.fecharCarrinho();
        };
        window.toggleFavorito = function(id) {
            const i = favorites.indexOf(id);
            if (i === -1) favorites.push(id); else favorites.splice(i, 1);
            salvarFavLocal();
            // Atualiza só os botões desse produto (não re-renderiza o catálogo inteiro)
            const isFav = favorites.indexOf(id) !== -1;
            document.querySelectorAll('[data-fav-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : String(id).replace(/[^a-zA-Z0-9_-]/g, '\\$&')) + '"]').forEach(function(btn) {
                if (isFav) {
                    btn.className = 'flex-1 bg-pink-100 text-pink-700 border-pink-300 border hover:bg-pink-50 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer';
                    btn.innerHTML = '<i class="fas fa-heart mr-1"></i> Favorito';
                } else {
                    btn.className = 'flex-1 bg-gray-50 text-gray-600 border-gray-200 border hover:bg-pink-50 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer';
                    btn.innerHTML = '<i class="fas fa-heart mr-1"></i> Favoritar';
                }
            });
            // Se o modal de favoritos estiver aberto, atualiza só ele
            const favModal = document.getElementById('favModal');
            if (favModal && !favModal.classList.contains('hidden')) {
                window.abrirFavoritos();
            }
        };
        window.abrirFavoritos = function() {
            const modal = document.getElementById('favModal');
            const box = document.getElementById('favItems');
            if (!modal || !box) return;
            if (favorites.length === 0) {
                box.innerHTML = '<p class="text-center text-gray-500 py-8">Nenhum favorito ainda.</p>';
            } else {
                const parts = [];
                for (var fi = 0; fi < favorites.length; fi++) {
                    var p = globalState.products.find(function(x) { return x.id === favorites[fi]; });
                    if (p) parts.push(criarCardHTML(p));
                }
                box.innerHTML = parts.length ? parts.join('') : '<p class="text-center text-gray-500 py-8">Nenhum favorito ainda.</p>';
            }
            modal.classList.remove('hidden');
        };
        window.fecharFavoritos = function() { const m = document.getElementById('favModal'); if (m) m.classList.add('hidden'); };

        function registrarLead(tipo, nomeProduto) {
            // Desativado: interações/leads não são salvas (privacidade)
            return;
        }
        function registrarBusca(termo) {
            // Desativado: pesquisas não são registradas nem salvas
            return;
        }

        window.pedirProdutoWhatsApp = function(id) {
            const p = globalState.products.find(function(x) { return x.id === id; });
            if (!p) return;
            if (p.requiresRx && p.status !== 'indisponivel') {
                const rxId = document.getElementById('rxPendingId');
                if (rxId) rxId.value = id;
                const rxModal = document.getElementById('rxModal');
                if (rxModal) rxModal.classList.remove('hidden');
                return;
            }
            abrirWhatsAppProduto(p);
        };
        window.confirmarReceitaEPedir = function() {
            const rxId = document.getElementById('rxPendingId');
            const id = rxId ? rxId.value : '';
            const p = globalState.products.find(function(x) { return x.id === id; });
            document.getElementById('rxModal').classList.add('hidden');
            if (p) abrirWhatsAppProduto(p, true);
        };
        function abrirWhatsAppProduto(p, comReceita) {
            let labOuMarca = '';
            if (p.lab && p.lab.trim()) labOuMarca = p.type === 'geral' ? ' (Marca: ' + p.lab.trim() + ')' : ' (Lab: ' + p.lab.trim() + ')';
            const calc = calcularPrecoFinal(p);
            let msg;
            if (p.status === 'indisponivel') {
                msg = 'Olá! Vi no site que o produto *' + p.name + '*' + labOuMarca + ' está esgotado. Gostaria de saber a previsão de chegada.';
            } else {
                msg = 'Olá! Gostaria de encomendar o produto *' + p.name + '*' + labOuMarca;
                if (calc.final) msg += ' por *R$ ' + calc.final + '*';
                if (comReceita) msg += '\n(Tenho ciência de que este item exige receita médica.)';
            }
            const _wa = (getSettings().whatsapp || '554335471551').replace(/\D/g, ''); window.open('https://wa.me/' + _wa + '?text=' + encodeURIComponent(msg), '_blank');
        }

        function atualizarStatusLoja() {
            const el = document.getElementById('statusLojaTexto');
            const bar = document.getElementById('statusLojaBar');
            if (!el || !bar) return;
            const s = getSettings();
            function parseRange(str) {
                if (!str || /fechado/i.test(str)) return null;
                const m = str.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
                if (!m) return null;
                return [parseInt(m[1],10)*60+parseInt(m[2],10), parseInt(m[3],10)*60+parseInt(m[4],10)];
            }
            const now = new Date();
            const day = now.getDay();
            const mins = now.getHours() * 60 + now.getMinutes();
            let range = null;
            if (day >= 1 && day <= 5) range = parseRange(s.horarioSemana);
            else if (day === 6) range = parseRange(s.horarioSabado);
            else range = parseRange(s.horarioDomingo);
            const aberto = range && mins >= range[0] && mins < range[1];
            const labelH = 'Seg–Sex ' + s.horarioSemana + ' · Sáb ' + s.horarioSabado + ' · Dom ' + s.horarioDomingo;
            if (aberto) {
                bar.className = 'text-center text-xs font-bold py-1 bg-emerald-600 text-white';
                el.innerHTML = '<i class="fas fa-store mr-1"></i> Aberto agora · ' + escapeHtml(labelH);
            } else {
                bar.className = 'text-center text-xs font-bold py-1 bg-gray-700 text-white';
                el.innerHTML = '<i class="fas fa-moon mr-1"></i> Fechado no momento · ' + escapeHtml(labelH);
            }
        }

        window.desativarModoAdmin = function() {
            isAdminMode = false;
            const badge = document.getElementById('adminBadge');
            if (badge) badge.classList.add('hidden');
            const rel = document.getElementById('relatoriosPanel');
            if (rel) rel.classList.add('hidden');
            atualizarTudoNaTela();
            alert('Modo administrador desativado.');
        };
        window.abrirRelatorios = function() {
            const panel = document.getElementById('relatoriosPanel');
            const content = document.getElementById('relatoriosContent');
            if (!panel || !content) return;
            panel.classList.remove('hidden');
            const esgotados = globalState.products.filter(function(p) { return p.status === 'indisponivel'; }).length;
            const baixo = globalState.products.filter(function(p) { return typeof p.stock === 'number' && p.stockAlert && p.stock > 0 && p.stock <= p.stockAlert; });
            let html = '<p><strong>Total de produtos:</strong> ' + globalState.products.length + ' · <strong>Esgotados:</strong> ' + esgotados + '</p>';
            html += '<p><strong>Estoque baixo:</strong> ' + (baixo.length ? baixo.map(function(p) { return p.name + ' (' + p.stock + ')'; }).join(', ') : 'Nenhum') + '</p>';
            html += '<p class="text-sm text-gray-600 mt-3">Registro de leads, pedidos e buscas foi desativado por privacidade.</p>';
            content.innerHTML = html;
        };


        function getSettings() {
            return Object.assign({}, defaultSettings, globalState.settings || {});
        }

        function aplicarConfiguracoesNaUI() {
            const s = getSettings();
            // Footer dynamic fields if present
            document.querySelectorAll('[data-cfg="nomeLoja"]').forEach(function(el) { el.textContent = s.nomeLoja; });
            document.querySelectorAll('[data-cfg="endereco"]').forEach(function(el) { el.textContent = s.endereco; });
            document.querySelectorAll('[data-cfg="telefone"]').forEach(function(el) { el.textContent = s.telefone; });
            document.querySelectorAll('[data-cfg="email"]').forEach(function(el) { el.textContent = s.email; });
            var emailLink = document.getElementById('footerEmailLink');
            if (emailLink && s.email) emailLink.href = 'mailto:' + s.email;
            var waLink = document.getElementById('footerWhatsappLink');
            if (waLink && s.whatsapp) waLink.href = 'https://wa.me/' + String(s.whatsapp).replace(/\D/g, '');
            document.querySelectorAll('[data-cfg="farmaceutico"]').forEach(function(el) { el.textContent = s.farmaceutico + (s.crf ? ' · ' + s.crf : ''); });
            document.querySelectorAll('[data-cfg="avisoLegal"]').forEach(function(el) { el.textContent = s.msgAvisoLegal; });
            const horarioEl = document.querySelector('[data-cfg="horario"]');
            if (horarioEl) {
                horarioEl.innerHTML = 'Segunda a Sexta: ' + escapeHtml(s.horarioSemana) + '<br>Sábado: ' + escapeHtml(s.horarioSabado) + '<br>Domingo: ' + escapeHtml(s.horarioDomingo);
            }
            // GA
            if (s.gaId && s.gaId.indexOf('G-') === 0 && !document.getElementById('gaScript')) {
                const scr = document.createElement('script');
                scr.id = 'gaScript';
                scr.async = true;
                scr.src = 'https://www.googletagmanager.com/gtag/js?id=' + s.gaId;
                document.head.appendChild(scr);
                window.dataLayer = window.dataLayer || [];
                function gtag(){ dataLayer.push(arguments); }
                window.gtag = gtag;
                gtag('js', new Date());
                gtag('config', s.gaId);
            }
            atualizarStatusLoja();
        }

        window.abrirConfiguracoes = function() {
            if (!isAdminMode) return;
            const s = getSettings();
            const map = {
                cfgNomeLoja: 'nomeLoja', cfgSlogan: 'slogan', cfgEndereco: 'endereco',
                cfgTelefone: 'telefone', cfgWhatsapp: 'whatsapp', cfgEmail: 'email',
                cfgHorarioSemana: 'horarioSemana', cfgHorarioSabado: 'horarioSabado', cfgHorarioDomingo: 'horarioDomingo',
                cfgFarmaceutico: 'farmaceutico', cfgCrf: 'crf',
                cfgMapaEmbed: 'mapaEmbed', cfgMapaLink: 'mapaLink',
                cfgSobre: 'sobre', cfgPrivacidade: 'politicaPrivacidade', cfgTermos: 'termosUso',
                cfgTrocas: 'politicaTroca', cfgAvisoLegal: 'msgAvisoLegal', cfgGaId: 'gaId'
            };
            Object.keys(map).forEach(function(id) {
                const el = document.getElementById(id);
                if (el) el.value = s[map[id]] || '';
            });
            const faqEl = document.getElementById('cfgFaq');
            if (faqEl) faqEl.value = JSON.stringify(s.faq || [], null, 2);
            const r = document.getElementById('cfgRetirada');
            const e = document.getElementById('cfgEntrega');
            if (r) r.checked = s.retiradaAtiva !== false;
            if (e) e.checked = s.entregaAtiva !== false;
            const modal = document.getElementById('configModal');
            if (modal) modal.classList.remove('hidden');
        };
        window.fecharConfiguracoes = function() {
            const modal = document.getElementById('configModal');
            if (modal) modal.classList.add('hidden');
        };
        window.salvarConfiguracoes = async function(ev) {
            ev.preventDefault();
            let faq = [];
            try { faq = JSON.parse(document.getElementById('cfgFaq').value || '[]'); } catch (err) {
                alert('FAQ inválido. Use JSON válido, ex: [{"q":"Pergunta","a":"Resposta"}]');
                return;
            }
            globalState.settings = {
                nomeLoja: document.getElementById('cfgNomeLoja').value.trim(),
                slogan: document.getElementById('cfgSlogan').value.trim(),
                endereco: document.getElementById('cfgEndereco').value.trim(),
                telefone: document.getElementById('cfgTelefone').value.trim(),
                whatsapp: document.getElementById('cfgWhatsapp').value.replace(/\D/g, ''),
                email: document.getElementById('cfgEmail').value.trim(),
                horarioSemana: document.getElementById('cfgHorarioSemana').value.trim(),
                horarioSabado: document.getElementById('cfgHorarioSabado').value.trim(),
                horarioDomingo: document.getElementById('cfgHorarioDomingo').value.trim(),
                farmaceutico: document.getElementById('cfgFarmaceutico').value.trim(),
                crf: document.getElementById('cfgCrf').value.trim(),
                mapaEmbed: document.getElementById('cfgMapaEmbed').value.trim(),
                mapaLink: document.getElementById('cfgMapaLink').value.trim(),
                sobre: document.getElementById('cfgSobre').value.trim(),
                politicaPrivacidade: document.getElementById('cfgPrivacidade').value.trim(),
                termosUso: document.getElementById('cfgTermos').value.trim(),
                politicaTroca: document.getElementById('cfgTrocas').value.trim(),
                msgAvisoLegal: document.getElementById('cfgAvisoLegal').value.trim(),
                faq: faq,
                gaId: document.getElementById('cfgGaId').value.trim(),
                retiradaAtiva: document.getElementById('cfgRetirada').checked,
                entregaAtiva: document.getElementById('cfgEntrega').checked
            };
            await salvarDadosNuvem();
            aplicarConfiguracoesNaUI();
            window.fecharConfiguracoes();
            alert('Configurações salvas!');
        };

        window.mostrarPagina = function(qual) {
            const s = getSettings();
            const box = document.getElementById('paginaConteudo');
            const mapaBox = document.getElementById('mapaContainer');
            if (!box) return;
            if (mapaBox) mapaBox.classList.add('hidden');
            if (qual === 'sobre') {
                box.innerHTML = '<h3 class="text-xl font-bold text-brandBlue mb-2">Sobre</h3><p class="mb-3">' + escapeHtml(s.sobre || '') + '</p><p class="text-sm"><strong>Farmacêutico responsável:</strong> ' + escapeHtml(s.farmaceutico || '') + (s.crf ? ' · ' + escapeHtml(s.crf) : '') + '</p><p class="text-sm mt-1">' + escapeHtml(s.endereco || '') + '</p>';
            } else if (qual === 'faq') {
                let html = '<h3 class="text-xl font-bold text-brandBlue mb-3">Perguntas frequentes</h3>';
                (s.faq || []).forEach(function(item) {
                    html += '<div class="mb-3"><p class="font-bold">' + escapeHtml(item.q || '') + '</p><p class="text-gray-600">' + escapeHtml(item.a || '') + '</p></div>';
                });
                box.innerHTML = html;
            } else if (qual === 'como-chegar') {
                box.innerHTML = '<h3 class="text-xl font-bold text-brandBlue mb-2">Como chegar</h3><p class="mb-2">' + escapeHtml(s.endereco || '') + '</p><p class="text-sm text-gray-600">Use o mapa abaixo ou abra no Google Maps (gratuito).</p>';
                if (mapaBox) {
                    mapaBox.classList.remove('hidden');
                    const iframe = document.getElementById('mapaIframe');
                    const link = document.getElementById('mapaLinkExt');
                    if (iframe) iframe.src = s.mapaEmbed || '';
                    if (link) link.href = s.mapaLink || '#';
                }
            } else if (qual === 'privacidade') {
                box.innerHTML = '<h3 class="text-xl font-bold text-brandBlue mb-2">Privacidade (LGPD)</h3><p class="whitespace-pre-wrap">' + escapeHtml(s.politicaPrivacidade || '') + '</p>';
            } else if (qual === 'termos') {
                box.innerHTML = '<h3 class="text-xl font-bold text-brandBlue mb-2">Termos de uso</h3><p class="whitespace-pre-wrap">' + escapeHtml(s.termosUso || '') + '</p>';
            } else if (qual === 'trocas') {
                box.innerHTML = '<h3 class="text-xl font-bold text-brandBlue mb-2">Trocas e devoluções</h3><p class="whitespace-pre-wrap">' + escapeHtml(s.politicaTroca || '') + '</p>';
            }
            document.getElementById('paginasInstitucionais').scrollIntoView({ behavior: 'smooth' });
        };

        // Status loja com horários configuráveis

        atualizarBadgeCarrinho();
        atualizarStatusLoja();
        setInterval(atualizarStatusLoja, 60000);

        carregarDadosNuvem();
        // Polling só quando NÃO estiver no modo admin (evita sobrescrever edições locais)
        // Intervalo 45s para reduzir travadas durante scroll
        setInterval(function() {
            if (!isAdminMode) {
                carregarDadosNuvem();
            }
        }, 45000);

        // Scroll leve: só marca body (desliga hover). Carregar mais = Intersection Observer
        var scrollEndTimer = null;
        window.addEventListener('scroll', function() {
            document.body.classList.add('is-scrolling');
            clearTimeout(scrollEndTimer);
            scrollEndTimer = setTimeout(function() {
                document.body.classList.remove('is-scrolling');
            }, 120);
        }, { passive: true });

        // Intersection Observer: carrega mais quando o botão "Carregar mais" entra na tela
        var loadMoreLock = false;
        if ('IntersectionObserver' in window) {
            var ioLoadMore = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (!entry.isIntersecting || loadMoreLock) return;
                    var id = entry.target.id;
                    if (entry.target.classList.contains('hidden')) return;
                    loadMoreLock = true;
                    try {
                        if (id === 'catalogoMedsMore') window.carregarMaisMeds();
                        else if (id === 'catalogoGeralMore') window.carregarMaisGerais();
                        else if (id === 'resultsMore') window.carregarMaisResultados();
                    } finally {
                        setTimeout(function() { loadMoreLock = false; }, 350);
                    }
                });
            }, { root: null, rootMargin: '120px 0px', threshold: 0.01 });

            ['catalogoMedsMore', 'catalogoGeralMore', 'resultsMore'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) ioLoadMore.observe(el);
            });

            // Intersection Observer: monta catálogo só quando a seção se aproxima da tela
            var catalogMounted = false;
            var ioCatalog = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (!entry.isIntersecting || catalogMounted) return;
                    catalogMounted = true;
                    try { renderCatalogo(); } catch (e) {}
                    ioCatalog.disconnect();
                });
            }, { root: null, rootMargin: '240px 0px', threshold: 0.01 });
            var catSec = document.getElementById('catalogo');
            var catGeralSec = document.getElementById('catalogoGeral');
            if (catSec) ioCatalog.observe(catSec);
            if (catGeralSec) ioCatalog.observe(catGeralSec);
            // Se já estiver visível (tela grande), monta na hora
            setTimeout(function() {
                if (!catalogMounted) {
                    var sec = catSec || catGeralSec;
                    if (sec) {
                        var r = sec.getBoundingClientRect();
                        if (r.top < window.innerHeight + 240) {
                            catalogMounted = true;
                            try { renderCatalogo(); } catch (e) {}
                            ioCatalog.disconnect();
                        }
                    }
                }
            }, 100);
            window.__farmaCatalogMounted = function() { return catalogMounted; };

            // Intersection Observer: lazy load avançado de imagens (data-src → src)
            function hydrateLazyImages(root) {
                var scope = root || document;
                var imgs = scope.querySelectorAll('img.farma-lazy[data-src]');
                if (!imgs.length) return;
                if (!('IntersectionObserver' in window)) {
                    imgs.forEach(function(img) {
                        if (img.dataset.src) { img.src = img.dataset.src; img.removeAttribute('data-src'); img.classList.remove('farma-lazy'); }
                    });
                    return;
                }
                if (!window.__farmaImgIO) {
                    window.__farmaImgIO = new IntersectionObserver(function(entries) {
                        entries.forEach(function(entry) {
                            if (!entry.isIntersecting) return;
                            var img = entry.target;
                            var real = img.getAttribute('data-src') || '';
                            if (real) {
                                var safe = safeImageUrl(real);
                                if (safe) {
                                    img.src = safe;
                                }
                                img.removeAttribute('data-src');
                                img.classList.remove('farma-lazy');
                            }
                            window.__farmaImgIO.unobserve(img);
                        });
                    }, { root: null, rootMargin: '180px 0px', threshold: 0.01 });
                }
                imgs.forEach(function(img) { window.__farmaImgIO.observe(img); });
            }
            window.hydrateLazyImages = hydrateLazyImages;
            // Observa grids quando conteúdo muda
            var imgRoots = [catalogoGrid, catalogoGeralGrid, resultsContainer, document.getElementById('ofertasGrid'), document.getElementById('indisponiveisGrid'), document.getElementById('favItems')];
            imgRoots.forEach(function(root) {
                if (!root) return;
                var mo = new MutationObserver(function() { hydrateLazyImages(root); });
                mo.observe(root, { childList: true, subtree: true });
            });

            window.__farmaForceCatalog = function() {
                if (!catalogMounted) {
                    catalogMounted = true;
                    try { renderCatalogo(); } catch (e) {}
                    try { ioCatalog.disconnect(); } catch (e) {}
                } else {
                    renderCatalogo();
                }
            };
        }

        // Navegação do menu: scroll instantâneo e confiável (sem fila de smooth)
        document.querySelectorAll('a[href^="#"]').forEach(function(a) {
            a.addEventListener('click', function(ev) {
                var href = a.getAttribute('href');
                if (!href || href === '#') return;
                var target = document.querySelector(href);
                if (!target) return;
                ev.preventDefault();
                var mm = document.getElementById('mobile-menu');
                if (mm) mm.classList.add('hidden');
                // Garante catálogo montado se for para essas seções
                if ((href === '#catalogo' || href === '#catalogoGeral') && typeof window.__farmaForceCatalog === 'function') {
                    window.__farmaForceCatalog();
                }
                var top = target.getBoundingClientRect().top + (window.pageYOffset || 0) - 80;
                window.scrollTo(0, Math.max(0, top));
            });
        });

        window.abrirModalNovo = abrirModalNovo;
        window.abrirModalEditar = abrirModalEditar;
        window.fecharModalAdmin = fecharModalAdmin;
        window.salvarProduto = salvarProduto;
        window.pedirConfirmacaoExclusao = pedirConfirmacaoExclusao;
        window.fecharModalExclusao = fecharModalExclusao;
        window.confirmarExclusaoFinal = confirmarExclusaoFinal;
        window.filtrarCatalogo = function() {
            pageState.meds = PAGE_SIZE;
            pageState.gerais = PAGE_SIZE;
            if (typeof window.__farmaForceCatalog === 'function') window.__farmaForceCatalog();
            else renderCatalogo();
        };
        window.filtrarCatalogoGeral = function() {
            pageState.meds = PAGE_SIZE;
            pageState.gerais = PAGE_SIZE;
            if (typeof window.__farmaForceCatalog === 'function') window.__farmaForceCatalog();
            else renderCatalogo();
        };
        window.alternarSecaoIndisponiveisAdmin = alternarSecaoIndisponiveisAdmin;
        window.atualizarOpcoesCategoriasModal = atualizarOpcoesCategoriasModal;

        if (searchInput) {
            var runSearch = debounce(function(val) {
                pageState.results = PAGE_SIZE;
                renderResults(val);
            }, 280);
            searchInput.addEventListener('input', function(e) {
                const val = e.target.value || '';
                // Se o usuário digita manualmente, limpa seleção de sintomas (evita UI dessincronizada)
                const esperado = sintomasAtivos.length ? sintomasAtivos.join(' + ') : '';
                if (sintomasAtivos.length && val !== esperado) {
                    sintomasAtivos = [];
                    atualizarVisualSintomas();
                }
                // Admin code: responde na hora (sem esperar debounce)
                if (ADMIN_CODE && val.trim() === ADMIN_CODE) {
                    pageState.results = PAGE_SIZE;
                    renderResults(val);
                    return;
                }
                runSearch(val);
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                const searchLabFilter = document.getElementById('searchLabFilter');
                const searchBrandFilter = document.getElementById('searchBrandFilter');
                if (searchLabFilter) searchLabFilter.value = 'TODOS';
                if (searchBrandFilter) searchBrandFilter.value = 'TODOS';
                sintomasAtivos = [];
                atualizarVisualSintomas();
                pageState.results = PAGE_SIZE;
                renderResults('');
                if (searchInput) searchInput.focus();
            });
        }

        // Ao carregar a página, já popula os filtros de lab/marca da busca com todos os produtos
        setTimeout(function() {
            popularFiltrosBusca(globalState.products);
            const bar = document.getElementById('searchFiltersBar');
            if (bar) bar.classList.remove('hidden');
        }, 500);

        atualizarOpcoesCategoriasModal();
        atualizarTudoNaTela();
        try { ligarEventosImagemProduto(); } catch (e) {}

        // --- Métricas estilo Lighthouse (Web Vitals) ---
        window.__farmaPerf = { lcp: null, fcp: null, cls: 0, inp: null, ttfb: null, records: [] };

        function farmaPerfLog(name, value, rating) {
            var rec = { name: name, value: Math.round(value * 100) / 100, rating: rating || '', t: Date.now() };
            window.__farmaPerf.records.push(rec);
            if (window.__farmaPerf.records.length > 30) window.__farmaPerf.records.shift();
            try {
                console.log('%cFARMA Perf%c ' + name + ': ' + rec.value + (rating ? ' (' + rating + ')' : ''),
                    'background:#001B94;color:#FFDE00;padding:2px 6px;border-radius:4px', 'color:inherit');
            } catch (e) {}
        }
        function rateLCP(v) { return v <= 2500 ? 'bom' : v <= 4000 ? 'melhorar' : 'ruim'; }
        function rateFCP(v) { return v <= 1800 ? 'bom' : v <= 3000 ? 'melhorar' : 'ruim'; }
        function rateCLS(v) { return v <= 0.1 ? 'bom' : v <= 0.25 ? 'melhorar' : 'ruim'; }
        function rateINP(v) { return v <= 200 ? 'bom' : v <= 500 ? 'melhorar' : 'ruim'; }

        try {
            if (performance.getEntriesByType) {
                var nav = performance.getEntriesByType('navigation')[0];
                if (nav && nav.responseStart) {
                    window.__farmaPerf.ttfb = nav.responseStart;
                    farmaPerfLog('TTFB', nav.responseStart, nav.responseStart <= 800 ? 'bom' : 'melhorar');
                }
            }
            if (typeof PerformanceObserver !== 'undefined') {
                try {
                    var poFcp = new PerformanceObserver(function(list) {
                        list.getEntries().forEach(function(e) {
                            if (e.name === 'first-contentful-paint') {
                                window.__farmaPerf.fcp = e.startTime;
                                farmaPerfLog('FCP', e.startTime, rateFCP(e.startTime));
                            }
                        });
                    });
                    poFcp.observe({ type: 'paint', buffered: true });
                } catch (e) {}
                try {
                    var poLcp = new PerformanceObserver(function(list) {
                        var entries = list.getEntries();
                        if (!entries.length) return;
                        var last = entries[entries.length - 1];
                        window.__farmaPerf.lcp = last.startTime;
                        farmaPerfLog('LCP', last.startTime, rateLCP(last.startTime));
                    });
                    poLcp.observe({ type: 'largest-contentful-paint', buffered: true });
                } catch (e) {}
                try {
                    var clsVal = 0;
                    var poCls = new PerformanceObserver(function(list) {
                        list.getEntries().forEach(function(e) {
                            if (!e.hadRecentInput) clsVal += e.value;
                        });
                        window.__farmaPerf.cls = clsVal;
                        farmaPerfLog('CLS', clsVal, rateCLS(clsVal));
                    });
                    poCls.observe({ type: 'layout-shift', buffered: true });
                } catch (e) {}
                try {
                    var poInp = new PerformanceObserver(function(list) {
                        list.getEntries().forEach(function(e) {
                            var v = e.duration;
                            window.__farmaPerf.inp = v;
                            farmaPerfLog('INP', v, rateINP(v));
                        });
                    });
                    poInp.observe({ type: 'event', buffered: true, durationThreshold: 16 });
                } catch (e) {}
            }
        } catch (e) {}

        window.farmaPerfSummary = function() {
            var p = window.__farmaPerf;
            return {
                TTFB: p.ttfb, FCP: p.fcp, LCP: p.lcp, CLS: p.cls, INP: p.inp,
                records: p.records.slice()
            };
        };

        // Service Worker + atualização
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
                navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function(reg) {
                    console.log('FARMA SW ativo', reg.scope);
                    if (reg.waiting) {
                        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                    }
                    reg.addEventListener('updatefound', function() {
                        var nw = reg.installing;
                        if (!nw) return;
                        nw.addEventListener('statechange', function() {
                            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                                console.log('FARMA SW: nova versão pronta');
                            }
                        });
                    });
                }).catch(function(err) {
                    console.log('FARMA SW não registrado', err);
                });
            });
        }
    