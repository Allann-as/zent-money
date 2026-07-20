# DECISOES.md — Zent Money

Registro das decisões tomadas onde a especificação deixou eixos livres.

## Guardar/Resgatar + BankPicker (v2.1) — ④

### Guardar/Resgatar só em caixinha MANUAL; investimento usa aporte

- Caixinha vinculada a investimento tem seu valor DERIVADO do investimento
  (`investmentSnapshot`); modelar Guardar/Resgatar nela exigiria representar
  resgate/aporte no investimento e ainda ficaria ambíguo. Então Guardar/Resgatar
  é só para caixinha manual (`investmentId: null`), onde `manualAmount` é a linha
  de base e os `boxTransfers` a movimentam; a vinculada movimenta por aportes na
  Carteira (que ganharam conta de origem). Ver [[ledger-hibrido]].

### boxTransfer é um EVENTO; o guardado é derivado (disciplina da R4)

- Nada de gravar um "saldo guardado" ao lado dos movimentos: `boxStoredAmount =
  manualAmount + Σin − Σout`, e o saldo da conta deriva do mesmo `boxTransfer`
  pelo ledger. Criar→excluir é neutro por construção (apagar o evento devolve
  conta e caixinha) — provado na invariante do M1, agora com dois casos novos.

### Aporte ganhou `fromBankId` nullable (retrocompatível)

- Aporte antigo (fromBankId null) não debita conta — o app de quem não usa
  ledger segue idêntico. Com conta escolhida no BankPicker, o aporte debita como
  Guardar. Uma opção neutra "Não debitar conta" preserva o fluxo antigo.

### Um único `<BankPicker>`, mas zerada-desabilitada só onde se CEDE

- O mesmo componente serve Guardar/Resgatar/aporte/gasto/ganho. Mas desabilitar
  conta zerada só faz sentido onde se **cede** dinheiro (Guardar, aporte): num
  gasto a conta pode ficar negativa (o app permite e o histórico denuncia), e
  receber um ganho numa conta zerada é normal. Então a trava de saldo é por
  formulário, não do componente.

## Tela "Hoje" (v2.1) — ② loop diário

### Limite diário auto-corretivo, e a honestidade do "sem teto"

- Fórmula aprovada: `(Σ limites efetivos das categorias − gasto do mês até
  ontem) ÷ dias restantes` (hoje incluso). Auto-corrige: estourou ontem → aperta
  hoje; economizou → folga. Reusa o EFETIVO do M1c, sem inventar campo. Sem
  categoria com limite → cai no teto diário configurável; **sem os dois, o anel
  mostra só o gasto, sem denominador** — a mesma honestidade do "sem score ainda"
  do M4. Nunca se inventa um teto que o usuário não definiu. Ver [[score]] (M4).

### XP (`engine/xp.ts`) é peça NOVA — o M4 não entregou XP

- O §2 dizia "reusa o XP do M4", mas o M4 só tem score/streak/conquistas/desafio.
  O XP foi construído do zero, mantendo a disciplina: **derivado, nunca gravado**.

### XP enche por SAÚDE, não por VOLUME DE MOVIMENTO (decisão do usuário)

- Duas travas: (1) **hábito por DIA ÚNICO** com atividade, no máx. uma vez/dia —
  nunca por lançamento; spammar cadastros não move a barra. (2) **disciplina
  pesa mais que hábito no mês**: cada evento de disciplina (azul +150, limite +40,
  caixinha +200) vale mais que um dia de hábito (+15), e o hábito tem **teto
  mensal** (`HABIT_MONTH_CAP`), de modo que um mês disciplinado supera o hábito.
  **Nenhuma release futura deve inverter esses pesos sem intenção.** Os números do
  protótipo (+15/+100/+30/+150) eram ilustrativos; os pesos reais (+150/+40/+200)
  foram calibrados para satisfazer a trava "disciplina > hábito".

### Hoje é a seção INICIAL padrão

- `activeView` nasce em 'today' (era 'overview'): é a porta do loop diário, o que
  faz abrir o app todo dia. `activeView` persiste, então quem já usava reabre
  onde estava. O E2E 1 passou a navegar explicitamente à Visão geral.

### Teto diário no uiStore (localStorage), não no arquivo — por ora

- `dailyCapCents` é preferência de UI (como tema/privacidade), fora do schema
  para evitar uma migração só por ele neste milestone. Pode migrar para o arquivo
  na v10 do ④ (Guardar/Resgatar) se quisermos que entre no export/import.

## Redesign "Painel de Bordo" (v2.1) — ① reskin base

### A troca de paleta é de VALOR de token, não de nome

- O reskin reescreve os valores de `--primary`, `--pos`, `--neg`, `--bg`,
  `--surface*`, `--cat-*` e não renomeia nenhum. Por isso o app inteiro trocou
  de identidade sem que um componente, gráfico ou teste mudasse: quem lê token
  continua correto por construção. Mesma lógica da troca de fonte no `.tnum`.

### `--warn` NÃO é o âmbar do acento (deliberado)

- Com o acento agora âmbar, um alerta em âmbar se confundiria com um destaque
  comum — e o Orçamento 2.0 (M1c) depende de ler "≥80% âmbar" como escalada.
  Então `--warn` é um âmbar QUEIMADO/alaranjado, distinto do `--primary` a olho
  nu. Ver [[reprovados]] só como exemplo de decisão documentada.

### Tema claro: identidade vem do MATIZ, não da luminosidade

- O âmbar-fósforo `#F0BC5E` não passa em contraste sobre papel. No claro,
  `--primary` é um âmbar QUEIMADO (`#96680f`) escuro o bastante para texto —
  mesma família, luminosidade sacrificada pelo contraste. A alternativa (manter
  o âmbar claro) reprovaria acessibilidade e o app tem de servir os dois temas.

### O mono no `.tnum` usa `font-size: 0.95em` (relativo, não absoluto)

- JetBrains Mono é mais largo que a Nunito; sem compensar, TODO número do app
  cresceria e um componente reutilizado mudando de tamanho já disparou
  oscilação de layout e corrida de estado no E2E (incidente do M3). O `0.95em`
  relativo devolve a largura ao patamar anterior em cada contexto sem nenhuma
  tela saber que a fonte mudou.

### Toast coalesce por tipo+título (causa-raiz do E2E vermelho)

