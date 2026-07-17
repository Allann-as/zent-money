# AUDITORIA.md — Zent Money

## LACUNA DE MODELO CONTÁBIL (Release 4, §1) — causa-raiz — 16/07/2026

### Sintoma
"Entrou R$ 2.000, saiu R$ 0, mas **Em conta = R$ 0,00**" — na mesma tela.

### Causa-raiz — não era cálculo, era ausência de modelo
O app tinha **dois sistemas que não se falavam**: o **fluxo declarado** (salário + extras
− gastos → "Entrou/Saiu/Sobra") e o **saldo em conta** (`bank.balance`, um número digitado
à mão que alimentava "Em conta" e o Patrimônio). Nenhuma linha de código ligava um ao
outro. Nada estava *errado*: os dois números estavam certos, cada um dentro do seu mundo.
Faltava o mundo do meio — o dinheiro se movendo.

Diagnóstico confirmado no código antes de qualquer correção: `OverviewPage.tsx:74` fazia
`data.banks.reduce((a, b) => a + b.balance, 0)`; nenhum lançamento tocava `bank.balance`
em lugar nenhum do app.

### Correção — o saldo virou derivado
`bank.balance` **deixou de existir**. O arquivo guarda o ponto de partida
(`openingBalance`) e os **movimentos**; o saldo sai da soma (`engine/ledger.ts`):

```
saldo = openingBalance + Σ salário + Σ extras recebidos aqui − Σ gastos com origem-conta
      + Σ transferências (entrada − saída) − Σ pagamentos de fatura + Σ ajustes
```

Guardar um `balance` ao lado dos movimentos seria estado redundante livre para divergir do
próprio histórico — o defeito que a release veio corrigir. O histórico da conta mostra o
**saldo corrido** linha a linha e a linha mais recente bate com o cabeçalho: se um dia não
fechar, a tela denuncia sozinha.

### O que impede a dupla contagem (§1.7)
Gasto com origem-**cartão** não debita conta nenhuma: vira dívida no cartão (a fatura, que
o usuário digita) e só toca o saldo quando a fatura é paga — via **"Pagar fatura"**, o elo
que faltava. Compromissos segue = faturas + parcelas de cartão + avulsas, sem gasto algum.
Provado por 32 testes de unidade, incluindo o caso completo: R$ 300 gastos no cartão saem
da conta **uma vez só**, junto com a fatura.

### Retrocompatibilidade
Sem nada vinculado, os arrays de movimento ficam vazios e o saldo derivado colapsa no
`openingBalance` — o app de ontem, idêntico ao centavo. A migração v6→v7 é, por isso,
invisível para quem não quer ledger; o card "Em conta" ganhou tooltip honesto dizendo que
o número é a soma do que foi declarado.

---

## Release 4 — checklist de aceite (§7 da spec R4)

- [x] **Salário com conta padrão + dia de pagamento**; crédito aparece no histórico e no
      "Em conta"; **reversível** em um clique. Automático por padrão (decisão do usuário),
      com toggle para "Confirmar recebimento"
- [x] **Extras com "Recebido em"**; gastos com origem debitam a conta ou compõem a fatura;
      **transferências entre contas** aparecem no histórico das duas pontas
- [x] **Edição de saldo gera ajuste de conciliação**; o saldo é derivado e o histórico
      fecha a conta (coluna de saldo corrido na tela; teste provando que Σ movimentos ≡ saldo)
