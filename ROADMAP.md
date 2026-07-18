# ZENT MONEY — ROADMAP MESTRE

Você é o time completo (arquiteto, designer sênior, QA) do Zent Money — app Electron+React+TS de finanças pessoais do Allan. O repositório está na **Release 4 completa** (confira `AUDITORIA.md`: ledger derivado, taxas ao vivo, 147 unit + 26 E2E). Este documento é **autossuficiente**: contém tudo que falta até o v2.0.0. Não dependa de nenhum outro prompt.

**Primeira ação, antes de tudo:** salve esta mensagem inteira como `ROADMAP.md` na raiz do repositório e commite. Toda janela futura começa lendo `ROADMAP.md` + `AUDITORIA.md` + `DECISOES.md`.

## Regras de trabalho (valem para todos os milestones)
1. Um milestone por vez. Para cada um: plano em ≤15 linhas → **aguardar meu OK** → executar → suíte completa verde (unit + E2E + typecheck + lint + smoke) → atualizar `AUDITORIA.md`/`DECISOES.md` → **commit + push** (Conventional Commits em português).
2. Nenhum teste ou script toca dados reais nem rede real (regra já vigente: `ZENT_USER_DATA` + `ZENT_OFFLINE=1`).
3. Sobriedade inegociável: paleta navy + 1 acento, zero emojis, zero cor fora de token, `prefers-reduced-motion` respeitado, performance 50k sem regressão.
4. Meu PIN **nunca** aparece em arquivo, log, teste, screenshot ou documento — eu o digito pessoalmente no app.

---

## M0 — GitHub (proteção antes de qualquer mudança)
- Criar/usar repositório **privado** `zent-money` em `github.com/Allann-as`. Me guie pelo `gh auth login` (browser flow); nunca peça token/senha em texto.
- `.gitignore` correto (node_modules, out/, release/, dados de usuário, caches). Push de todo o histórico atual.
- **Instalador nunca entra no git**: publicar `release/ZentMoney-Setup-*.exe` como asset de **GitHub Release** (`gh release create`) a cada versão, com changelog curto.
- README ganha seção "retomar em outra máquina" (clonar → instalar → rodar → onde baixar o instalador).
- Daqui em diante, todo milestone termina com push; todo release de app, com tag + Release.

## M1 — Integridade pendente (restos das specs V5/V6)
**a) Teste de propriedade criar→excluir:** para QUALQUER tipo de lançamento (gasto com/sem origem, extra, transferência, salário registrado, pagamento de fatura, ajuste, aporte, parcela), a sequência criar→excluir devolve TODOS os números do app (saldo por banco, entrou, saiu, sobra, patrimônio, compromissos) **exatamente ao estado anterior**. Se cobertura equivalente já existir, prove apontando os testes; senão, implemente. Segundo invariante: eventos internos de reversão nunca aparecem como ganho/gasto nas listas e agregações.
**b) Toggle rosca/barras no "Resumo por categoria" (Gastos):** dois botões-ícone SVG ao lado do título (barras = padrão atual; preferência persistida). Rosca: cores das categorias, **total do mês no centro**, hover destaca o segmento com tooltip "Categoria — R$ valor · X%". Reutilizar o componente de rosca existente (um único no app).
**c) Orçamento 2.0 (spec V6 completa):**
- Disponível explícito em toda visão de orçamento: "Disponível: R$ 8,00 de R$ 200,00"; ≥80% âmbar "Restam R$ X"; ≥100% vermelho "Limite atingido — R$ X acima do planejado".
- Ao lançar gasto que estoura o limite da categoria: aviso pré-salvar com "Lançar mesmo assim" e "Realocar orçamento".
- **Realocação entre categorias**: `limite efetivo do mês = limite base + recebido − cedido`; vale SÓ no mês (virada volta ao base — testar); modal origem→destino→valor com antes/depois; validações (origem com limite, efetivo nunca negativo); indicador "R$ 200 → R$ 150 este mês" com tooltip do histórico e desfazer individual; **realocação nunca toca o ledger** (testar). Migração de schema.