- O E2E falhava 14/34 **também no baseline v2.0.0** — não era o reskin. Duas
  hipóteses de ambiente (OneDrive; saves famintos sob jank) foram **refutadas
  por experimento**: clone limpo em `C:\dev` reproduziu os mesmos 14, e a falha
  era **determinística** (jank flutuaria). Causa real: `toast.push` **empilhava
  banners de mesmo título** — 3 "Gasto registrado" (4500ms cada) coexistiam numa
  máquina rápida, `getByText` casava 3, o strict-mode quebrava o teste 6 e a
  falha **cascateava** pela `page` única (`workers:1`). Correção: coalescer por
  tipo+título (o último substitui o anterior), como o M4 já fazia com conquistas.
  Melhor UX **e** determinismo independente de velocidade de máquina. Detalhes e
  o experimento de refutação no AUDITORIA.

### Projeto mora em `C:\dev\zent-money`, fora do OneDrive (higiene)

- Movido mesmo não sendo a causa do E2E: projeto de build dentro de pasta
  sincronizada é risco conhecido (o sync corrompia/apagava artefatos — ver
  "Infra local"). `C:\dev\zent-money` é o diretório oficial daqui em diante; a
  cópia antiga no OneDrive fica congelada no commit do ① e é abandonada.

## M5 — bandeja + lançamento rápido (roadmap v2.0)

### Reprovados pelo Allan — NÃO propor de novo sem pedido explícito

Registro dos itens que já foram considerados e recusados. Ficam aqui para não
voltarem à mesa por conta própria (só se o Allan pedir):

- **Importação OFX/CSV** de extratos bancários.
- **Calculadora** embutida nos campos de valor (o `MoneyInput` aceita colar/digitar
  o valor cheio; caixa-eletrônico e calculadora foram descartados — ver R3).
- **Vencimento / lembrete de fatura** (o app não modela ciclo de fatura; a fatura é
  snapshot manual — ver R3 §3.4).
- **Relatório mensal em PDF.**
- **Diagrama de Sankey** de fluxo de dinheiro.
- **Simulador "E se"** (projeções hipotéticas de cenários).
- **Recap mensal** (resumo automático de fim de mês).
- **Sparklines nos cards** (sugestão da R3, recusada).
- **Acento personalizável** (a disciplina é navy + UM acento fixo — ver R2).

### A mini-janela é outro renderer, sem store própria

- **Fonte única de dados.** A mini (`#quick` → `QuickEntryApp`) não carrega o
  `dataStore`: manda o gasto pelo main, que o encaminha ao renderer principal, e
  ELE aplica `addExpense`. Duas janelas gravando o mesmo `zent-data.json` seriam
  duas escritas correndo pelo debounce — a mesma classe de bug que o ledger
  derivado da R4 fechou. Assim há UM escritor; a mini só lê os selects (empurrados
  pelo main). Ver [[ledger-hibrido]].
- **Mesmo bundle, `#quick` no hash**: reaproveita `MoneyInput`, tokens e o `PinPad`
  — a mini é o app, não um app paralelo que envelheceria à parte.
- **Pré-criada oculta no boot** para abrir em <1s: `show()` de uma janela que já
  carregou vence criar-e-carregar sob demanda.

### A bandeja não pode furar o bloqueio

- **`appLocked` mora no main, reportado pelo renderer principal.** O estado de
  bloqueio vive no `securityStore` (renderer); a mini é outro processo, então o
  main precisa de uma cópia da verdade. Default conservador: com PIN e sem o seam
  de bypass, **assume bloqueado até o renderer dizer o contrário** — nunca um furo
  no primeiro instante. A mini usa o **mesmo `verifyPin`** (throttle do main), sem
  atalho. **PIN na mini destrava o app inteiro** (decisão do usuário): uma prova de
  identidade basta. Ver [[pin-de-bloqueio]].

### Outras decisões

- **Fechar → bandeja LIGADO por padrão** (decisão do usuário): sem isso o X mataria
  o ícone e o atalho, e a bandeja perderia o sentido. "Sair" pelo menu encerra de
  fato; um texto no perfil explica.
- **`blur` NÃO esconde a mini.** Popup-de-bandeja que some ao perder foco é elegante
  mas frágil (fecha sozinho ao abrir um select, e o E2E dirige duas janelas). Esc,
  salvar (auto-fecha) e o clique fora do foco do SO bastam.
- **Quick assume `essential: true`** (necessário): o lançamento rápido não pergunta
  Necessário×Supérfluo — o padrão mais comum, reclassificável depois na lista.

## M4 — gamificação sóbria (roadmap v2.0)

### Score e streak são DERIVADOS, não gravados

- **Nada de snapshot de score/streak.** `scoreForMonth(data, ym)` e
  `currentStreak(data, ym)` recomputam da base toda vez (determinístico). Gravar o
  número seria estado redundante livre para divergir dos dados que o geram — o
  mesmo defeito que a R4 caçou no saldo. Só persiste o que NÃO é derivável:
  conquistas (evento com data) e o desafio. Ver [[ledger-hibrido]].
- **Compromissos usam a obrigação ATUAL** (faturas + parcelas), como o card
  "Compromissos" da Visão geral — o modelo não historiza fatura por mês. Renda e
  gasto do score SÃO históricos. Decisão consciente: o score de meses passados
  varia se as obrigações atuais mudarem, mas é determinístico dado o arquivo, e a
  alternativa (historizar fatura) é um modelo que o app não tem.

### As 4 definições da fórmula (aprovadas pelo usuário)

- Sobra negativa → s1 = 0 (clamp). Mês sem renda → **sem score** (nunca inventa
  denominador). Sem categoria com limite → peso de Categorias redistribuído
  **proporcional** (40/30 → 57,14%/42,86%), não metade-metade. Arredondamento
  **único no fim** (meio pra cima) — uma fonte para anel, detalhamento e Linha do
  tempo (coerência da R4).

### Conquistas: idempotente, retroativo silencioso, ao vivo debounced

- **Retroativas em SILÊNCIO no 1º boot** (`meta.gamificationOnboarded`): a migração
  nasce `false`, o boot desbloqueia o que já está satisfeito sem toast e liga o
  flag. Depois, novos desbloqueios ganham um toast sóbrio.
- **Avaliação ao vivo com DEBOUNCE (~1s) e toast COALESCIDO** (um só, mesmo com
  várias medalhas). Sem isso, a subscription a cada mutação empilhava toasts que
  cobriam botões e quebravam o E2E — o mesmo modo de falha do M3. Toast que cobre
  interação é fragilidade real, não estética.
- **Rótulos de conquista sem "R$ <dígito>"** ("Mil investidos", não "R$ 1 mil"): o
  título vai ao toast, que fica no DOM, e o teste de privacidade (regex `/R\$\s*\d/`)
  o pegaria como valor real vazado. Sobriedade e privacidade no mesmo cuidado.

### `ScoreCache`: uma passada, não N (perf 50k)