- [x] **Zero dupla contagem em Compromissos** (testado, inclusive "R$ 300 no cartão saem da
      conta uma vez só, junto com a fatura"); **tooltip honesto** quando nada está vinculado
- [x] **Taxas atualizando sozinhas** via BrasilAPI com fallback SGS/BCB (séries 432 · 4389 ·
      13522); timestamp visível; "Atualizar agora"; **override por taxa**; toggle;
      **funciona 100% offline** quando sem rede
- [x] **Frase de privacidade atualizada**; rede **mockada** nos testes (`ZENT_OFFLINE=1`
      + `fetch` injetado); parsers com **fixtures das duas APIs**
- [x] **Revisão de consistência documentada** (11 achados corrigidos — quadro abaixo)
- [x] **Suíte completa verde: 147 unit + 26 E2E**, zero erros de console; perf 50k sem
      regressão; instalador regenerado e validado; smoke da janela verde

### Validação do instalador (R4)

- `npm run dist` → `release/ZentMoney-Setup-1.0.0.exe` (**78,5 MB**).
- Instalação silenciosa **a partir de %TEMP%, com diretório de trabalho neutro** (regra da
  R2): **exit 0 em 9,2s**, destino `%LOCALAPPDATA%\Programs\Zent Money`, registro NSIS
  apontando para o destino correto.
- **Migração ensaiada antes de instalar**, contra uma CÓPIA do arquivo real (v6): validada
  pelo Zod, sem perda, e o **saldo derivado saiu idêntico** ao que o usuário via antes —
  que é a prova de que a v7 é invisível para quem não usa o ledger. (O arquivo real está
  praticamente vazio; quem carrega a prova com conteúdo é o teste de migração v1→v7.)
- **App instalado + cópia dos dados reais**: abre, zero erros de console, salário "2000"
  **digitado tecla a tecla** grava `200000` centavos, e vincular a conta credita **na
  hora**: `salaryCredits: [{ym: "2026-07", date: "2026-07-05", amount: 200000}]` e o saldo
  do Nubank passa a **R$ 2.000,00** — o caso de aceite do §1 no app empacotado.
- **`npm run test:smoke` verde** no build local (~1,0s) e no `.exe` instalado (~1,1s): a
  janela aparece de verdade.

### Performance 50k — R4 vs R3 (§4)

Mesma máquina, mesmo script, corrida quente:

| Medida (50k, quente) | R3 | R4 | Δ |
|---|---|---|---|
| Boot até a Visão geral | ~396ms | ~379ms | −17ms |
| Abrir "Ganhos" | ~178ms | ~183ms | +5ms |
| Abrir "Gastos" | ~224ms | ~177ms | −47ms |
| Navegar 12 meses (por clique) | ~90ms | ~89ms | ≈ |
| Demais seções | 35–71ms | 34–76ms | ≈ |

**Leitura honesta:** o ledger **não** custou performance, e não podia mesmo: `bankBalances`
é UMA passada por array (nada de varredura por banco), memoizada por página — mesmo padrão
do `groupByMonth`. As diferenças estão dentro do ruído de medição (±40ms) já documentado na
R3; a queda em "Gastos" é ruído a favor, não otimização que eu possa reivindicar.

---

## INCIDENTE: o smoke test tocou os dados reais (Release 4) — 16/07/2026

### O que aconteceu
Durante a validação da R4, `npm run test:smoke` abriu o app contra o
`%APPDATA%\Zent Money\zent-data.json` **real** do usuário: migrou-o de v6 para v7 e
persistiu, e — como a rede também estava livre — consultou de fato a BrasilAPI
(`lastAutoAt: 2026-07-17T01:46:31Z`).

### Dano: nenhum, por sorte
O arquivo estava praticamente vazio (0 gastos, 0 extras, saldos zerados, 1 vigência de
salário) e tudo foi preservado; as taxas voltaram idênticas às que já lá estavam
(14,25 / 14,15 / 4,64 — a fonte oficial confirmou os valores do seed). Havia backup
automático de 16/07 03:33, e o app instalado passou a ser o R4, que lê v7. **A ausência de
dano foi acidente, não projeto.**

### Causa-raiz
O `smoke-window.mjs` nasceu na R3 com a premissa "lançar o app **como o usuário lança**" —
processo solto, sem depuração anexada. A premissa está certa e é o que dá valor ao teste,
mas ela vale para o **processo**, não para os **dados** nem para a **rede**. O script
herdava o ambiente inteiro e, sem `ZENT_USER_DATA`, o Electron usa o diretório real.
A regra da R2 ("teste nenhum roda contra os dados reais") existia desde então; o smoke
escapou dela por ter sido escrito para resolver outro problema.

### Correção
O smoke passa a criar um `ZENT_USER_DATA` temporário (removido ao fim) e a rodar com
`ZENT_OFFLINE=1`. **Uma janela aparecer não depende de quais dados ela mostra** — o
isolamento não custa nada ao que o teste prova. Verificado: smoke verde nos dois builds
(janela em ~1s) com o hash do arquivo real inalterado antes e depois.

### Lição
A cada release, todo script que **lança o app** — não só os testes — precisa passar pela
mesma pergunta: contra quais dados, e com qual rede? Os scripts do repositório hoje:
`perf-test.mjs` (dataset temporário próprio ✓), `screenshot.mjs` (recebe `ZENT_USER_DATA`
de quem chama ✓), E2E (`ZENT_USER_DATA` temporário + `ZENT_OFFLINE` ✓), `smoke-window.mjs`
(corrigido nesta seção ✓).

---

## Revisão de consistência R4 (§3) — achados e correções — 16/07/2026

Passe dedicado a números e textos que se contradiziam ou soavam crus. Cada achado abaixo
foi encontrado por varredura do código (não por acaso) e corrigido.

| # | Achado | Onde | Correção |
|---|---|---|---|
| 1 | **"100% da renda"** na Sobra em mês sem gasto algum — tecnicamente verdade, lido como se o mês tivesse sido analisado | `OverviewPage.tsx:289` | Mês sem gasto diz "nenhum gasto lançado"; mês sem movimentação nenhuma não mostra linha. O percentual só aparece quando há o que medir |
| 2 | **"— vs mês anterior"**: travessão solto ocupando espaço sem informar | `OverviewPage.tsx:55` | `Delta` devolve `null` sem base e a linha some. Como o projeto usa `exactOptionalPropertyTypes`, `undefined` ≠ ausente: o helper `detailProp()` remove a prop |
| 3 | **`inAccounts` calculado em duplicata** (dois `reduce` idênticos) | `OverviewPage.tsx:74` × `BanksPage.tsx:126` | `totalInAccounts()`/`bankBalances()` — helper único, agora derivado do ledger |
| 4 | **`invoices` calculado em triplicata** | Visão geral × Bancos × drill-down | `totalInvoices()` em `engine/cards.ts` |
| 5 | **"% da renda" dividido em dois lugares** (card e balão) | `OverviewPage.tsx:285` e `:345` | `savingsRatio()` em `aggregations.ts`, consumido pelo card, pelo balão e pelas mini-barras de 6m |
| 6 | **`savingsRatio` devolvia 0 sem renda** — "não há fração" e "não sobrou nada" são afirmações diferentes | idem | devolve `null`; a UI decide o que dizer |
| 7 | **Projeção ≠ média × dias**: `projected` vinha de `total/elapsed` cru, `avgPerDay` do valor arredondado — os dois lado a lado no card, e o usuário pode multiplicar | `aggregations.ts:137-138` | `projected = avgPerDay × dias`. Uma projeção não ganha nada com precisão que ninguém consegue conferir. Teste trava o par |
| 8 | **"Parcelas por mês"** (Bancos) parecia discordar de **"Compromissos"** (Visão geral): exclui avulsas de propósito, mas o rótulo não dizia | `BanksPage.tsx:187`, `BankDetailPage.tsx:173` | Renomeado para **"Parcelas de cartão/mês"** |
| 9 | **Hero × cards em tempos diferentes**: o hero é o patrimônio de HOJE, os cards são do mês navegado — lado a lado, sem avisar | `OverviewPage.tsx:84` | Marcador "**· hoje**" no hero fora do mês corrente |
| 10 | **Pluralização com `> 1`** em vez de `!== 1` (renderiza "0 quitada" no singular) | `BanksPage.tsx:541` | `=== 1 ? 'quitada' : 'quitadas'`, como no resto do app |
| 11 | **`Number('')` é 0**: string vazia viraria uma taxa de **0%** e zeraria os rendimentos em silêncio | `rates-source.ts` (código novo) | Guarda explícita → `null`. **Pego por um teste antes de existir em produção** |

**Não corrigidos, com motivo:** durante o count-up (~550ms) o balão mostra o valor final
enquanto os cards ainda contam — divergência transitória de animação, não de dados;
`formatBRLCompact` usa 1 casa decimal, mas só em rótulo de eixo de gráfico, onde a
precisão cheia não cabe nem serve.

### Revisão final: o que uma releitura cética da spec ainda encontrou

Depois de a suíte já estar verde, uma auditoria dedicada (implementação × spec, e caça a
regressões do saldo derivado) achou **5 defeitos reais** que os testes não pegavam:

| # | Defeito | Gravidade | Correção |
|---|---|---|---|
| 12 | **Sem tick diário do salário**: `runSalaryMaterialization` só rodava no boot. Quem deixa o app aberto atravessava o dia de pagamento sem crédito — e a UI promete "todo dia 5, o salário entra no saldo" | **Alta** — a promessa da tela não se cumpria | `setInterval` de 1h em `App.tsx`; sem mês vencido a função sai no primeiro `if`, então custa nada |
| 13 | **`creditSalaryFor`/`pendingSalaryCredits` sem a guarda de conta existente** que o caminho automático tinha: o clique criaria um crédito órfão, `bankBalances` o ignoraria e o **toast diria "o saldo já reflete a entrada"** sobre um saldo parado — além de queimar o mês no marcador | **Alta** — mentir sobre dinheiro é o pior defeito possível aqui | Guarda nos dois caminhos + `removeBank` limpa `salaryConfig.bankId` |
| 14 | **`removeBank` apagava pagamentos de fatura feitos por OUTRA conta** (cartão do banco X pago com dinheiro do banco Y) → o saldo do Y subiria sozinho | **Alta** — dinheiro aparecendo do nada | Só os pagamentos feitos **por** esta conta morrem com ela; os outros ficam, e o histórico diz "Fatura de cartão removido" |
| 15 | **`removeCard` não limpava `expense.origin`**, ao contrário do `removeBank`: o gasto ficava com um `cardId` morto e sumia de **todo** filtro de origem (não casa com "Sem origem" nem com cartão nenhum) | Média — lançamento invisível | Volta a "sem origem" |
| 16 | **Saldo corrido do histórico errava com lançamento retroativo**: o "Saldo inicial" era datado em `meta.createdAt` e um gasto anterior a ele ordenava antes, produzindo um corrido que nunca existiu — justo na tela cujo trabalho é denunciar quando a conta não fecha | Média | O saldo inicial recua para o mínimo entre `createdAt` e o movimento mais antigo, e fica sempre por último |

E um achado que **não era bug, era uma verdade vencida**: o comentário
"o saldo em conta não tem histórico, então repete-se o de hoje em todos os meses" (v2)
deixou de valer nesta release — todo movimento é datado agora. O custo dele era real: o
sparkline embutia o saldo de HOJE em janeiro e **a variação do hero era cega ao salário**
(`total` e `prevTotal` carregavam o mesmo saldo, então só o investido variava).
`accountBalanceSeries()` deriva o saldo mês a mês em uma passada + prefix-sum; a decisão
antiga foi marcada como revogada no `DECISOES.md`.

**A lição:** uma premissa documentada continua sendo lida como verdade muito depois de a
release que a criou ter mudado o mundo. Todo comentário que começa com "X não tem Y" é um
candidato a auditoria a cada release que mexe em Y.

---

## APP SUBIA SEM JANELA (Release 3) — causa-raiz — 16/07/2026

### Sintoma
O usuário abriu o atalho e "não deu certo": nada aparecia. O app **estava rodando** —
8 processos vivos por tentativa (e 12 acumulados de 4 cliques), renderer carregado,
zero erro — mas **`MainWindowHandle: 0`**: nenhuma janela, para sempre.

### Causa-raiz — `titleBarOverlay` impede `ready-to-show`
A janela nasce com `show: false` e só aparecia em `ready-to-show`. Com
`titleBarStyle: 'hidden'` + `titleBarOverlay` (a barra de título integrada, R3), esse
evento **nunca dispara** no Windows (Electron 33). Sem ele, nada chamava `show()`.

A/B que isolou a causa (mesma máquina, build local, ambiente limpo):

| Build | MainWindowHandle |
|---|---|
| R3 com `titleBarStyle: 'hidden'` + `titleBarOverlay` | **0 — sem janela** |
| Idêntico, só sem essas duas opções | 1902252 — janela "Zent Money" |

Instrumentando o ciclo de vida: `dom-ready` **dispara**, `did-finish-load` **dispara**,
`ready-to-show` **nunca**.

### Correção
`did-finish-load` passa a revelar a janela (dispara e é suficiente — o conteúdo já
está carregado, então não há flash), com `ready-to-show` mantido como gatilho
alternativo e um **timer de 4s como rede de segurança**: nenhum evento perdido
justifica um app sem janela, e `backgroundColor` já pinta o navy enquanto isso.
A barra de título integrada foi preservada.

### O ponto cego — por que a suíte inteira passou verde
**Nenhum teste que fale com o app pelo Playwright pode provar que o usuário vê algo.**
O Playwright conversa via CDP: `firstWindow()`, `capturePage()`, cliques e asserções
funcionam com a janela **oculta**. Os 24 E2E passaram, os 8 screenshots foram gerados
e até `win.isVisible()` retornou `true` sob o Playwright (a depuração anexada muda o
comportamento) — tudo isso com o app invisível para quem clica no atalho. A validação
"o app instalado abre" desta release era, portanto, **sem valor** para esta classe de
bug.

**Lacuna fechada:** `scripts/smoke-window.mjs` (`npm run test:smoke`) lança o app como
o usuário lança — processo solto, sem depuração anexada — e pergunta ao **Windows** se
existe janela de topo, filtrando por **nome de processo**. Provado contra o bug antes
de confiar nele: falha (exit 1) com `ready-to-show` sozinho, passa (exit 0, janela em
~1s) com a correção. Roda contra o build local e contra o `.exe` instalado.

> Nota: a 1ª versão do smoke dava **falso positivo** filtrando por título — a janela do
> VS Code se chama "… Zent Money … - Visual Studio Code". Por isso o filtro é por
> processo, e por isso um teste novo só vale depois de vê-lo falhar.

---

## Release 3 — checklist de aceite (§9 da spec R3)

- [x] Salário aceita "2000" (e "1.234,56" / "1234.56") em digitação natural; padrão
      aplicado a todos os campos monetários; regressão coberta por testes
      — **causa-raiz era o `Modal`, não o campo** (seção abaixo)
- [x] Parcelas avulsas: criar, pagar, desfazer; entram em Compromissos e resumos;
      **NÃO afetam limite de cartão** (unit + E2E provam); filtro "Avulsas"
- [x] BTG Banking e BTG Investimentos distintos, com migração preservando dados
      (ensaiada contra uma **cópia do arquivo real** do usuário: v3→v6 sem perda)
- [x] Logos n1–n4 aplicadas em todos os contextos, nos dois temas — símbolo oficial
      recortado do lockup; a 34px agora são legíveis (antes eram um borrão)
- [x] Drill-down do banco: cards, resumo, gráficos (investido, gastos por origem, uso
      de limite), cartões e parcelas, saldo editável
- [x] Gasto com "Pago com" opcional; análises por origem; migração ok
- [x] Fundo com glow/malha/vinheta; Visão geral recomposta (hero 52px, grid
      assimétrico, micro-títulos); empty states ilustrados; microdetalhes;
      reduced-motion respeitado
- [x] **Barra de título integrada ao app** (pedido do usuário nesta release): a barra
      branca do Windows saiu; faixa navy com a marca + botões nativos repintados.
      **Custou um bug de app-sem-janela** (seção no topo) — corrigido e coberto por
      um smoke test que prova que a janela aparece de verdade
- [x] Suíte completa verde: **88 unit + 24 E2E, zero erros de console**; varreduras
      anti-emoji e anti-hex re-executadas
- [x] Performance 50k medida **contra a R2 de verdade** (não contra o número
      declarado) — ver quadro abaixo: overhead pequeno e dentro do ruído
- [x] `AUDITORIA.md` e `DECISOES.md` atualizados; instalador regenerado e validado
- [x] Screenshots dos 2 temas em `screenshots/r3/` (Visão geral · drill-down do banco ·
      Parcelas com avulsa · Ganhos com salário 2000)

> Screenshots da R4 em `screenshots/r4/` (§5): Visão geral com salário creditado e
> "Em conta" coerente · histórico da conta com crédito de salário, gasto, transferência,
> fatura paga e ajuste de conciliação · menu de perfil com taxas automáticas e timestamp.

### Validação do instalador e da migração real (R3)

- `npm run dist` → `release/ZentMoney-Setup-1.0.0.exe` (82,3 MB).
- Instalação silenciosa **a partir de %TEMP%, com diretório de trabalho neutro**
  (regra da R2): **exit 0 em 10s**, destino `%LOCALAPPDATA%\Programs\Zent Money`,
  registro NSIS íntegro, atalho da área de trabalho e do menu Iniciar substituídos.
- **Migração ensaiada antes de instalar**, contra uma CÓPIA do arquivo real: v3→v6
  validado pelo Zod, sem perda.
- **App instalado + dados reais**: abre e mostra "BTG Banking" e "BTG Investimentos",
  zero erros de console.
- **Cenário "adicionar transações"** (numa cópia dos dados reais, para não sujar o
  arquivo do usuário): o arquivo sobe de v3 para **v6 na primeira gravação** — a
  migração roda em memória no boot e é persistida quando algo muda. Um gasto de
  "2000" **digitado tecla a tecla** gravou `200000` centavos com origem; "BTG" virou
  "BTG Banking" **com o mesmo id**, "BTG Investimentos" nasceu ao lado, e categorias,
  caixinha e perfil ficaram intactos.
  O id do BTG Investimentos é **determinístico** (`btg-inv-<id do BTG>`): abrir o app
  várias vezes sem salvar produz sempre o mesmo resultado — nenhum conflito.

### Performance 50k — R3 vs R2 medida (§6)

O número "53–145ms" da R2 **não se reproduz**: a 1ª execução após um build é sempre
**a frio** (boot ~1s) e as seguintes estabilizam. Para comparar igual com igual, a R2
foi reconstruída a partir do commit `2d9c000` e medida na mesma máquina, 3× cada,
descartando a corrida fria:

| Medida (50k, quente) | R2 | R3 | Δ |
|---|---|---|---|
| Boot até a Visão geral | ~375ms | ~396ms | +21ms |
| Abrir "Ganhos" | ~140ms | ~178ms | +38ms |
| Abrir "Gastos" | ~208ms | ~224ms | +16ms |
| Navegar 12 meses (por clique) | ~86ms | ~90ms | +4ms |
| Abrir Gastos (2ª vez) | ~142ms | ~160ms | +18ms |
| Demais seções | 29–86ms | 35–71ms | ≈ |

**Leitura honesta:** há um overhead pequeno e consistente (+4 a +38ms), esperado das
camadas de fundo do §4 e da UI nova (filtro de origem, drill-down). Um experimento
desligando `#root::before` devolveu só ~15ms no "Ganhos" e **piorou** o "Gastos"
(271ms) — ou seja, o ruído da medição (±40ms) domina a atribuição. Nada é perceptível
e tudo segue dentro do envelope de 95–406ms da auditoria original. Agrupamentos
mês→dados continuam memoizados; navegar meses não regrediu.

---

## BUG BLOQUEANTE DO SALÁRIO (Release 3, §1) — causa-raiz — 16/07/2026

### Sintoma
Em Ganhos → Editar salário, digitar "2" travava o campo: nenhum dígito adicional era
aceito e o salário ficava preso em R$ 2,00.

### Causa-raiz — o `Modal`, não o campo monetário
A hipótese da spec (input formatando/parseando a cada tecla) **foi refutada**: o
`MoneyInput` já preservava o texto digitado durante o foco. O culpado era o
`Modal` (`src/design/components/Modal.tsx`), em dois defeitos compostos:

1. **`onClose` nas deps do efeito de foco.** O modal do salário recebe
   `onClose={() => setSalaryModal(false)}` — função nova a cada render do `IncomePage`.
   Como o rascunho do salário (`salaryDraft`) mora no **pai** do Modal, cada tecla
   re-renderizava o pai, mudava a identidade de `onClose` e **re-executava o efeito**.
2. **O efeito focava o botão errado.** `panelRef.querySelector('input, select, textarea,
   button')` varre o painel inteiro em ordem de documento — e o **"Fechar" do cabeçalho
   vem antes do campo**. Logo, cada tecla movia o foco para o "Fechar"; o `blur` do input
   formatava "2" → "2,00" e as teclas seguintes iam para o botão.

Diagnóstico que fechou o caso (Playwright, digitação tecla a tecla):
`{"value":"2,00","activeTag":"BUTTON","activeLabel":"Fechar"}`.

### Correção
- `onClose` guardado em ref (`onCloseRef`); deps do efeito reduzidas a `[open]`.
- Foco inicial mira o primeiro campo do **corpo** do modal (`bodyRef`), nunca o "Fechar".
- Era **bug latente de todo modal com estado no pai** — a correção no componente do design
  system cura a classe inteira. Varredura confirmou que 100% dos campos monetários já
  passam pelo `MoneyInput` (nenhum `<input>` cru de dinheiro), então o padrão único da
  §1 já era o vigente; ficou documentado em `DECISOES.md`.

### Por que a suíte não pegava
Os E2E usavam `fill()`, que injeta o valor de uma vez e dispara um único evento — o bug
só se manifesta tecla a tecla. **Lacuna fechada**: o teste 20 digita com `keyboard.type`
nos 3 formatos ("2000" · "1.234,56" · "1234.56") em 3 campos diferentes (salário, gasto,
caixinha), confere o valor **persistido** e assere que o campo **mantém o foco**. Unit
novo cobre os estados intermediários do parse ("2", "2.", "2,", "2.0" e todos os
prefixos de "1.234,56" / "1234.56").

**Estado após a correção:** 72 unit + 21 E2E verdes, typecheck estrito e lint limpos,
zero erros de console.

---

## Release 2 — checklist de aceite (§10 da spec R2)

- [x] Instalador `.exe` gera, instala e abre sem erros; **causa-raiz documentada abaixo**
- [x] `package.json` válido, lockfile consistente, Node fixado em `engines` (>=20 <25)
- [x] **Zero emojis no produto** — varredura por regex comprova (única ocorrência restante:
      o mapa de migração v2→v3 em `migrations.ts`, que é DADO necessário); ícones SVG
      únicos (Lucide, traço fino, `currentColor`), legíveis nos dois temas
- [x] Disciplina de cor: neutros navy + 1 acento (azul-céu) + semânticas restritas;
      multicolor só na rosca de gastos (`--cat-1..10` dessaturada); nenhuma cor de tema
      fora de tokens (varredura; exceção documentada: cores-DADO de marca/categoria)
- [x] Fonte premium única (**Geist**) empacotada, numerais tabulares, hierarquia editorial
- [x] Sidebar hambúrguer **sem** texto "recolher menu"; animações suaves (colapso com
      ease-out-quint, páginas com fade+slide+stagger, count-up, gráficos que se desenham)
      respeitando `prefers-reduced-motion`
- [x] Nova logo "Z em degraus" (símbolo + wordmark) e novo ícone `.ico` multi-tamanho
      (16–256) aplicados em app, instalador e atalho
- [x] Logos dos bancos em todos os contextos (cards, chips da Carteira, Parcelas,
      BankSelect) com contraste garantido; **2 BTGs distintos**; fallback intacto
- [x] Visão geral com os 4 novos dashboards (ritmo do mês, taxa de poupança 6m,
      mapa de calor, patrimônio 12m) + variação ±% vs mês anterior (extra aprovado)
- [x] Modo privacidade, Ctrl+K com ações, overlay `?` e copiar-valor funcionando (E2E)
- [x] Suíte completa verde: **71 unit + 20 E2E, zero erros de console**; screenshots dos
      dois temas em `screenshots/r2/`; performance 50k sem regressão (seções 53–145ms,
      navegação de mês ~85ms)

---

## INCIDENTE E CAUSA-RAIZ DO INSTALADOR (Release 2, §2) — 16/07/2026

### Sintomas relatados
Build do instalador falhando e `package.json` marcado em vermelho no VS Code.

### Causa-raiz (três problemas compostos)

1. **Registro do NSIS apontando para a pasta do projeto.** O instalador assistido do
   electron-builder persiste o destino em `HKCU\Software\<APP_GUID>\InstallLocation`
   e o REUTILIZA em toda instalação seguinte. Essa chave estava gravada como
   `C:\Users\allan\OneDrive\Desktop\Zent Money` (uma execução anterior do setup foi
   apontada/aberta na pasta do projeto). Resultado: **cada nova execução do setup
   instalava o app POR CIMA do projeto**, e o passo "remover instalação antiga" do
   NSIS **apagou o código-fonte inteiro** (src/, electron/, tests/, docs, package.json).
   - *Correção:* chave `HKCU\Software\647f5eaf-abcb-569a-8002-919fd026a4c3` removida;
     reinstalação validada no destino correto (`%LOCALAPPDATA%\Programs\Zent Money`).
   - *Prevenção:* testes de instalação passam a rodar SEMPRE com o setup copiado para
     %TEMP% e diretório de trabalho neutro, verificando o destino real após instalar.

2. **Projeto dentro de pasta sincronizada pelo OneDrive.** O sync corrompia o
   `node_modules` (arquivos sumindo entre um build e outro, ex.: templates do NSIS),
   apagou o `package-lock.json` durante o diagnóstico e travava o próprio NSIS ao ler
   o setup de dentro da pasta sincronizada (instalação de 78 MB levava minutos e
   abortava; de %TEMP%, 4–22 s). O "`package.json` vermelho" no VS Code era o estado
   de conflito/deleção do sync.
   - *Correção:* `node_modules/` e `release/` viraram **junctions** para
     `%LOCALAPPDATA%\ZentMoneyBuild\` (fora do OneDrive); `out/` permaneceu pasta real
     porque o empacotador não atravessa junctions no glob de `files`.
   - Recomendação registrada no README: idealmente mover o projeto para fora do OneDrive.

3. **Recuperação.** O projeto foi **regenerado por completo** (código, testes, scripts,
   configs e docs) e a fidelidade foi provada com a suíte completa:
   **typecheck estrito limpo · lint limpo · 66/66 unit · 16/16 E2E · zero erros de console**.
   Um repositório **git** local foi inicializado como proteção permanente
   (commit inicial `9d9b706`).

### Nota de diagnóstico (para futuros testes na máquina de dev)
Shells abertos pelo VS Code exportam `ELECTRON_RUN_AS_NODE=1`. Qualquer app Electron
lançado a partir deles roda como Node puro (sem janela). Ao testar o app instalado via
terminal, remova a variável do ambiente do processo — pelo atalho/Explorer não há problema.

### Validação final do instalador (§2 itens 3–4)
- `package.json` validado (parse estrito, sem BOM, sem chaves duplicadas); `engines`
  fixa Node `>=20 <25`; lockfile regenerado com instalação limpa.
- `npm run dist` gera `release/ZentMoney-Setup-1.0.0.exe` (78,6 MB).
- Instalação silenciosa a partir de %TEMP%: **exit 0 em 4 s**, app em
  `%LOCALAPPDATA%\Programs\Zent Money`, atalho criado, registro NSIS apontando
  para o destino correto.
- App instalado abre e **persiste os dados no diretório de usuário**
  (`%APPDATA%\Zent Money\zent-data.json` + `backups/`), não no diretório de instalação.
- Revalidado com o build da R2: o app instalado abriu e **migrou o arquivo de dados
  real v1→v3 automaticamente** no primeiro boot.

---

## Auditoria técnica do produto (v2) — §10 da especificação

## 1. Testes unitários do motor financeiro — ✅ 66/66 verdes (Vitest)

| Exigência | Teste | Resultado |
|---|---|---|
| Virada de ano dez→jan e 2099→2100 | `dates.test.ts` | ✅ |
| Avanço mês a mês até 2100 | `dates.test.ts` | ✅ 888 passos validados |
| Parsing de dinheiro BR/US | `money.test.ts` | ✅ BR, US, milhar, `R$`, negativos, round-trip |
| Juros compostos ao centavo vs fórmula direta | `investments.test.ts` | ✅ 1 e N aportes |
| Rendimento mensal ≡ saldo anterior × taxa | `investments.test.ts` | ✅ (≤1 centavo de arredondamento) |
| Série termina no mês atual | `investments.test.ts` + `manual-assets.test.ts` | ✅ inclusive p/ ativos manuais |
| Regra do limite (5.000/100×10) | `cards.test.ts` | ✅ testado 0→10 pagas |
| Ativos manuais | `manual-assets.test.ts` | ✅ carry-forward, rend. negativo, snapshot sem taxa, classes |
| Migração 1→2 | `migrations.test.ts` | ✅ arquivo v1 real migra e valida; versão futura rejeitada |
| Recorrências | `recurring.test.ts` | ✅ materialização, virada de ano, dia 31→último dia (2100 não-bissexto) |
| Agregações em passada única | `aggregations.test.ts` | ✅ |

## 2. Teste E2E — ✅ 16/16 verdes (Playwright dirigindo o Electron real)

Jornada completa em dados isolados (`ZENT_USER_DATA` temporário), cobrindo as **8 seções**:
boot com seed + balão inteligente · sidebar (hambúrguer e Ctrl+B) · tema claro/escuro ·
Ganhos (salário + extra) · onboarding de categorias · gastos com reclassificação, filtro e
**alerta de limite estourado** · **recorrente criado e encerrado** · **caso de aceite do
cartão 5.000/100×10** (4.000 → +1 paga → 4.100 → desfazer) · **Parcelas consolidada** com
+1 paga/desfazer · **Carteira** (classes, aporte, 3 modos, filtros banco×classe) ·
**ativo manual** com atualização de valor · **busca global Ctrl+K** · Caixinhas · Linha do
tempo · navegação de mês + balões · **zero erros de console/runtime**.

## 3. Auditoria estrutural — ✅

- TypeScript **estrito** limpo (zero `any`); ESLint limpo (inclui react-hooks).
- As 8 views do registro têm página real renderizada (o E2E navega por todas).
- Zero `alert()`/`confirm()` nativos. Dados validados com Zod no load/import.
- Varredura anti-hex: nenhum hex de TEMA fora de `tokens.css` (exceção documentada:
  cores-DADO — marcas de bancos e cores de categoria do usuário).

## 4. Performance — ✅ 50.000 lançamentos (scripts/perf-test.mjs)

Dataset em schema v1 de propósito (migração 1→2 real no boot): boot ~1 s; abrir cada uma
das 8 seções entre 95–406 ms; navegar 12 meses a ~88 ms por clique. Apenas a view ativa
monta; agrupamentos mês→dados memoizados; séries incrementais O(meses+aportes).

## 5. Bugs históricos encontrados e corrigidos

1. `ELECTRON_RUN_AS_NODE=1` herdado do shell do VS Code fazia o Electron rodar como Node
   puro — variável removida nos launchers de teste/screenshot.
2. Entradas do electron-vite geram `out/main/main.js` (não `index.js`) — caminhos corrigidos.
3. E2E rodava contra os dados reais — isolamento por `ZENT_USER_DATA` temporário.
4. NBSP do `Intl.NumberFormat` quebrava asserções/lint — testes normalizam via ` `.
5. winCodeSign do electron-builder falha com symlinks macOS no Windows — extração manual
   no cache.
6. Varredura completa do histórico ao navegar meses violaria §10.4 — agrupamento memoizado.
7. Rename da seção para "Carteira" quebrou o script de perf — rótulos atualizados.
8. **Release 2:** incidente do instalador (seção acima) — registro NSIS + OneDrive.
9. **Release 3:** `Modal` roubava o foco do campo em uso a cada tecla (bug do salário,
   seção acima) — `onClose` inline nas deps do efeito + foco no "Fechar".
10. **Release 3:** `<Field>` (um `<label>`) em volta de um `Segmented` (tablist)
    reivindicava o primeiro botão e embaralhava o nome acessível das abas — pego pelo
    E2E em modo estrito. O seletor de tipo não usa `Field`; `Segmented` ganhou `ariaLabel`.
11. **Release 3:** os logos de Bradesco/Santander/BTG eram o lockup horizontal espremido
    num quadrado — ilegíveis a 34px, o tamanho real de uso.
12. **Release 3:** `titleBarOverlay` impede `ready-to-show` de disparar → o app subia
    sem nunca mostrar a janela (seção no topo). A suíte E2E não pegava porque o
    Playwright dirige o app com a janela oculta; daí o `npm run test:smoke`.
13. **Release 4:** o fluxo declarado e o saldo em conta eram dois sistemas sem ligação —
    "entrou R$ 2.000, Em conta R$ 0,00" (seção no topo). Não era bug de cálculo: era
    ausência de modelo. Corrigido com o ledger híbrido e o saldo derivado.
14. **Release 4:** `Number('')` é `0` — uma resposta vazia das APIs de taxas viraria uma
    taxa de **0%** e zeraria os rendimentos em silêncio. Pego por um teste do parser
    **antes** de o código chegar a produção.
15. **Release 4:** o `smoke-window.mjs` (nascido na R3 para provar que a janela aparece)
    rodava contra os **dados reais** e a **rede real** — violando a regra da R2 sem que
    ninguém notasse, porque ele foi escrito para resolver outro problema. Seção acima.
16. **Release 4 (pegos na revisão final, não pelos testes):** salário sem tick diário;
    crédito órfão com toast mentindo que o saldo mudou; `removeBank` apagando pagamento de
    fatura feito por outra conta (dinheiro do nada); `removeCard` deixando gasto invisível
    em todo filtro; saldo corrido errado com lançamento retroativo. Quadro na seção de
    consistência.

## 6. Comandos de reprodução

```bash
npm run typecheck && npm run lint   # estático
npm test                            # 147 testes unitários (rede sempre mockada)
npm run build && npm run test:e2e   # 26 testes E2E no Electron real (ZENT_OFFLINE=1)
npm run test:smoke                  # a janela aparece? (dados isolados, sem rede)
node scripts/perf-test.mjs          # performance 50k + migração v1→v7 real
npm run dist                        # instalador em release/
```

Variáveis de ambiente de teste: `ZENT_USER_DATA` (diretório de dados alternativo — **todo
script que lança o app deve definí-la**) e `ZENT_OFFLINE=1` (corta a única conexão de rede
do app, a consulta de taxas).