## M2 — Segurança
**a) Privacidade por máscara (substitui o blur):** com privacidade ativa, valores monetários renderizam `R$ ••••••` — o valor real **não vai ao DOM** dos componentes mascarados; gráficos sem rótulos de valor e sem tooltip; copiar-valor desativado. E2E: com privacidade ativa, o DOM não contém nenhum valor real.
**b) Tela de bloqueio por PIN:** PIN numérico 4–6 dígitos definido na **primeira execução** (boas-vindas → definir → confirmar); bolinhas translúcidas que preenchem a cada dígito, shake sutil no erro; teclado clicável + físico; identidade Zent (é a tela mais bonita do app). Armazenar só hash `crypto.scrypt` com salt; throttling progressivo após 5 erros; alterar PIN no perfil; "esqueci o PIN" reseta só o PIN com fricção (digitar RESET); auto-bloqueio configurável (padrão: só ao abrir). Texto honesto na config: o PIN protege de olhares casuais, não criptografa o arquivo. **Proposta** de criptografia opcional (AES-256-GCM, chave via scrypt, aviso "PIN esquecido = dados irrecuperáveis", backup obrigatório antes) — apresentar para eu aprovar, não implementar por padrão.

## M3 — Direção de arte final (prescritiva; o visual da R3 ficou tímido)
Nada aqui é opcional; onde houver número, siga-o. Só `transform`/`opacity`; zero loop infinito; zero raster pesado.
**Fundo em 4 camadas, todas as telas:** ① gradiente atual; ② dois glows radiais por seção — acento a 6–8%, ~900px, posição DIFERENTE por seção (documentar o mapa) + azul-profundo a 4% no canto oposto; ③ **geometria assinatura por seção** — SVG line-art estático, stroke 1px, 3–4% opacidade, 500–800px, sempre cortado pela borda: Visão geral=3 arcos concêntricos atrás do hero · Ganhos=feixe de linhas ascendentes · Gastos=trilha de recibos · Bancos=grade de retângulos arredondados sobrepostos · Parcelas=anel fragmentado · Carteira=curvas de gráfico entrelaçadas · Caixinhas=círculos orbitais · Linha do tempo=régua de traços com espaçamento crescente; ④ pontilhado atual reduzido a 2%. Proibido: forma >5% de opacidade ou atrás de texto denso.
**Sidebar (redesenho):** colapsada — logo com halo no acento, ícones em 3 grupos (Dia a dia · Crédito · Patrimônio) com divisores 1px a 8%, ativo = pílula 10% + **barra lateral 2px no acento com glow**, tooltip no hover, cluster inferior (busca·privacidade·tema). Expandida — micro-rótulos dos grupos em caps 10px a 40%, perfil com **monograma "A" em círculo com anel**, rodapé com versão. Colapso 240ms `cubic-bezier(0.22,1,0.36,1)`, rótulos com stagger 15ms.
**Cards/hero:** borda superior 1px com gradiente luminoso (acento 25%→transparente), sombra dupla, hover eleva 2px/180ms; chips com glow radial 12%; número do hero +15% com glow ancorado; sparkline com ponto final pulsando UMA vez. **Empty states**: ilustrações line-art únicas por seção (2–3 elementos, stroke 1.5px, 160px, traço neutro + detalhe no acento) — substituem o padrão repetido atual.
**Gráficos:** linhas stroke 2.5px com drop-shadow 4px a 30% e gradiente de área 18→0, desenho 600ms; barras topo 6px com hover +15% brilho; roscas 22px com gap 2px e hover expandindo 3px; **tooltip universal** (card raio 12, borda luminosa, título caps, valor tabular grande, delta % colorido, seta) usado no app inteiro; legendas clicáveis isolam série (demais a 15%).
**Micro:** transição de página fade+slide 8px com stagger 30ms; modal com backdrop que escurece e satura; tela de PIN recebe camadas ①② + logo com halo.
**LOOP OBRIGATÓRIO:** implementar → screenshots de TODAS as telas nos 2 temas → escrever autocrítica de diretor de arte (o que ficou tímido/pesado) → **segunda passada** corrigindo → screenshots finais. Crítica + capturas vão para o `AUDITORIA.md`. Tímido = reprovado.