- O score aparece no anel (mês ativo), na Linha do tempo (12 meses) e na avaliação
  de conquistas (todos os meses). Cada `scoreForMonth` re-varria os 50k gastos →
  boot 1306ms. O `ScoreCache` (buildado uma vez por mudança de dados) colapsa isso
  numa passada só; navegar meses vira lookup. Mesma disciplina do `groupByMonth`
  memoizado (§10.4).

### Desafio: um por vez, avaliado na virada

- Um desafio ativo por vez; criar substitui. Avaliado só na **virada** do mês
  (`challengeIsOver`): o resultado vai ao histórico com tom neutro (cumpriu ou não,
  sem bronca). Cancelar mid-mês não registra resultado (desistência ≠ derrota).

## M3 — direção de arte final (roadmap v2.0)

### Fundo é `radial-gradient`, nunca `blur()` de área (§Fundo)

- **Os glows do `<Backdrop>` são gradientes radiais estáticos, não divs borrados.**
  A 1ª passada usou `blur-3xl` em elementos de 900px por seção e isso **custou FPS
  de verdade** — o E2E lentificou ~6× e os timers dos toasts atrasaram. É a mesma
  disciplina da R3 ("sem blur de área gigante", ver [[ledger-hibrido]] só como
  exemplo de decisão documentada): um efeito de fundo tem de ser composto pela GPU
  numa passada. Blur de área cheia re-renderiza a cada frame em que algo muda atrás.
- **O `<Backdrop>` pinta a própria base** (`--bg` + `--bg-grad`), em vez de confiar
  no `background-attachment: fixed` do body. Foi essa dependência que deixou a tela
  de PIN com o terço inferior morto (a "faixa preta" da QA do M2). Pintar a base num
  elemento `fixed inset-0` garante 100% de cobertura em qualquer resolução.
- **Geometria assinatura no teto de 5% (usei ~4,8%).** A 3,8% da 1ª passada ela
  sumia nas seções densas; o § proíbe passar de 5%, então fica no limite — presença
  de assinatura sem competir com os dados, e sempre cortada pela borda.

### Tela de PIN: centro óptico, não âncora no topo (ajuste do usuário)

- O problema era o **terço inferior vazio**. Ancorar tudo no topo o manteria; então
  a composição é **centrada opticamente (~45%, viés leve pra cima)** com um **rodapé
  de versão discreto** fechando a base. O cofre respira no centro e a base não fica
  órfã.

### Sidebar: 3 grupos fixos (mapeamento aprovado)

- *Dia a dia* (Visão geral·Ganhos·Gastos) · *Crédito* (Bancos·Parcelas) ·
  *Patrimônio* (Carteira·Caixinhas·Linha do tempo). O tema saiu do menu de perfil
  para o **cluster inferior** (busca·privacidade·tema), mas o switch do perfil
  **permanece** — dois caminhos para o tema não brigam e o E2E do menu segue válido.

### Empty state: enriquecer SEM mudar o footprint

- A cena ganhou **detalhe no acento** (ponto final "aceso") mas **manteve 128×76**.
  Ampliá-la para 160px empurrava páginas além da viewport, alternava a scrollbar e
  disparava **oscilação de layout** que, no E2E, faminava os saves de dados (IPC com
  debounce) e **sumia com categorias a meio da jornada**. **Regra:** um componente
  reutilizado em dezenas de telas não muda de tamanho sem medir o efeito na suíte —
  o custo não é visual, é reflow e corrida de estado. As ilustrações **por seção**
  do § ficam adiadas por isso (a cena única enriquecida atende sem o risco); reabrir
  só com investigação dedicada do limiar de layout.

### Backdrop de modal escurece, mas não satura (§Micro)

- O § pede "escurece E satura". A saturação/brilho via `backdrop-filter` re-renderiza
  a cada frame enquanto algo anima atrás (count-up, toasts) — o mesmo custo do blur.
  Fica só o **escurecer** (via `--backdrop`), que não custa nada. Coerência com a
  decisão do fundo: nenhum filtro de área cheia no caminho quente.

### Guarda de produção do seam `ZENT_NO_LOCK`

- **A decisão de honrar o seam vive no MAIN**, não no preload: só o main conhece
  `app.isPackaged`. Ele resolve `!isPackaged && env==='1'` e envia o booleano ao
  preload via `additionalArguments`. No app instalado o preload recebe sempre
  `false` — nenhuma variável de ambiente destrava o bloqueio. Provado por teste,
  incluindo o caso empacotado. Ver [[reprovados]] (o PIN como barreira visual segue
  valendo; a criptografia continua arquivada).

### Persistir `activeView`, não `activeYm`

- Fechar e reabrir volta à **seção** (como o re-lock por inatividade já fazia, porque
  o store não é resetado). Mas o **mês** reabre no corrente de propósito — retomar em
  julho quando estou navegando em janeiro seria surpresa, não conveniência. O
  `bankDetailId` também não persiste: uma seção 'banks' reabre na lista, nunca num
  drill-down órfão.

## M2 — segurança (roadmap v2.0)

### Privacidade por máscara (§a)

- **Máscara substituiu o blur.** O blur de CSS escondia de quem olha, mas o número
  real seguia no DOM (texto e aria-label) — bastava inspecionar. Agora a máscara é
  decidida no React (`design/money.tsx`): sob privacidade os valores viram
  `R$ ••••••` e **o valor real nunca é renderizado**. "Ausente" vale mais que
  "borrado". Um E2E assere que o HTML não casa `/R\$\s*\d/` com privacidade ligada.
- **Um formatador ciente da privacidade (`useBRL`)**, não 152 `if` espalhados: as
  telas trocaram `formatBRL(x)` por `brl(x)`; `MoneyInput` ficou de fora de
  propósito (ali o usuário vê o que digita). Gráficos escondem rótulos de valor e
  tooltip sob privacidade — o traço fica, o número some.

### PIN de bloqueio (§b)

- **PIN é barreira VISUAL, não criptografia — e o app diz isso.** Só o hash
  `scrypt` + salt vão ao disco (`pin.json`); o arquivo de dados segue em texto.
  Assumir o contrário seria mentir sobre a proteção. A criptografia de verdade é a
  proposta abaixo, decidida à parte.
- **Hash, verificação e throttling vivem no MAIN**, não no renderer: o renderer
  nunca vê o hash e não tem como burlar o atraso por dentro do próprio processo.
  Comparação em tempo constante (`timingSafeEqual`).
- **Throttling em memória** (1s, 2s, 4s… teto 30s após 5 erros), zerado ao
  reiniciar. Persistir um `lockedUntil` poderia trancar o dono legítimo por engano;
  para uma barreira visual, reiniciar-zera é aceitável, e a proteção real dos dados
  é a criptografia (à parte).
- **Com PIN, todo boot começa BLOQUEADO** (o `securityStore` não é persistido):
  persistir "desbloqueado" derrotaria o PIN. Auto-bloqueio ao abrir é o padrão;
  por inatividade (5/15/30 min) é opt-in (uiStore). Minimizar/perder foco **não**
  re-bloqueia (decisão do usuário — evita atrito no alt-tab).
- **Primeira execução obriga a definir o PIN** (sem "pular"): boas-vindas →
  definir → confirmar. **"Esqueci o PIN" reseta só o PIN, com fricção (digitar
  RESET)** e sem tocar os dados — coerente com "o PIN não cifra nada".
- **A tela de bloqueio é peça de design final (padrão M3), não placeholder** — é o
  primeiro contato com o app: fundo em camadas (glows + arcos cortados pela borda),
  logo com halo, bolinhas que preenchem, shake no erro, teclado clicável + físico.
- **Seam de teste `ZENT_NO_LOCK=1`**: perf e screenshots dirigem a UI sem o atrito
  do PIN. O **E2E de segurança NÃO usa o bypass** — ele define/confirma/desbloqueia
  o PIN de verdade (PIN de teste `1234`, descartável e isolado; nunca o do usuário).

### Criptografia opcional do arquivo — DECISÃO: arquivada por ora

- Proposta (AES-256-GCM, chave via scrypt do PIN) apresentada com prós/contras no
  fecho do M2. **Decisão do usuário: arquivar** — o PIN como barreira visual atende
  agora; o custo (PIN esquecido = dados irrecuperáveis, backup forçado, "esqueci"
  deixaria de só resetar, I/O e migrações mais complexas, risco de trancar o próprio
  acesso) não se justifica neste momento. **Não fica pendente sem dono: reabrir só a
  pedido explícito** (não propor de novo por conta própria). Ver [[reprovados]] de escopo.

## M1 — integridade pendente e Orçamento 2.0 (roadmap v2.0)

### Fonte única das mutações (§a)

- **`src/store/mutations.ts` passou a ser o único lugar que cria/exclui um
  lançamento** (gasto, extra, transferência, salário, pagamento de fatura, ajuste,
  aporte, parcela, realocação). Antes o "criar" morava num diálogo e o "excluir"
  numa página distante — nada garantia que um fosse o inverso EXATO do outro. Com o
  par `add*`/`remove*` num lugar só, a invariante **criar→excluir neutro** vale no
  produto, porque a UI e o teste chamam a MESMA função (não uma reencenação).
- **O teste da invariante foi provado por sabotagem antes de ser confiado**: quebrei
  de propósito `removeInvoicePayment` (não devolver o valor à fatura) e vi o
  round-trip do pagamento **falhar em vermelho** (`invoices: 500 ≠ 800`), depois
  reverti. É a lição do smoke test da R3 aplicada: um teste só vale depois de
  vê-lo pegar o bug que afirma pegar. Um meta-teste permanente encoda essa prova.
- **O marcador `lastSalaryCreditYm` fica ao desfazer um crédito de salário** — a
  única assimetria consciente do "neutro". Ele não é um "número do app" (nenhuma
  agregação depende dele), só governa a materialização futura; recuá-lo faria o
  próximo boot recriar o crédito desfeito (ver [[ledger-hibrido]]).
- **`addToInvoice` do gasto NÃO entra na invariante**: somar um gasto à fatura é
  uma edição pontual do snapshot manual da fatura (R3 §3.4), não parte do registro
  persistido do gasto — criar→excluir do gasto é neutro sobre o gasto; o bump da
  fatura é do usuário, revertido editando a fatura.
- **Desfazer no histórico da conta cobre agora transferência, fatura e ajuste**
  (antes só salário) — as ações de exclusão novas ganharam uma casa real na UI,
  em vez de só existirem para o teste. As que movem dinheiro pedem confirmação.

### Orçamento 2.0 (§c)

- **Realocação é conceito de ORÇAMENTO, não movimento de dinheiro**: `efetivo =
  base + recebido − cedido`, e **jamais toca o ledger** (provado no round-trip
  realocar→desfazer, que deixa todo saldo intacto). Guardá-la como movimento de
  conta misturaria "planejei gastar" com "gastei".
- **Vale só no mês; a virada volta ao base sozinha.** Só entram na conta as
  realocações daquele `ym` — não há estado a "resetar" na virada, o que elimina uma
  classe inteira de bugs de reset. Testado (mesmo realoc, mês seguinte = base).
- **A origem precisa ter limite; o destino não.** Não se cede o que não se tem
  (categoria sem limite efetivo não pode ceder). Já o **destino pode ser qualquer
  categoria, mesmo sem limite base** (decisão do usuário) — ela ganha um efetivo só
  no mês. Mistura consciente de "sem orçamento" com "orçamento temporário", aceita
  para dar flexibilidade a quem quer abrir uma verba pontual.
- **O efetivo nunca fica negativo**: a validação barra ceder mais do que a origem
  tem, considerando as realocações já feitas no mês.
- **Aviso de estouro é inline, não um modal aninhado.** Todos os modais do app
  compartilham `z-50` e um trap de foco no window; empilhar dois brigaria pelo
  foco/Esc. Então o aviso pré-salvar vive DENTRO do diálogo do gasto (banner +
  rodapé adaptável); "Realocar orçamento" fecha o gasto e abre a realocação com o
  destino já escolhido, sem perder nada que importe.
- **O painel de orçamento é um componente só (`BudgetPanel`)**, usado em Visão
  geral E em Gastos (decisão do usuário: descoberta nos dois lugares) — uma fonte,
  sem dois `reduce` de status livres para divergir.

### Toggle rosca/barras no Resumo por categoria (§b)

- **Reusa o único `Donut` do app** (cores das categorias, total no centro, hover
  com valor e %); a preferência persiste no `uiStore` (`zent-ui`, `localStorage`),
  como tema/sidebar/privacidade — resposta instantânea, sem IPC.

## Release 4 — coerência contábil, taxas ao vivo e revisão fina

### Ledger híbrido (§1)

- **O saldo virou DERIVADO; `bank.balance` deixou de existir.** O arquivo guarda
  `openingBalance` (o ponto de partida) e os MOVIMENTOS; `bankBalances()` soma. Guardar
  um `balance` ao lado dos movimentos seria estado redundante livre para divergir do
  próprio histórico — exatamente o defeito que a release veio corrigir. Consequência de
  graça: o histórico da conta **fecha** no saldo por construção, e a tela mostra o saldo
  corrido linha a linha; se um dia não fechar, ela denuncia em vez de esconder.