## M4 — Gamificação sóbria (nada de confete, mascote ou tom infantil)
**Score de saúde financeira (0–100):** anel no hero; fórmula transparente (proposta para meu OK; partida: poupança do mês 40% · categorias dentro do limite efetivo 30% · compromissos/renda 30%); clicar abre detalhamento com nota por componente e **uma ação concreta** ("Reduza R$ 120 em Restaurantes → +6 pts"); mês sem registros = "sem score ainda", nunca zero; histórico na Linha do tempo.
**Streak:** meses consecutivos no azul (sobra ≥ 0 com movimentação); mês sem registro **pausa** (não conta, não quebra); vermelho zera; marcos 3/6/12; quebra comunicada sem bronca; virada de ano testada.
**Conquistas:** estante no perfil com ~12 medalhas SVG minimalistas (desbloqueada em cor, bloqueada em silhueta com critério): 1ª caixinha 100% · 1º aporte · R$1k/5k/10k investidos · streak 3/6/12 · 1º mês score ≥80 · mês com todas as categorias no limite · 1ª parcela quitada · 1º backup exportado. Toast sóbrio no desbloqueio; **idempotente** (testado); retroativo silencioso no 1º boot.
**Desafio mensal:** um ativo por vez, criado por mim ("máx R$ X em [categoria]" ou "Y% menos que o mês passado"); widget com barra + dias restantes; avaliado na virada (testar); histórico simples; 3 cumpridos = conquista; não-cumprido em tom neutro.

## M5 — Bandeja + registro de decisões
**Bandeja:** ícone do Zent na bandeja + atalho global `Ctrl+Shift+Z` → mini-janela de lançamento rápido (valor · categoria · descrição opcional · origem opcional · salvar), <1s, Esc fecha, identidade e `MoneyInput` do app. **Se o app estiver bloqueado, a mini-janela exige o PIN antes de exibir qualquer coisa** (versão compacta das bolinhas). Fechar a janela principal minimiza para a bandeja (configurável); menu de contexto (Abrir · Lançamento rápido · Sair). Unit + E2E (reflete no mês e no saldo da origem; bloqueio respeitado).
**DECISOES.md — reprovados pelo Allan** (nunca propor de novo sem pedido explícito): importação OFX/CSV · calculadora nos campos de valor · vencimento/lembrete de fatura · relatório PDF mensal · diagrama Sankey · simulador "E se" · recap mensal · sparklines nos cards · acento personalizável.

## M6 — Fechamento v2.0.0
- **Verificação mestra:** percorrer o app contra TODOS os checklists (R1–R4 do AUDITORIA + M1–M5 deste roadmap); tabela item·origem·status no `AUDITORIA.md`; zero "ausente/divergente" após correções.
- Suíte completa verde; perf 50k medida (fundos novos não podem custar FPS — validar e registrar); varreduras anti-emoji/anti-hex.
- `AUDITORIA.md` com resumo executivo no topo; `README.md` final com guia de manutenção (plano → OK → milestones → testes → commit → Release).
- **Tag `v2.0.0` + GitHub Release** com instalador e changelog. Screenshots finais (2 temas): bloqueio · Visão geral · uma seção com geometria assinatura visível · mini-janela da bandeja · estante de conquistas.

---

**Comece agora:** salve este documento como `ROADMAP.md`, commite, e me apresente o plano do **M0 + M1** em até 15 linhas. Aguarde meu OK antes de executar.