- **Movimentos são eventos, não somas.** Crédito de salário, transferência, ajuste e
  pagamento de fatura viraram registros próprios (`salaryCredits`, `transfers`,
  `adjustments`, `invoicePayments`); gasto-com-origem e extra-recebido-em são derivados
  dos registros que já existiam, sem duplicar dado. "Desfazer" é apagar o evento — não
  há saldo para "corrigir de volta".
- **Crédito automático do salário, reversível (decisão do usuário).** No dia configurado
  o app credita sozinho, com evento no histórico, toast e "Desfazer" de um clique; um
  toggle troca para "Confirmar recebimento" (para quem tem salário que atrasa). Regras,
  todas com um porquê: (a) **nunca credita antes do dia**; (b) **não inventa passado** —
  na primeira configuração começa no mês corrente, porque o saldo que o usuário digitou
  já embute os meses anteriores e creditá-los contaria em dobro; (c) o marcador
  `meta.lastSalaryCreditYm` **só avança para meses creditados**, e é ele — não a
  existência do crédito — que faz o "Desfazer" grudar: sem marcador, o próximo boot
  recriaria o que o usuário acabou de desfazer.
- **Vincular a conta credita na hora**, não só no próximo boot: a queixa que abriu a
  release é "entrou R$ 2.000 e Em conta = R$ 0,00"; resolvê-la só amanhã seria não
  resolvê-la. É a mesma função do boot, com as mesmas regras.
- **Editar o saldo à mão virou conciliação (§1.5)**, não sobrescrita: o app calcula a
  diferença contra o saldo derivado e grava um **ajuste**. O texto
  "Ajuste de conciliação: +R$ 137,50" é montado pela UI a partir do `amount`; a nota
  guarda só o motivo. Gravar o valor dentro do texto seria o mesmo dado em dois lugares,
  livre para divergir do movimento que descreve.
- **"Pagar fatura" entrou no escopo (decisão do usuário).** Sem ele o dinheiro gasto no
  cartão nunca saía de conta nenhuma — um furo do mesmo tipo que a R4 veio fechar. Debita
  a conta e abate a fatura **na mesma transação**: são dois efeitos de um fato só, e
  separá-los deixaria o app num estado onde o dinheiro saiu mas a fatura continua cheia.
- **Anti-dupla contagem (§1.7): gasto com origem-cartão NÃO debita conta.** Ele vira
  dívida no cartão (a fatura, que o usuário digita — decisão mantida da R3) e só toca o
  saldo quando a fatura é paga. Compromissos segue = faturas + parcelas de cartão +
  avulsas, sem gasto algum. No cartão, a UI **confronta** os dois números
  ("gastos lançados neste cartão: R$ X · fatura que você digitou: R$ Y — a fatura não
  soma seus lançamentos, ela já os inclui") em vez de somar um no outro.
- **Retrocompatibilidade real (§1.6)**: sem nada vinculado, todos os arrays de movimento
  ficam vazios e o saldo derivado colapsa no `openingBalance` — o app de ontem, idêntico.
  `isLedgerLinked()` decide o tooltip honesto do "em conta". Origem-CARTÃO sozinha não
  liga o ledger: nenhuma conta se move por ela.
- **Templates de recorrência não guardam conta**, como já não guardavam origem: a
  instância nasce sem vínculo e o usuário atribui depois.

### Taxas ao vivo (§2)

- **Busca no processo main**, não no renderer: as duas APIs bateriam em CORS. A lógica
  pura (`engine/rates-source.ts`) recebe o `fetch` **injetado** — é isso que permite
  mockar a rede em 100% dos testes. Um teste que depende de o BC estar de pé é aposta,
  não teste.
- **Uma série do SGS faltando derruba a busca inteira.** Publicar duas taxas novas e uma
  velha como se fossem do mesmo momento é pior do que manter as três antigas com data
  honesta.
- **Override por taxa, não global.** Editar a Selic à mão pausa só a Selic; o automático
  segue mandando no CDI e no IPCA. Sem isso, o próximo fetch apagaria em silêncio o valor
  que o usuário acabou de digitar.
- **`updatedAt` × `lastAutoAt` são coisas diferentes**: `updatedAt` descreve os NÚMEROS
  (só avança quando alguma taxa muda de valor) e `lastAutoAt`, a última vez que o app
  conseguiu falar com as fontes. Misturá-los faria a UI dizer "atualizadas hoje" sobre
  valores de 45 dias atrás.
- **Falha é silêncio**, não toast: sem rede, os últimos valores continuam valendo e a UI
  mostra a data deles. Um erro a cada boot num café sem wi-fi é ruído, não informação.
  O alerta de 45 dias só aparece para quem *não* tem o automático funcionando.
- **"Atualizar agora" funciona com o toggle desligado**: o toggle governa o automático,
  não o direito de o usuário consultar quando quiser.
- **`ZENT_OFFLINE=1` corta a rede na raiz.** Garante que a suíte jamais toque a internet
  e, de quebra, o E2E inteiro roda offline — o caminho de falha virou caminho testado.
- **A frase "100% offline" foi aposentada.** Deixou de ser verdade quando o app passou a
  consultar taxas; agora diz o que ele faz de fato: *"seus dados nunca saem do seu
  computador — a única conexão é a consulta opcional das taxas oficiais"*. Dizer o que o
  código cumpre é mais forte do que uma promessa que ele não cumpre.

### Revisão de consistência (§3)

- **"100% da renda" morreu.** Mês sem gasto algum agora diz "nenhum gasto lançado"; mês
  sem movimentação nenhuma não mostra linha. O percentual só aparece quando há o que
  medir.
- **`Delta` devolve `null` sem base de comparação** e a linha inteira some, em vez do
  travessão solto "— vs mês anterior". Como o projeto roda com
  `exactOptionalPropertyTypes`, passar `undefined` não é o mesmo que não passar: o helper
  `detailProp()` transforma "não há detalhe" na ausência da prop.
- **Um cálculo, muitos consumidores**: `totalInAccounts`, `totalInvoices` e
  `savingsRatio` viraram helpers únicos. Antes, `inAccounts` e `invoices` eram `reduce`
  duplicados em Visão geral × Bancos × drill-down, e o "% da renda" era dividido em dois
  lugares — mesmos inputs hoje, duas chances de divergir amanhã.
- **`savingsRatio` devolve `null` sem renda**, não 0: "não há fração" e "não sobrou nada"
  são afirmações diferentes.
- **A projeção do mês deriva da média JÁ ARREDONDADA.** Os dois números ficam lado a lado
  no card "Ritmo do mês" e o usuário pode multiplicar um pelo outro; uma projeção não
  ganha nada com uma precisão que ninguém consegue conferir.
- **"Parcelas por mês" virou "Parcelas de cartão/mês"**: o número exclui as avulsas de
  propósito (elas não pertencem a banco nenhum), e o rótulo genérico o fazia parecer
  discordar de Compromissos.
- **O hero ganhou o marcador "· hoje"** fora do mês corrente: ele é o patrimônio de
  agora (saldo em conta não tem histórico) enquanto os cards abaixo são do mês navegado.
  Sem o marcador, dois tempos diferentes ficavam lado a lado sem avisar.

## Release 3 — correções, bancos em profundidade e design final

- **Parcela avulsa é discriminada por `cardId: null`** (§2), sem um campo `kind`
  paralelo: dois campos para o mesmo fato podem divergir (um `kind: 'card'` com
  `cardId: null` seria um estado impossível representável). `isStandalone(p)` deriva o
  tipo. Consequência de graça: `committedAmount`/`availableLimit` filtram por id de
  cartão, então avulsa **nunca** entra na regra do limite — por construção, não por um
  `if` que alguém pode esquecer. `creditor` só existe nas avulsas.
- **Compromissos = faturas + parcelas de cartão + avulsas**; no tooltip, a parte "de
  cartão" é derivada de `total − avulsas` para que as três linhas somem exatamente o
  número exibido (somar as partes independentes deixaria órfãs de fora e o tooltip
  discordaria do card).
- **"Pago com" (§3.4) é união discriminada** (`{kind:'bank'|'card'}`), não dois campos
  anuláveis que poderiam ser preenchidos juntos. Origem-cartão conta para o banco dono
  do cartão (`expenseBankId`); cartão apagado devolve `null` em vez de atribuir a um
  banco errado. Templates de recorrência não guardam origem — a instância nasce sem e o
  usuário atribui depois.
- **Fatura: manual, com opt-in explícito** (§3.4, decisão do usuário). A fatura é um
  **snapshot que o usuário digita** olhando o app do banco, não um livro-razão derivado:
  somar cada gasto automaticamente **contaria em dobro** (a fatura já o inclui) e
  inflaria Compromissos junto. Além disso o app não modela ciclo de fatura
  (fechamento/vencimento), então "em qual fatura cai uma compra do dia 28?" não teria
  resposta correta, e o vínculo automático exigiria ainda abater no pagamento. O
  checkbox soma **uma vez**, só quando marcado, e avisa do risco de contagem dupla.
- **Drill-down do banco (§3.3) é rota filha de `banks`** (`bankDetailId` no uiStore), não
  uma ViewId nova: ele não é item de menu e trocar de seção deve voltar para a lista —
  `setView` limpa o id. Banco excluído → cai na lista em vez de quebrar.
- **BTG duplo (§3.1): a migração preserva o `id`** do BTG existente ao renomeá-lo para
  "BTG Banking", então cartões, ativos e parcelas continuam apontando para ele; "BTG
  Investimentos" nasce ao lado, vazio. Quem já tem os dois (seed da R2) não ganha
  duplicata; sem BTG, nada é inventado. Os hex da migração são **literais**: uma migração
  descreve o passado e não pode mudar de resultado quando o seed evoluir.
- **`bank.color` NÃO virou navy nos dois BTG.** As imagens aprovadas mostram os dois em
  navy, mas `color` no app é **acento de UI** (barra do banco, chip do cartão, monograma),
  não o logo: navy no Banking apagaria seu acento no tema escuro (navy sobre navy). A
  distinção pedida vive no **logo** (invertido). Banking segue `#2C5EA9`, Investimentos
  `#0A2540`.
- **Logos só-símbolo (§3.2)**: os arquivos da R2 eram o **lockup horizontal** (símbolo +
  wordmark) espremido num quadrado — a 34px, o tamanho real de uso, "bradesco"/
  "Santander"/"pactual" viravam um borrão. Nubank e Itaú escaparam porque suas marcas já
  são curtas. Como símbolo e wordmark estão fundidos num **único path**, não dá para
  apagar o wordmark removendo elementos: `scripts/gen-bank-logos.mjs` recorta o símbolo
  com `<clipPath>` no espaço de coordenadas original e o recentraliza — o vetor segue
  sendo o **oficial**, sem redesenho à mão. Fontes em `assets/logos-src/` (fora de
  `assets/logos/`, que vai para o instalador), então a geração é reproduzível.
- **Janela revelada em `did-finish-load`, não em `ready-to-show`**: com `titleBarOverlay`
  o `ready-to-show` nunca dispara no Windows e a janela ficava invisível para sempre
  (ver AUDITORIA.md). Há ainda um timer de 4s como rede de segurança — o custo é zero e
  a alternativa é um app que não abre. **`npm run test:smoke`** existe porque nenhum
  teste via Playwright prova que a janela aparece: o CDP dirige o app oculto.
- **Barra de título (§4)**: `titleBarStyle: 'hidden'` + `titleBarOverlay`. Os botões
  continuam **nativos** de propósito — minimizar/maximizar/fechar e o snap-assist do
  Win11 vêm corretos de graça, sem reimplementar. A faixa lê `--titlebar-bg` no CSS e os
  botões, que só o main consegue pintar, recebem o **mesmo token lido do DOM** via IPC:
  fonte única, sem hex duplicado que pudesse divergir do tema.
  *Exceção documentada ao anti-hex*: `TITLE_BAR_BOOT` em `electron/main.ts` espelha o
  token do tema escuro para o primeiro frame — o main não tem DOM para ler CSS, e sem
  isso haveria um flash de barra branca no boot.
- **Fundo com vida (§4)** em UM pseudo-elemento (`#root::before`), `pointer-events:none`:
  só gradientes estáticos (glow radial, malha 22px, vinheta) — sem blur de área gigante e
  sem animação em loop. O AppShell perdeu o fundo opaco, que taparia as camadas; a base é
  pintada pelo `body`.
- **Empty states: UMA cena parametrizada** pelo ícone da seção, não ~12 ilustrações
  distintas — que envelheceriam separadas e sairiam de estilo uma a uma.
- **Sugestões do §5 recusadas pelo usuário** (blur ao perder foco, exportar CSV, ←/→ nos
  meses): voltam ao backlog.

- **Padrão único de campo monetário (§1): digitação livre no foco, normalização no
  blur.** Confirmado como padrão de 100% dos campos monetários do app (salário, gastos,
  aportes, limites, faturas, metas, saldo inline) — todos passam pelo componente
  `MoneyInput`, nenhum campo de dinheiro usa `<input>` cru. Máscara de caixa eletrônico
  foi **descartada**: ela impede colar "1.234,56", atrapalha quem digita o valor cheio e
  esconde o estado real do campo. Regra: o texto digitado é preservado tal e qual
  enquanto o campo tem foco; `parseMoney` roda a cada tecla apenas para *reportar* o
  valor ao formulário (e marcar borda vermelha se inválido); a formatação pt-BR só
  acontece no `blur`. `parseMoney` aceita todo prefixo válido de digitação
  (`2` · `2.` · `2,` · `2.0`), coberto por unit.
- **Causa-raiz do bug do salário (§1) — era o `Modal`, não o input.** O `MoneyInput`
  sempre esteve correto. O `Modal` recebia `onClose` inline (`() => setSalaryModal(false)`),
  cuja identidade muda a cada render do pai, e o tinha nas deps do `useEffect` de foco.
  Como o rascunho do salário mora no *pai* do Modal, cada tecla re-renderizava o pai →
  efeito re-executava → `querySelector('input, select, textarea, button')` no painel
  devolvia o **botão "Fechar" do cabeçalho** (primeiro em ordem de documento) e roubava
  o foco. Daí o campo travar em "2,00" no primeiro dígito. Correção: `onClose` via ref
  (deps só `[open]`) e o foco inicial mira o primeiro campo do **corpo** do modal, nunca
  o "Fechar". Era bug latente de qualquer modal com estado no pai — a correção no
  componente cura a classe toda.
- **Por que o E2E não pegava**: os testes usavam `fill()`, que injeta o valor de uma vez
  e dispara um único evento. O bug só aparece tecla a tecla. O teste de regressão agora
  digita de verdade (`keyboard.type`) nos 3 formatos, em 3 campos, e confere o valor
  persistido — além de assertar que o campo **mantém o foco**.

## Release 2 — refinamento profissional

- **Fonte premium: Geist** (variável, 400–700, `@fontsource-variable/geist`, local).
  Comparativo curto: *Geist* foi desenhada para interfaces técnicas (Vercel) — dígitos
  tabulares impecáveis, formas neutras e sérias, excelente render em 12–14px, com cara
  de terminal financeiro. *Instrument Sans* é mais editorial/humanista (ótima para
  marketing, menos para densidade numérica). *Schibsted Grotesk* é display/identidade
  (títulos), mais fraca em números pequenos. Numerais tabulares obrigatórios via `.tnum`.
- **Disciplina de cor**: neutros navy + **um acento** (azul-céu). O violeta da v2 foi
  removido; chips de ícone agora em azul-céu translúcido. Verde/vermelho SÓ em valores
  monetários e variações; âmbar só em alertas reais; barras de orçamento/uso de limite
  em acento neutro até 90% do teto (âmbar), estourado (vermelho). **Multicolor apenas na
  rosca de gastos**: paleta categórica dessaturada `--cat-1..10` — a paleta curada do
  usuário e o onboarding usam exatamente esses tons (cores-DADO persistidas).
- **Zero emojis**: schema v3 troca `box.emoji` por `box.icon` (chave de um set único de
  18 ícones Lucide de traço fino, cor via tokens); migração v2→v3 mapeia os emojis
  conhecidos (ex.: salva-vidas→lifebuoy) e desconhecidos viram `target`. Celebração de
  meta: brilho sutil no anel via drop-shadow com token, sem confete.
- **Nova marca "Z em degraus"**: três traços horizontais arredondados em degrau
  ascendente (lê como Z e como gráfico subindo); monocromática via `currentColor`.
  Variações: símbolo (`ZentMark`), chip (`ZentLogo`), wordmark (`ZentWordmark`).
  Ícone do app: navy profundo com gradiente vertical + traço de luz no topo + símbolo céu.
- **Movimento (só transform/opacity, respeitando reduced-motion)**: páginas com
  fade+slide 200ms e stagger de 30ms nos blocos; count-up (~550ms easeOutCubic) nos
  números-herói e StatCards; sidebar com `cubic-bezier(0.22,1,0.36,1)`; linha do gráfico
  "se escreve" (stroke-dashoffset) e barras sobem (scaleY com fill-box).
- **Dashboards novos da Visão geral**: Ritmo do mês (média diária + projeção
  `gasto/dias corridos × dias do mês` vs mês anterior), Taxa de poupança 6m
  (mini-barras), Mapa de calor (calendário com intensidade navy→acento), Patrimônio 12m.
  Extra aprovado: variação ±% vs mês anterior nos StatCards (verde/vermelho por sinal,
  invertido para "Saiu").
- **Complementos**: modo privacidade borra QUALQUER `.tnum` via `data-privacy` no root
  (persistido; um clique no olho); Ctrl+K virou paleta de comandos (ações rápidas de
  criação via `pendingAction` no uiStore, tema, privacidade, menu); overlay `?`;
  clique em valor monetário copia (handler global, ignora elementos interativos e
  modo privacidade).
- **Logos dos bancos**: SVGs oficiais (Wikimedia Commons/Simple Icons) compostos em
  quadrado arredondado na cor da marca + marca branca — consistência entre os 6 e
  contraste nos 2 temas. **Dois BTGs distintos** no seed: BTG Investimentos (navy
  #0A2540, corretora) e BTG Banking (azul #2C5EA9, conta do dia a dia). `BankSelect`
  (popover com logo) no formulário de ativo. Fallback monograma intacto.
- **Backlog futuro**: blur automático ao perder o foco da janela, exportar CSV do mês,
  atalhos 1–8/N/←→, tags nos gastos, relatório mensal em PDF.

## v2 — redesign navy premium e novas seções

- **Paleta v2 (padrão da referência "Settei")**: fundo navy quase preto com gradiente
  (`#060D1F → #04070F`), painéis `#0B1424`/`#0E1930`, primária azul-céu `#57B6F2`,
  secundária violeta `#6E5BFF` (chips de ícone dos StatCards), positivo `#34D399`,
  negativo `#F0655A`. **100% das cores do tema em tokens** (`src/design/tokens.css`).
  *Exceção documentada (dados, não tema)*: cores oficiais de marca dos bancos (§5.4),
  cores de categoria escolhidas pelo usuário e a paleta curada oferecida a ele —
  são valores persistidos no arquivo de dados.
- **Tipografia única: Inter** (variável, 400–800, empacotada local). Títulos bold com
  `letter-spacing -0.02em`.
- **StatCard**: componente único de estatística (chip violeta translúcido + número
  grande + rótulo em caps) usado em todas as seções. **SummaryBalloon**: balão de
  resumo inteligente com valores inline coloridos e clicáveis (navegam à seção).
- **Barras com topo arredondado** (path SVG, raio só na ponta); pares entradas×saídas
  em verde/vermelho; métricas neutras em azuis.
- **Classes de ativo derivadas do tipo de rendimento** (sem campo extra no schema):
  selic/cdi → Renda fixa pós · ipca → IPCA+ · prefixado → Prefixado · manual → Outros.
- **Ativos manuais ("Outros ativos")**: série = carry-forward da última atualização de
  valor de mercado; antes da 1ª atualização, acumulado de aportes como melhor estimativa;
  `rend[m] = saldo[m] − saldo[m−1] − aportes[m]` (fórmula §7 preservada — perdas geram
  rendimento negativo).
- **Parcelas**: seção consolidada é uma SEGUNDA VISÃO de `data.purchases` (uma fonte de
  verdade); nenhum dado duplicado.
- **Recorrências**: templates separados dos lançamentos; materialização no boot cobre os
  meses decorridos (dia 31 vira o último dia do mês; instâncias são lançamentos normais,
  editáveis, marcados com `recurringId`). Encerrar preserva o histórico; excluir remove
  só o template.
- **Alerta de limite por categoria**: toast âmbar ao cruzar 90% do teto e vermelho ao
  estourar — detecção de cruzamento (antes/depois do lançamento), sem repetir alertas.
- **Busca global (Ctrl+K)**: índice em memória sobre o store; itens datados navegam já
  posicionando o mês ativo.
- **Backlog futuro (aprovado a corte)**: atalhos de teclado adicionais (1–8, N, ←/→),
  tags nos gastos, exportar relatório mensal em PDF.

## Stack

- **Electron + electron-vite + React 18 + TypeScript estrito + Tailwind CSS v4.**
  O toolchain Rust não está disponível na máquina (Tauri descartado); electron-builder
  gera o instalador NSIS `.exe` com ícone e atalho de desktop nativamente.
- **electron-vite** em vez de scripts manuais: build unificado de main/preload/renderer
  com HMR, saída em `out/`, integração direta com electron-builder.
- **Zustand** para estado (leve, selectors evitam re-render global) com **immer**
  para mutações imutáveis legíveis; persistência via IPC com debounce de 400ms.
- **Zod** valida o arquivo de dados no load e após cada migração — arquivo corrompido
  nunca entra silenciosamente no app.
- **Gráficos em SVG próprio** (linha/área, barras, rosca, sparkline, anel de progresso):
  controle total de acabamento, tooltips e leitura de cores do tema no momento do render;
  zero dependência pesada. As séries chegam prontas do motor financeiro.
- **lucide-react** para ícones de interface (tree-shaken e empacotado — segue 100% offline).

## Infra local (pós-incidente do instalador — ver AUDITORIA.md)

- **`node_modules`, `out` e `release` são junctions** para
  `%LOCALAPPDATA%\ZentMoneyBuild\` — fora do alcance do OneDrive. O projeto vive numa
  pasta sincronizada (OneDrive\Desktop) e o sync corrompia/apagava artefatos de build
  e travava o NSIS.
- **Testes de instalação NUNCA rodam com o diretório de trabalho no projeto**: o setup
  é copiado para %TEMP% e executado de lá, com verificação explícita do destino da
  instalação antes de qualquer outra ação.
- Repositório **git** local inicializado como proteção contra perda de arquivos.

## Modelo de dados

- **Dinheiro = inteiro em centavos** em todo o app. Elimina erros de ponto flutuante;
  o motor de juros calcula em `number` (float) e arredonda para centavos apenas na saída.
- **Datas = strings ISO** (`YYYY-MM-DD`); meses = `YYYY-MM` com aritmética própria
  (`ymToIndex`/`indexToYm`), sem biblioteca de datas — testável até 2100.
- **Parsing de dinheiro BR/US** — heurística para separador único:
  só vírgula → decimal; só ponto com 1–2 dígitos depois → decimal;
  só ponto com padrão de milhar (`1.234`, `1.234.567`) → milhar.
  Ambos presentes → o último separador é o decimal.
- **Tema e sidebar** persistem em `localStorage` (resposta instantânea, sem IPC);
  o restante vive no arquivo `zent-data.json` e entra no export/import.
- **Compras parceladas** guardam `startYm` (mês da 1ª parcela) para calcular o mês
  previsto de quitação; "parcelas pagas" é um contador editável (+1 paga / desfazer).

## Persistência

- Arquivo único `zent-data.json` em `%APPDATA%/zent-money/` com campo `version` e
  cadeia de migrações (`migrations.ts`).
- **Escrita atômica**: grava em `.tmp` e `rename` por cima (atômico no Windows).
- **Backup rotativo**: 1 cópia por dia de uso em `/backups`, máximo 10, podadas por idade.
- Import substitui todos os dados após confirmação explícita em modal destrutivo.

## Produto

- **Mês previsto de quitação de parcela**: cronograma original (`startYm + total − 1`);
  se o pagamento estiver atrasado em relação ao cronograma, projeta as parcelas restantes
  em meses consecutivos a partir do mês atual (o maior dos dois).
- ~~**Sparkline do hero de patrimônio**: evolução do investido nos últimos 12 meses somada ao
  saldo em conta atual. Contas bancárias não têm histórico (saldo é editável livremente),
  então o traço reflete a única série histórica real — a dos investimentos.~~
  **Revogado na R4:** com o ledger, todo movimento de conta é datado e o saldo passado é
  derivável (`accountBalanceSeries`). A premissa "conta não tem histórico" morreu junto com
  `bank.balance`. Ela custava caro: o gráfico embutia o saldo de HOJE em janeiro
  (superestimando o passado) e a variação do hero era **cega ao salário** — `total` e
  `prevTotal` carregavam o mesmo saldo, então só o investido variava.
- Salário: histórico de vigências (`startYm`); editar cria/atualiza a vigência do mês
  corrente em diante e meses passados exibem o salário da época, como pede a spec.
- Taxas de referência iniciais (16/07/2026): Selic 14,25% a.a. · CDI 14,15% a.a. ·
  IPCA 4,64% (12m). Alerta discreto após 45 dias sem atualização.
- Lembrete de backup: toast no boot se passar de 45 dias sem exportação manual
  (base: data da última exportação, ou data de criação do arquivo).
- A navegação de mês (‹ ›) é **compartilhada** entre as seções (um único mês ativo
  global) — mudar o mês em Gastos e ir para Visão geral mantém o contexto.
