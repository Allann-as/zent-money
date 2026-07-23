# AUDITORIA.md — Zent Money

## R10 ⑥ — LINHA DO TEMPO, O PAINEL DOS ANOS (23/07/2026)

A Linha do tempo era uma janela FIXA de 12 meses com um gráfico de barras.
Virou um painel com seletor de período, faixa de estatísticas, balão narrativo e
seis painéis, com o gráfico principal em área contínua com sinal.

### Nenhuma regra de dinheiro nova (a disciplina da R4)

Todo número vem de `engine/timeline.ts`, que só **lê** as agregações que já
existiam (`incomeByMonth`, `sumByMonth`, `savingsRatio`). Se um número desta
página discordasse do resto do app, o defeito seria uma segunda fórmula — o erro
que a R4 passou uma release caçando. O motor tem 15 testes unitários que provam
o **recorte** (não a aritmética): tamanho exato de cada janela, "ano a ano"
começando em janeiro, denominador honesto (mês sem registro não conta), e o
"sem base de comparação → null" em vez de um zero que mentiria.

### O gráfico principal: área contínua com sinal (`SignedArea`)

Uma linha só, do primeiro ao último mês, preenchida na **cor do lado**: menta
acima do zero, coral abaixo. A leitura que barras com pastilhas soltas não
davam é a **travessia** — o mês em que a curva cruza o zero.

Como os dois degradês saem exatos: uma área só, fechada na LINHA DO ZERO (não no
rodapé), pintada duas vezes, cada passada com um `clipPath` retangular (um acima
do zero, outro abaixo). **Sem cálculo de interseção com o eixo** — a travessia
sai por construção, inclusive quando cai no meio de um segmento (quase sempre). O
degradê de cada lado nasce opaco no zero e some ao se afastar: é o zero que
precisa de peso, não o extremo.

**Verificado com o zero cruzado de verdade:** o dataset demo nunca fica
negativo, então nem ele nem o teste de estresse exercitam o coral. Injetei um
gasto de R$ 9.000 num mês e conferi no app: menta acima, coral abaixo, a linha
passando pela linha de zero real, os pontos "melhor"/"pior" nas cores certas e o
balão narrando "gastou R$ 7.285,91 a mais". A régua de magnitude também confirma
que o eixo negativo ("−R$ 5 mil", "−R$ 10 mil") cabe no gutter medido.

### Os demais painéis

- **Patrimônio acumulado** (`LineArea`): soma corrida de sobra + aportes. É a
  curva do que se construiu no período, não o saldo do ledger (que não tem
  histórico — ver o marcador "· hoje" do hero, R4 §3).
- **Taxa de poupança** com a **linha de meta 30%** tracejada no acento (a mesma
  nota cheia do score). Mês sem renda entra como 0 no traço, mas o tooltip diz
  "sem renda registrada" em vez de mentir um "0%" que pareceria mês ruim.
- **Ano a ano**: barras agrupadas (entrou/saiu/aportado) com legenda.
- **Maiores categorias**: barras horizontais que somam exatamente o total de
  gastos do período (asserido no teste).
- **Quadro de recordes**: melhor/pior mês de sobra, maior entrada, mês mais
  econômico, maior aporte e o total aportado.

### Um defeito que o `audit-mono` pegou

A linha de apoio do StatCard "Guardado no período" trazia
`R$ 300,00/mês em média` como **string**, e uma string mistura número e frase
num nó de texto só — que caiu inteiro em Nunito. O §12 quer o número em mono, a
frase não; corrigido embrulhando só o valor num `.tnum`. É o mesmo cuidado que a
v2.1 já aplicou ao valor-herói: mono é do VALOR, não da prosa em volta.

### Estado da suíte (⑥)

typecheck estrito · lint · **272 unit** (+15 de `timeline`) · **41 E2E** (o **14**
virou o painel dos anos: faixa de estatísticas, área contínua, meta 30%, e o
seletor de período trocando a janela) · smoke · céu 6/6 · ilha 303/303 · **mono
0 fora do mono** · **estresse de magnitude 2.296/2.296** — verdes.

Screenshots em `screenshots/r10-m6/` (topo, painéis, fim, janelas 6m/24m/tudo,
privacidade — 2 temas).

---

## R10 ⑤ — PARCELAS EM UM CLIQUE + ÍCONES v2 (23/07/2026)

### Auditoria da tela de bloqueio (feita antes de codar)

Verificação item a item do §14.1 contra o código, para saber o que o ⑦ ainda
precisa construir:

| Item | Status | Onde |
|---|---|---|
| Paleta do Bloco 1 | **ok** | `BLOCK_OF.lock = 1` · `useColorBlock('lock')` |
| Logo Ascensão com halo | **ok** | `LockScreen.tsx` (ZentMark + halo duplo) |
| Céu galáxia | **ok** | `GalaxyField` montado FORA do portão (`App.tsx`) — bloquear/desbloquear não recria o campo |
| **Linha viva** | **ausente** | o subtítulo é texto fixo; não há mensagem rotativa, variante de privacidade nem teste de `R$ <dígito>` no bloqueio |
| 1ª execução: card ou layout do bloqueio? | **ok** | já é o MESMO componente e layout (`mode='setup'`) — não existe card centralizado |
| Passo do nome / saudação com nome | **ausente** | `profile.name` **já existe** (schema, `ProfileMenu`, "Olá, {nome}" na sidebar), mas a 1ª execução não pergunta e o desbloqueio diz só "Zent Money" |
| Cursor de terminal piscando | **ausente** | nenhum caret/blink no código |
| Forma do botão de confirmar do teclado | **divergente** | a tecla OK é `rounded-full` — ação em forma oval, contra a regra de famílias |

Conclusão: o **fundo** do bloqueio está conforme; falta exatamente o que o ⑦
entrega. E o nome do usuário **não precisa de migração** — o campo já existe.

### Parcela em um clique

- `PayInstallmentDialog`: confirmação **já preenchida** (parcela Nª, valor,
  quantas faltam depois, limite antes→depois), **sem nenhum campo para digitar**
  — asserido no E2E (`dialog.locator('input, textarea')` tem contagem 0).
  Confirmar aplica a mutação e o toast traz **"Desfazer pagamento"**.
- A mutação saiu da página e virou o par `payInstallment`/`unpayInstallment` em
  `store/mutations.ts`. Antes ela era um `mutate` inline **duplicado** em
  Parcelas e em Bancos & Cartões — duas cópias da mesma regra, exatamente o que
  o M1 §a foi criado para impedir.
- **Card quitado ganhou estado próprio**: borda e fundo em `pos`, selo "QUITADA",
  barra cheia em `pos` e nenhuma ação de pagar. Antes era o card ativo a 55% de
  opacidade, que lê como "desligado" — quitar é conquista, não indisponibilidade.

### Por que NÃO há "conta a debitar" (decisão registrada em DECISOES)

A spec pedia um `BankPicker` de conta a debitar. Em compra de **cartão** isso
seria dupla contagem: a parcela já está dentro da fatura (snapshot manual, R3
§3.4) e o dinheiro sai no pagamento da fatura. O diálogo diz isso com todas as
letras e oferece o atalho "Pagar fatura do {cartão}", que aí sim escolhe a conta
e debita — via o `PayInvoiceDialog` já testado, que ganhou a prop `cardId` para
abrir no cartão certo. Em parcela **avulsa** não há fatura nem conta no modelo;
ligá-la a um débito real é evento novo + migração e pertence à etapa de
suficiência de saldo. **Prova de que nada de dinheiro se move:** teste unitário
que assere saldo de todas as contas e fatura total inalterados após pagar.

### Ícones v2

Set de 20, `currentColor`, **stroke 1,6** único, todos conferidos ampliados
(`screenshots/r10-m5/icones-v2-zoom-*`). Saíram câmera, música e pet; o cadeado
virou o **cofre** novo; entraram **saco de dinheiro**, **maleta de dinheiro**,
**desenvolvimento pessoal**, **casamento** e **poupança**; o alvo ganhou o dardo.

**Três desenhos foram REPROVADOS na primeira passada e refeitos** — e só o
ampliado denunciou:
1. **Alvo**: o dardo apontava para FORA, e o ícone lia como "alvo + seta de
   alta". A ponta foi para o centro.
2. **Cofre**: os spokes cruzados viravam um losango no miolo e o conjunto lia
   como moldura. Virou segredo + alavanca lateral.
3. **Maleta de dinheiro**: retângulo com um círculo no meio = **câmera**. O
   miolo virou cifrão, que é o que a separa da maleta de trabalho (que também
   está no set).

**Migração v10→v11**: as chaves aposentadas são remapeadas
(`camera`/`music` → presente, `paw` → saúde, `lock` → cofre). O mapa é copiado
para dentro da migração de propósito — migração descreve o passado e não pode
mudar de resultado quando o set evoluir de novo (mesma disciplina dos hex do
BTG). Um teste assere que **toda** chave sobrevivente existe no set atual.

### Um bug que só o app rodando pegou: dois "desfazer" na tela

O E2E ficou vermelho em 20 testes, todos em cascata a partir do 8. Causa real:
o botão de desfazer do card chama-se "desfazer" e a ação nova do toast chamava-se
"Desfazer" — **dois botões com o mesmo nome acessível, visíveis ao mesmo tempo**,
porque o toast aparece no instante em que o card é atualizado. O strict mode do
Playwright pegou; um leitor de tela leria a mesma ambiguidade. **Corrigido na
origem, não no teste**: a ação do toast virou "Desfazer pagamento" e o botão do
card ganhou o nome acessível "Desfazer última parcela paga de {nome}".

### Estado da suíte (⑤)

typecheck estrito · lint · **257 unit** (+8: pagar→desfazer neutro, limite
devolvido por derivação, nenhum saldo se move, clamp nas duas pontas, id
inexistente é no-op, e três da migração de ícones) · **41 E2E** (+1: **9c**
card quitado; o **9** virou o fluxo de confirmação; o **8** assere o limite
antes→depois dentro do diálogo) · smoke · céu 6/6 · ilha 303/303 · mono ·
**estresse de magnitude 2.296/2.296** — todos verdes, zero erros de console.

Screenshots em `screenshots/r10-m5/` (12 arquivos × 2 temas).

---

## R10 — ROBUSTEZ DE MAGNITUDE (23/07/2026)

Regra permanente registrada em `DECISOES.md`: **nenhum número pode transbordar
seu container em nenhuma magnitude**. O app tem de aguentar R$ 100.000.000,00 em
qualquer lugar.

### O defeito, medido antes de corrigido

O relato era "os números vazam por cima da rosca". A causa não era da rosca:

- `Donut.tsx` centralizava o miolo com `px-6` — uma largura CHUTADA de 142px.
  Com `size=190`/`thickness=22`, o raio interno é 74,1px. Pela corda
  `2·√(r² − (h/2)²)`, um bloco de **2 linhas** (repouso) permite 142,7px: passava
  raspando. No **hover** o bloco vira 3 linhas, o limite cai para ~136px e a
  caixa continuava com 142. **O bug só existia na interação** — é por isso que
  sobreviveu a todas as suítes anteriores.
- `ProgressRing.tsx` centralizava com `inset-0` e margem **nenhuma**: a área útil
  declarada era o quadrado que contém o círculo.
- O anel de **Hoje** não usava `ProgressRing` — era uma cópia local em
  `TodayPage.tsx` com o mesmo defeito. Foram três lugares, não um.

### Defeitos sistêmicos que o teste de estresse revelou

1. **`.tnum` sobrescrevia o `fontSize` dos SVGs.** `font-size: 0.95em` numa
   classe vence atributo de apresentação: todo `fontSize="10.5"` dos gráficos
   renderizava a ~13,3 unidades — 27% maior que o pretendido, em todas as
   etiquetas de eixo do app, desde sempre.
2. **Gutter do eixo Y era constante.** `PAD_L = 56` fixo, com as etiquetas
   desenhadas a partir de `PAD_L − 8`: "R$ 187,5 mi" (54px) sobrava −6px e
   **saía pela esquerda do gráfico**. Em `Bars` o vazamento chegava a 19px.
3. **Coluna de valor com largura fixa.** `w-24` (96px) na lista de gastos cortava
   qualquer valor acima de ~R$ 999.999,99.
4. **Mini-cards da Carteira** transbordavam a partir de milhão.
5. **`formatBRLCompact` escolhia a unidade pelo valor BRUTO.** R$ 999.999.999,99
   virava "R$ 1.000 mi" — mais largo que o necessário e lendo como mil milhões.
   A unidade passou a ser escolhida depois de arredondar, e ganhou o degrau de
   bilhão.

### O que foi construído

- `design/ringGeometry.ts` — a fórmula da corda, medição de texto por canvas
  (sem reflow) e a cascata de adaptação como função pura.
- `<RingCenter>` + `<FitValue>` + `<RingLabel>` — miolo que reserva o pior caso e
  aplica a cascata; `<FitBox>` leva a mesma cascata para fora dos anéis.
- Cascata na ordem da spec: rótulo secundário → prefixo 0.6em → fonte até o piso
  de 13px → anel até 14px → compacto com valor exato no `title`/`aria-label`.

### Teste de estresse (`scripts/stress-magnitude.mjs`)

Roda o app de verdade em 7 magnitudes (×1 a ×1.000.000 sobre o dataset demo, o
que leva o maior valor a ~R$ 5 bilhões) × positivos e negativos × 2 temas ×
1366×768 e 1920×1080 × 10 seções, e em cada combinação verifica **estados de
interação**, não só o render estático: hover em cada fatia da rosca, tooltip
aberto, modo privacidade e **durante o count-up**, quando o número passa por
larguras intermediárias.

Asserções: `scrollWidth > clientWidth`, texto cortado por ellipsis, rótulo de SVG
vazando para fora da área do gráfico, os quatro cantos do miolo dentro do círculo
(verificação geométrica, não só de largura) e valor exato presente no
`title`/`aria` sempre que houve compactação.

**Progressão da correção:** 574 → 306 → 64 → 50 → **0 violações**.

**Resultado final: 2.296 varreduras, zero violações.**

### Estado da suíte depois da robustez de magnitude

typecheck estrito · lint · **249 unit** (11 novos: fórmula da corda, degraus da
notação compacta, afinamento de anel) · **40 E2E** · smoke · céu (6/6) · ilha
(303/303) · mono · **estresse de magnitude (2.296/2.296)** — todos verdes.

**Perf 50k:** 130–134ms/clique em três medições limpas (baseline v2.1 ~124,
faixa histórica desta sessão 115–134). A primeira medição deu 159ms e foi
**descartada**: a varredura de magnitude tinha acabado de terminar e ainda havia
instâncias do Electron encerrando — medir com a máquina disputada mede a
máquina, não o app.

### A fórmula conferida no app rodando

Anel de Hoje: raio interno **73,5px**, altura do bloco no pior caso **67px**,
corda calculada **122,8px** — e o `maxWidth` efetivamente aplicado ao miolo é
**122,843px**. A geometria não é uma intenção no comentário: é o número que está
no DOM.

### Regressões que a própria correção causou (e como apareceram)

Corrigir isto quebrou o E2E duas vezes, e vale registrar porque as duas eram do
mesmo tipo:

1. **A cascata era agressiva demais.** Pedir espaço a QUALQUER encolhimento fazia
   o rótulo "gasto hoje" sumir já em R$ 150,00 — porque os 30px do anel de Hoje
   **nunca** couberam ali (a corda útil é ~123px e o valor mede ~162px). O
   tamanho antigo só não parecia quebrado porque o texto transbordava por cima do
   anel. Agora a base é 22px e o rótulo só cede quando o valor chega perto do
   piso ou precisa compactar.
2. **`FitBox` embutia `w-full`** e um chamador passou `w-auto`: conflito de
   utilitárias do Tailwind resolvido pela ordem no CSS gerado — a coluna de valor
   virou a linha inteira e empurrou a descrição do gasto para fora da tela.
   **Quarta ocorrência** dessa mesma classe de erro nesta release (as outras
   três: `.tnum`×`.font-display`, `relative`×`absolute`, `opacity`×`opacity`).

### Duas vezes o teste estava errado, não o app

Vale registrar, porque é o tipo de coisa que corrompe uma suíte:

1. A sonda media `<text>` de SVG com `scrollWidth`/`clientWidth`, que são
   propriedades de caixa de HTML e não significam nada ali — centenas de falsos
   positivos. Rótulo de eixo se mede pela caixa geométrica contra a do `<svg>`.
2. O harness zerava TODOS os campos de dinheiro para exercitar a magnitude 0, e
   produzia `monthlyLimit: 0` e `salaryHistory.amount: 0` — estados que o schema
   **recusa**, e com razão. O app não abria e estava certo. O fator 0 saiu: a
   magnitude R$ 0,00 já é exercitada em toda corrida, porque o dataset demo tem
   três bancos com saldo zero.

---

## R10 "Céu de Galáxia" — milestones ①–④ (23/07/2026)

Sessão parada no milestone ④, como combinado. Entregues: quatro blocos de cor,
marca Ascensão, Roboto Mono, botões fio de luz, céu de galáxia global, menu
borda viva, ilha de ações, Formato A, calendário próprio e indicador de limite.
Pendentes para a próxima janela: ⑤ parcelas em um clique + ícones v2 · ⑥ linha
do tempo · ⑦ primeira execução com nome · ⑧ taxa por investimento · ⑨ validação
de 20 anos · ⑩ auto-revisão visual + Release.

**Nenhuma lógica financeira nova entrou.** Os contadores do menu, o indicador de
limite e a prévia do gasto são LEITURAS de dados que já existiam; o ledger, as
mutações e os invariantes não foram tocados.

**Estado da suíte:** typecheck estrito · lint · **238 unit** · **40 E2E** ·
smoke — todos verdes, zero erros de console nas duas janelas. Mais três
verificadores novos que rodam o app de verdade (§16): `audit-mono`,
`verify-sky` e `verify-island`.

**Perf 50k** (quente): navegar 12 meses **115ms/clique** (baseline v2.1 ~124 —
sem regressão) · boot ~891ms.

### Números medidos, não estimados

| O quê | Onde | Resultado |
|---|---|---|
| Custo do céu a 1366×768 (201 estrelas) | `perf-sky.mjs` | **1,05ms/frame** no pior caso |
| Custo do céu a 1920×1080 (359 estrelas) | `perf-sky.mjs` | **1,74ms/frame** no pior caso |
| Pares da constelação testados/frame a 1920 | grade espacial | **1.815** (contra 64.261 do laço ingênuo) |
| Regras de produção do céu | `verify-sky.mjs` | **6/6** comprovadas no app rodando |
| Sincronia canvas × `--sky` na travessia | `verify-sky.mjs` | diferença **0/255** em 14 amostras |
| Ilha de ações não cobre nada | `verify-island.mjs` | **303/303** (10 seções × 5 rolagens × menu fixado/solto × 3 resoluções) |
| Roboto Mono em 100% dos números | `audit-mono.mjs` | **0 ocorrências fora do mono** (10 seções × 2 temas) |
| Contraste da paleta dos 4 blocos | gerador com verificação | pior caso **AA** (4,51) |

### FPS do céu — as duas resoluções, como o Allan pediu

A densidade é proporcional à ÁREA, então o termo O(N²) da constelação cresce com
o quadrado: 1366×768 dá N≈201, 1920×1080 dá N≈359 — três vezes mais pares, não
1,4×. Medido nos dois, com as 10 seções:

| Resolução | Estrelas | Pior seção | Custo do céu | Pior FPS |
|---|---|---|---|---|
| 1366×768 | 201 | Crédito | 1,05ms/frame | 178 |
| 1920×1080 | 359 | Hoje | 1,74ms/frame | 117 |

A grade espacial **foi** necessária a 1920, como previsto. Antes das duas
otimizações o pior caso era **5,23ms/frame** — quase um terço do orçamento de um
frame de 60fps.

### Duas correções de desempenho, ambas sem mudar um pixel

1. **Grade espacial na constelação.** Células de exatamente 84px (o limiar do §1):
   cada estrela só pode ter vizinho dentro do limiar na própria célula ou nas 8
   ao redor. A saída é idêntica — mesmos pares, mesmos índices `i`/`j` (o `+i+j`
   do seno depende deles), mesma ordem de pintura. Só somem as comparações que
   nunca passariam no `if`.
2. **Névoa pré-renderizada.** Era o item mais caro do céu inteiro: 2 milhões de
   pixels de degradê radial rasterizados a cada frame. Como ela só muda em ALFA
   (forma, centro e raio são constantes), passou a ser desenhada uma vez fora de
   tela e aplicada com `globalAlpha`. Idêntico por construção: num degradê de
   `rgba(cor, a)` até `rgba(cor, 0)`, o alfa em cada ponto é `a·(1−p)`;
   multiplicar por `k` dá `a·k·(1−p)`, que é o degradê de `rgba(cor, a·k)`.

O mesmo raciocínio tirou as strings `rgba(...)` montadas por estrela e por linha
(21 mil por segundo) em favor de `globalAlpha` com a cor sólida definida uma vez.

### O blur dos cards foi medido e REPROVADO

O §1.7 pede "translúcido com leve blur", e a versão com `backdrop-filter:
blur(6px)` chegou a existir. Com 50 mil lançamentos ela custou **148ms/clique**
ao navegar meses, contra **120ms** sem ela. A causa é específica desta release:
`backdrop-filter` obriga o compositor a reamostrar e desfocar o que está ATRÁS
do elemento sempre que aquilo muda — e o que está atrás agora é um céu que se
mexe a cada frame. Dezenas de cards × 60 vezes por segundo.

Ficou a translucidez (`--card-veil`), que entrega o efeito procurado (o céu lido
como contínuo por trás dos cards) e custa zero. Vale a regra aprovada pelo
Allan: **se custar FPS, o céu perde para o conteúdo**. É a lição do M3 repetida
num contexto novo.

### Bugs que só apareceram rodando o app

1. **`.tnum` perdia o `font-family` para `.font-display`** — as duas têm a mesma
   especificidade e a que vinha por último no CSS ganhava. Todo número-herói do
   app (StatCard, hero, saldos) estava saindo em Nunito **desde a v2.1**.
   Passava despercebido porque as duas famílias são legíveis; o que se perdia
   era o alinhamento tabular em coluna, justo onde ele mais importa. Achado pelo
   `audit-mono.mjs`, que mede a família COMPUTADA em vez de procurar a classe.
2. **`relative` na base do `<Button>` vencia o `absolute` do chamador** — mesma
   armadilha de ordem no CSS. O botão "Editar" de Ganhos saiu do canto do card e
   foi parar embaixo do cabeçalho, quebrando 9 testes E2E. Corrigido empilhando
   o spinner por grid, sem o botão declarar posição nenhuma.
3. **`opacity-[0.42]` vencia `opacity-0`** na ilha — ela continuava visível por
   cima dos modais. Terceira vez que a mesma classe de erro aparece: duas
   utilitárias da mesma propriedade, decidido pela ordem no CSS gerado.
4. **A linha de apoio do StatCard era prosa inteira em mono** e passou a quebrar
   em duas linhas com a Roboto (mais larga que a JetBrains), desalinhando a
   altura dos cards da fileira. Mono voltou a ser do VALOR, não da frase — que é
   o que o §12 pede.
5. **O contador do menu mudava o nome ACESSÍVEL do item** para "Gastos 3":
   qualquer navegação por nome (leitor de tela ou teste) quebrava sozinha quando
   o número aparecia. O badge virou decorativo e o significado foi para o
   `title`.
6. **`aria-hidden` na ilha recuada** apagava busca, privacidade e tema da árvore
   de acessibilidade nas páginas compridas.
7. **`mouseenter` não borbulha entre irmãos** — e o fio de 3px fica por cima da
   zona quente. Entrando pelo fio (o caminho natural, já que é a única coisa
   visível), a espiada nunca começava.

### A ilha de ações: "não cobre nada" exigiu três camadas

O screenshot é que denunciou: a reserva de padding protegia o FIM da página, mas
uma página que rola tem meio. Parada na metade da lista de orçamento, a ilha
ficava por cima de um valor.

1. **Reserva de 88px** no rodapé das páginas (com 68px o último card da Carteira
   parava a 10px da ilha a 1366×768 — descoberto, mas espremido).
2. **A ilha se recolhe** quando há conteúdo atrás dela, remedindo ao rolar, ao
   trocar de seção e quando a altura da página muda. A versão que só media no
   scroll deixava 18 casos passando: quem abre uma seção já com conteúdo ali
   nunca rolou.
3. **Some e fica inerte** com diálogo por cima.

Recuar por conteúdo NÃO mata o clique nem aplica `aria-hidden` — só o diálogo
faz isso. Um canto quente de 200×120 traz a ilha de volta antes de o cursor
chegar nela, e o foco por teclado também.

### Screenshots

`screenshots/r10-m1` (blocos + marca + mono) · `r10-m2` (céu) · `r10-m3` (menu
borda viva + ilha) · `r10-m4` (Formato A + calendário).

---

## Resumo executivo — v2.1.0 "Painel de Bordo" (20/07/2026)

**Release v2.1** = reskin visual completo ("Painel de Bordo": verde-abissal +
âmbar-fósforo + ciano gelo, Nunito + JetBrains Mono) + funcionalidades de
dinheiro/crédito. Novidades: tela **Hoje** (loop diário: anel do dia, streak,
XP), **Guardar/Resgatar** de caixinhas com transferência real no ledger,
**`<BankPicker>`** com logo em todos os formulários, tela de **Crédito** (hub dos
cartões) e **parcelamento com prévia de impacto**. Toda a lógica financeira da
v2.0 preservada. **Suíte:** 230 unit + 37 E2E + typecheck + lint + smoke, verdes;
perf 50k sem regressão (navegar 12 meses ~124ms/clique). Schema **v10**.
Diretório de trabalho oficial: `C:\dev\zent-money` (fora do OneDrive).

---

## Resumo executivo — v2.0.0 (19/07/2026)

**Zent Money** é um app de finanças pessoais de mesa (Electron + React + TypeScript
estrito), 100% local — os dados nunca saem do computador; a única conexão é a
consulta opcional das taxas oficiais. Da v2.0 fazem parte: ledger contábil com
saldo derivado, orçamento por categoria com realocação, privacidade por máscara,
bloqueio por PIN, direção de arte navy sóbria, gamificação (score/streak/
conquistas/desafio) e uma bandeja com lançamento rápido.

**Estado da suíte (v2.0.0):** 204 testes unitários + 34 E2E (jornada completa das 8
seções + M1–M5) + typecheck estrito + lint, todos verdes, com **zero erros de
console** nas duas janelas. **Smoke** verde. **Perf 50k lançamentos** (quente):
boot ~596ms, abrir seções 55–272ms, navegar 12 meses ~126ms/clique — dentro do
envelope histórico; os fundos, a gamificação e a 2ª janela **não custaram FPS**.
**Sobriedade:** varreduras anti-emoji e anti-hex limpas — o único hex fora de token
é a paleta curada de categorias (DADO que o usuário escolhe, exceção documentada).

## Fechamento v2.1.0 — auto-revisão visual + release — 20/07/2026

Milestone ⑥: loop de auto-revisão visual, qualidade final e Release.

### Loop de auto-revisão visual (§8)

Screenshots das telas novas + reskin nos 2 temas ao longo dos milestones
(`screenshots/m7-pass1` reskin · `m8-today` Hoje · `m9-charts` gráficos ·
`m10-guardar` Guardar/Resgatar · `m11-credit` e `m12-final` Crédito + finais).
**Autocrítica** e correções da passada:
1. **Hex solto em fallback de var inventada** — `var(--void,#0a140f)` (Crédito) e
   `var(--cyan-dim,#356e62)` (Hoje) usavam tokens inexistentes com fallback hex.
   Corrigidos para `color-mix` sobre tokens reais (sem hex fora de token).
2. **Colisão de nome "Crédito"** (grupo × item da sidebar) — aceita como
   redundância mínima; testes/screenshots desambiguam pelo botão do item.
3. **Tema claro**: âmbar-fósforo não passa em papel → `--primary` claro é âmbar
   queimado; validado que todos os números/acentos das telas novas leem bem nos
   dois temas (anel de Hoje, barras do Crédito, régua das Caixinhas).
Nenhuma tela ficou "tímida" a ponto de exigir refação — a direção do Conjunto 1
foi seguida (anel âmbar+ciano, mono nos números, grid de instrumento).

### Qualidade final

- **Suíte completa verde:** typecheck estrito · lint · **230 unit** · **37 E2E**
  (jornada das 9 seções + Hoje + Guardar/Resgatar + Crédito) · smoke.
- **Perf 50k** (quente): navegar 12 meses **124ms/clique** (baseline ~123 — sem
  regressão); seções 46–261ms; boot ~826ms. As telas novas (Hoje, Crédito,
  Guardar, régua) são renders estáticos baratos — **sem custo de FPS**.
- **Anti-hex/anti-emoji**: varredura limpa; o único hex fora de token segue a
  paleta curada de categorias e as marcas de banco (DADO, exceção documentada).

### Release v2.1.0

- `package.json` → **2.1.0**; `npm run dist` → `release/ZentMoney-Setup-2.1.0.exe`
  (**79 MB**). Instalador entregue na Área de Trabalho do usuário.
- Migração v9→v10 invisível (boxTransfers vazio; aportes ganham `fromBankId: null`).
- **Tag `v2.1.0` + GitHub Release** com instalador e changelog.
- **Dados reais resetados** a pedido (backup em `Desktop/zent-data-BACKUP-antes-reset.json`;
  `pin.json` preservado — o app abre limpo e pede o PIN atual).

## Redesign "Painel de Bordo" (v2.1) — milestone ① reskin base — 20/07/2026

Primeiro milestone da release v2.1: troca completa de identidade visual
(verde-abissal + âmbar-fósforo + ciano gelo, Nunito + JetBrains Mono)
**mantendo toda a lógica**. Nada de comportamento financeiro mudou.

- **Tokens reescritos por VALOR, não por nome** (`src/design/tokens.css`): o
  reskin não renomeou nenhum token, então nenhum componente/gráfico/teste
  precisou mudar. `--primary` deixou de ser azul-céu e virou âmbar `#F0BC5E`;
  `--pos` virou ciano `#6FE0C6`; `--neg` coral `#F58374`; `--warn` um âmbar
  QUEIMADO distinto do acento (para o "≥80% âmbar" do orçamento não se
  confundir com destaque). Base verde-abissal (`--bg #08120E`, painéis
  `#0E1B15/#12211A`, linhas `#1D3328`). Tema claro na mesma família clareada
  (o âmbar não passa em contraste sobre papel → `--primary` claro é âmbar
  queimado que passa; a identidade vem do matiz).
- **Fontes empacotadas localmente** (`@fontsource-variable/nunito` +
  `jetbrains-mono`): zero rede. O mono entra no `.tnum` (marcador universal de
  valor monetário) com `font-size: 0.95em` — relativo, para NÃO crescer o
  footprint dos números e disparar reflow (lição do M3). Geist aposentada.
- **Grid de instrumento** no `<Backdrop>`: `linear-gradient` + `mask-image`
  radial, estáticos e compostos pela GPU — mesma disciplina dos glows, nada de
  blur de área.
- **Marca/ícone recoloridos**: o logo já era `currentColor`, então recolore
  sozinho pelo token; `zent.svg` passou a ciano→âmbar e o `.ico` 16→256 foi
  regerado; `TITLE_BAR_BOOT` e `backgroundColor` do Electron acompanham o novo
  tema escuro. Paleta curada de categorias e cores do seed-demo sincronizadas
  com os novos `--cat-*`.

**Estado da suíte (① reskin):** typecheck estrito ✓ · lint ✓ · **204 unit** ✓ ·
**34 E2E** ✓ · **smoke** ✓ · **perf 50k**: navegar 12 meses **123ms/clique**
(baseline ~126 — sem regressão; o `0.95em` do mono manteve o footprint).
Screenshots dos 2 temas em `screenshots/m7-pass1/` (7 seções × 2).

### INCIDENTE: E2E vermelho (14/34) — causa-raiz era EMPILHAMENTO DE TOASTS, não ambiente

Durante o ①, o E2E acusou **14 falhas** — e falhava **os mesmos 14 no baseline
v2.0.0 intocado** (comprovado com `git stash` → build → run), então **não era
regressão do reskin**. Duas hipóteses de ambiente foram **levantadas e depois
refutadas por experimento**:

1. *OneDrive segurando arquivos* → **refutada**: clone limpo em `C:\dev\zent-money`
   (`npm ci` + build) reproduziu **os mesmos 14**. Não era o sincronizador.
2. *Saves famintos sob jank* (a leitura do incidente do M3) → **refutada**: as
   falhas eram **determinísticas** (sempre os mesmos 14, em dois locais, várias
   corridas), e jank produziria flutuação, não determinismo.

**Causa-raiz real:** o `toast.push` **empilhava banners de mesmo título**. O
teste 6 registra 3 gastos em sequência; cada `toast.success('Gasto registrado', …)`
vive 4500ms. Numa máquina **rápida** os 3 adds acontecem dentro dessa janela, os
banners **coexistem**, e `getByText('Gasto registrado')` casa **3 elementos** —
strict-mode do Playwright falha. Como a suíte roda numa **única janela**
(`workers:1`, `beforeAll`), a falha do teste 6 **cascateava**: a `page`
compartilhada ficava num estado quebrado e os 13 testes seguintes esperavam
seus timeouts de 30s (por isso a corrida vermelha levava 5,9min). Na máquina de
referência (mais lenta por passo) os banners expiravam entre os adds, então
lá passava — um verde **dependente de velocidade de máquina**, não de código.

**Correção (na origem, sem enfraquecer asserção):** `toast.push` agora
**coalesce por tipo+título** — um push de "Gasto registrado" substitui o anterior
(id novo, timer zerado, descrição mais recente) em vez de empilhar. Generaliza a
disciplina que o M4 já aplicava às conquistas ("um toast, mesmo com várias
medalhas") e é melhor UX (nada de pilha de banners idênticos). Resultado: **34/34
verdes em 50s** (contra 5,9min), tanto em `C:\dev` quanto valeria em qualquer
máquina — o determinismo passou a não depender da velocidade.

**Higiene mantida:** o projeto foi movido para `C:\dev\zent-money` (fora do
OneDrive) mesmo não sendo a causa — um projeto de build sincronizado é risco
conhecido (ver "Infra local" no DECISOES). `C:\dev\zent-money` é o diretório de
trabalho oficial daqui em diante.

## Crédito + parcelamento com prévia (v2.1) — milestone ⑤ — 20/07/2026

Nova seção **Crédito** (hub dos cartões) e prévia de impacto do parcelamento —
o freio consciente. Sem lógica financeira nova: reusa `cards`, `score`, o ledger.

- **Tela de Crédito** (§6): card por cartão com logo, nome, **barra de uso**
  (usado coral / livre ciano), limite total e fatura. Painel-resumo com **fatura
  total do mês** (= `totalInvoices`, o mesmo de Compromissos — sem dupla
  contagem), limite usado × disponível totais e **medidor de saúde** (o score do
  M4) com leitura ("faturas somam X% da renda — zona ..."). **Pagar fatura**
  reusa o `PayInvoiceDialog`: debita a conta e abate a fatura → `availableLimit`
  (= limite − fatura − comprometido) **sobe sozinho** (o limite volta ao cartão).
- **`engine/credit.ts`** (`installmentImpact`, `creditHealthReading`): prévia
  pura. Limite após = `availableLimit` com a compra hipotética somada; saúde
  antes→depois = o MESMO `scoreForMonth` recomputado sobre o estado hipotético
  (sem duplicar a fórmula); salário disponível = salário − compromissos atuais −
  nova parcela; 1ª/última parcela por mês.
- **Prévia no diálogo de compra parcelada** (§7): painel "o que acontece se
  confirmar" com valor/mês (n× parcela), meses, limite após, saúde antes→depois
  e salário disponível antes→depois. Parcela avulsa mantém o resumo simples.

**Estado da suíte (⑤):** typecheck ✓ · lint ✓ · **230 unit** ✓ (5 de credit:
prévia, saúde, e **pagar fatura devolve o limite** com round-trip) · **37 E2E** ✓
(novo **8b** hub de crédito; o **8** agora assere a prévia de impacto) · smoke ✓.
Screenshots em `screenshots/m11-credit/`.

## Guardar/Resgatar + BankPicker (v2.1) — milestone ④ — 20/07/2026

Schema **v10**. Movimento de dinheiro entre conta e caixinha, e o seletor de
banco com logo em todos os formulários. Nada de saldo redundante — tudo derivado.

- **Guardar/Resgatar** (§4) para caixinhas **manuais** (as vinculadas a
  investimento movimentam por aportes na Carteira — decisão documentada). É uma
  **transferência real**: `boxTransfer` (in=Guardar, out=Resgatar) debita/credita
  a conta pelo ledger e o guardado da caixinha é `manualAmount + Σin − Σout`
  (`boxStoredAmount`). A UI mostra o **fluxo** (−origem → +destino) antes de
  confirmar; conta zerada fica **desabilitada** ("sem saldo") no Guardar; não se
  resgata mais do que há guardado.
- **Aporte com conta de origem** (§5): `contribution.fromBankId` (null = aporte
  antigo, sem débito — retrocompatível). Com conta escolhida, o aporte debita a
  conta pelo ledger, como Guardar.
- **`<BankPicker>`** (§5): componente único em estilo lista com **logo real do
  banco** (assets/logos/, fallback monograma), nome e contexto (saldo/fatura);
  opção inválida desabilitada **com o motivo à mostra**. Usado em Guardar,
  Resgatar, aporte, "pago com" do gasto e "recebido em" do ganho.
- **Ledger** (`bankBalances`, `bankMovements`, `accountBalanceSeries`,
  `isLedgerLinked`) agora inclui box transfers e aportes-com-conta. Migração
  v9→v10 invisível (boxTransfers vazio; aportes ganham `fromBankId: null`).

**Estado da suíte (④):** typecheck ✓ · lint ✓ · **225 unit** ✓ (invariante
criar→excluir cobre Guardar, Resgatar e aporte-com-conta; migração v1→v10) ·
**36 E2E** ✓ (novo **22b**: Guardar/Resgatar com BankPicker, conta zerada
bloqueada, efeito líquido zero) · smoke ✓. Screenshots em `screenshots/m10-guardar/`.

## Gráficos refinados (v2.1) — milestone ③ — 20/07/2026

Elevação visual dos gráficos existentes (§3), sem lógica nova — reusam os
cálculos que já existem (`byCategory`, `monthPace`, progresso das caixinhas).

- **Espectro de gastos** (Gastos → Resumo por categoria, modo barras): cada barra
  ganhou **gradiente dim→cor da categoria** + brilho na ponta (box-shadow + tampa
  clara estática, GPU-barato — nada de blur de área, lição do M3). Mantém o toggle
  rosca/barras do M1b e o clique-para-filtrar.
- **Ritmo de queima** (Visão geral → Ritmo do mês): a média diária virou
  **número-herói âmbar com "/dia"** (`hero-num`), com a projeção de fechamento e a
  comparação com o mês anterior ao lado. Mesmo `monthPace`, só destaque visual.
- **Marcos da trajetória em RÉGUA** (Caixinhas): cada caixinha ganhou uma régua de
  progresso — linha que **preenche em gradiente âmbar→ciano** até a posição atual,
  marcos como pontos (concluídos âmbar, futuros cinza) e o ponto ciano **"você
  está aqui"**. Substitui os quadradinhos soltos; **sem a "nave"** (que nunca
  existiu no código — o "sem nave" já estava satisfeito). O anel (identidade da
  caixinha) permanece; a régua acrescenta a leitura de marcos.

**Estado da suíte (③ gráficos):** typecheck ✓ · lint ✓ · **222 unit** ✓ ·
**35 E2E** ✓ · smoke ✓ · **perf 50k**: navegar 12 meses **177ms/clique**
(elevado vs ~123 do baseline, mas dentro do envelope histórico e imperceptível;
máquina sob carga contínua da sessão). Screenshots em `screenshots/m9-charts/`.

## Tela "Hoje" (v2.1) — milestone ② loop diário — 20/07/2026

Nova seção **Hoje**, primeira da navegação e **seção inicial padrão** (é o que
faz abrir o app todo dia). Tudo DERIVADO (motores puros), nada gravado — a
disciplina do score/streak do M4.

- **`engine/today.ts`** (11 testes): anel do dia, fita da semana, streak diário,
  resumo do dia. **Limite diário auto-corretivo** (fórmula aprovada):
  `(Σ limites efetivos das categorias − gasto do mês até ontem) ÷ dias restantes`.
  Estourar antes de hoje aperta hoje; economizar folga. Reusa o limite EFETIVO
  do M1c. Sem categoria com limite → **teto diário configurável** (`dailyCapCents`
  no uiStore); sem os dois → anel sem denominador (nunca inventa teto).
- **`engine/xp.ts`** (7 testes): combustível DERIVADO (peça NOVA — o M4 não tinha
  XP). Blinda o incentivo: **hábito é por DIA ÚNICO com atividade** (nunca por
  lançamento — 1 ou 20 gastos no dia rendem o mesmo +15), com **teto mensal**; e
  os componentes de **disciplina** (mês no azul +150, limite respeitado +40,
  caixinha batida +200) **pesam mais que o hábito** no acumulado do mês. A barra
  enche por saúde financeira, não por volume de movimento.
- **UI** (`features/today/TodayPage.tsx`): anel ciano→âmbar (coral ao estourar,
  "sem bronca"), frase viva (linguagem dos balões, valores mascaráveis sob
  privacidade), fita Seg→Dom (hoje âmbar, dias com registro em ciano, futuros
  esmaecidos), ignição (7 células), combustível (barra + nível), resumo do dia,
  FAB "Lançar gasto". **Micro-recompensa**: registrar reage no anel/fita (leem o
  store) e o toast do 1º gasto do dia traz "+15 XP, sequência acesa".

**Estado da suíte (② Hoje):** typecheck ✓ · lint ✓ · **222 unit** (204 + 18) ✓ ·
**35 E2E** ✓ (novo **7b**: anel/ignição/combustível + micro-recompensa) · smoke ✓.
Screenshots em `screenshots/m8-today/` (2 temas). Default `activeView` passou a
'today' — o **E2E 1** ganhou um `goTo('Visão geral')` explícito (a entrada mudou).

## Verificação mestra — v2.0.0

Percorri o app contra os checklists de todas as releases. Cada item foi
**exercitado de fato** (teste que o prova OU condução no app), não marcado por fé.
Onde apareceu divergência, foi **corrigida antes da tag** (ver a coluna Correções).
`Un` = teste unitário · `E2E n` = número do teste E2E · `Vis` = captura/condução.

| Área (release) | Item | Prova | Status |
|---|---|---|---|
| Base | Schema v1→v9 migra e valida (Zod) | Un `migrations` | OK |
| Base | Persistência atômica + backup rotativo; export/import | `storage.ts` · E2E 23 (export) | OK |
| R2 | Fonte Geist, StatCards, dashboards da Visão geral | E2E 1, 15 · Vis | OK |
| R2 | Busca global (Ctrl+K) navega | E2E 12 | OK |
| R2 | Recorrências materializam no boot | Un `recurring` · E2E 7 | OK |
| R3 | Parcelas cartão × avulsa; regra do limite | Un `cards` · E2E 8, 9, 9b | OK |
| R3 | Drill-down do banco (rota filha) | E2E 19b, 19c | OK |
| R3 | Campos monetários: digitação natural BR/US | Un `money` · E2E 20 | OK |
| R4 | Ledger derivado: salário credita, gasto debita, ajuste/transf. fecham | Un `ledger` · E2E 22 | OK |
| R4 | Taxas ao vivo; offline mantém as antigas; override manual | Un `rates-source` · E2E 23 | OK |
| M1 | Criar→excluir devolve TODOS os números (invariante) | Un `mutations` | OK |
| M1 | Toggle rosca/barras (pref. persistida) | E2E 6b | OK |
| M1 | Orçamento 2.0: disponível, aviso de estouro, realocação | Un `budget` · E2E 6, 6c | OK |
| M2 | Privacidade por máscara: nada real no DOM | E2E 16 | OK |
| M2 | PIN: 1ª execução, hash scrypt, throttling, alterar, esqueci | E2E setup, 21 | OK |
| M2 | Seam `ZENT_NO_LOCK` inerte em produção | Un `seam` | OK |
| M3 | Fundo em camadas + geometria assinatura por seção | `Backdrop.tsx` · Vis | OK |
| M3 | Faixa preta do PIN corrigida na raiz | Vis (bloqueio 2 temas) | OK |
| M3 | Sidebar em 3 grupos; tooltip universal; gráficos | E2E 2 · Vis | OK |
| M4 | Score 0–100 (fórmula, 4 defs, exemplos 73/44) | Un `score` · E2E 23c | OK |
| M4 | Streak (azul/pausa/vermelho, virada de ano) | Un `streak` | OK |
| M4 | Conquistas idempotentes + retroativas; desafio na virada | Un `gamification` · E2E 23c | OK |
| M5 | Mini-janela <1s com MoneyInput e identidade | E2E 23d · Vis | OK |
| M5 | Bandeja não fura o bloqueio (PIN antes de exibir) | E2E 23e | OK |
| M5 | Quick reflete no mês e no saldo da origem (fonte única) | Un `quick-entry` · E2E 23d | OK |
| M6 | App na bandeja além da inatividade → reabrir exige PIN | E2E 23f | OK |

**Correções feitas durante a verificação (não anotadas e seguidas):**
- **Bandeja + inatividade:** o `setTimeout` de auto-bloqueio no renderer era
  estrangulado pelo throttling de background do Chromium com a janela oculta,
  atrasando o bloqueio. Corrigido com `backgroundThrottling: false` na janela
  principal — o timer dispara na hora mesmo na bandeja (coberto pelo E2E 23f).

Nenhum item ficou "ausente/divergente" após as correções.

---

## M5 — bandeja + lançamento rápido (roadmap v2.0) — 19/07/2026

### Mini-janela em <1s, com a identidade do app

- 2ª `BrowserWindow` frameless (380×480), **pré-criada OCULTA no boot** — abrir é
  só `show()`, instantâneo. Carrega o MESMO bundle com `#quick`; o preload expõe
  `windowKind` a partir do hash e o `main.tsx` monta `QuickEntryApp` em vez do
  `App`. Form com `MoneyInput` + categoria + descrição + origem (banco/cartão),
  cabeçalho Zent, foca o valor ao abrir, **Enter salva · Esc fecha**.
- **Atalho global `Ctrl+Shift+Z`** (`globalShortcut`) + **Tray** com menu de
  contexto (Abrir · Lançamento rápido · Sair). Fechar a janela principal
  **minimiza para a bandeja** (configurável no perfil, default ligado); "Sair"
  encerra de fato.

### O bloqueio não tem furo pela bandeja

- O `main` guarda `appLocked`, **reportado pelo renderer principal** em cada
  lock/unlock; default conservador `!bypass && hasPin()` — assume bloqueado até o
  renderer dizer o contrário. A mini, ao abrir, pergunta `quickIsLocked()`: **se
  bloqueado, exige o PIN (bolinhas compactas) antes de exibir qualquer coisa**. A
  verificação usa o **mesmo `verifyPin` do main** (throttle compartilhado) — não
  há bypass. PIN correto na mini destrava o app inteiro (uma prova de identidade
  vale para tudo). **E2E 23e** prova: app bloqueado → a mini pede o PIN, não o form.

### Uma fonte de dados (sem race entre janelas)

- A mini **não tem store própria**: ao salvar, `submitQuickExpense` vai ao main,
  que encaminha ao renderer principal, e ELE aplica `addExpense` no `dataStore`
  real (mesma persistência, mesma avaliação de conquistas). Reflete na hora no mês
  e no saldo da origem, sem duas janelas escrevendo o mesmo arquivo. A mini só
  **lê** categorias/bancos (empurrados pelo main) para os selects. **E2E 23d**
  prova: gasto pela bandeja aparece em Gastos e debita o Nubank na hora.

### Estado da suíte (M5)

- **204 unit** (201 + 3 do quick-entry: formato do payload e débito na origem) +
  typecheck estrito + lint limpos.
- **33 E2E verdes** (31 + **23d** quick-entry reflete no mês/origem + **23e** o
  bloqueio é respeitado), com o console das **duas janelas** coberto (zero erros).
- **Smoke verde** (janela em ~444ms com a 2ª janela e a bandeja no boot). **Perf
  50k** sem regressão (navegar 12 meses ~130ms/clique).

---

## M4 — gamificação sóbria (roadmap v2.0) — 18/07/2026

Schema **v9**. Score e streak são DERIVADOS (determinísticos, nunca gravados);
só conquistas e desafio persistem.

### Score de saúde financeira 0–100 (fórmula aprovada)

- `engine/score.ts`: **40%·Poupança + 30%·Categorias + 30%·Compromissos**, com os
  cortes aprovados (poupança 30% = nota cheia; compromissos ≤10% = cheia, ≥50% =
  zero). As **4 definições** fechadas com o usuário estão codificadas e testadas:
  (1) sobra negativa → s1 clampa em 0; (2) mês com movimentação mas sem renda →
  **sem score** (nunca inventa denominador); (3) sem categoria com limite → o peso
  de Categorias redistribui **proporcionalmente** (40/30 → 57,14%/42,86%),
  sinalizado no detalhamento; (4) arredondamento **único no fim** (meio pra cima),
  o mesmo número no anel, no detalhamento e na Linha do tempo (uma fonte).
- **Os exemplos batem no app**: o seed demo (renda 3.750 · sobra 61% · compromissos
  1.728) rende **73** no anel — o Exemplo A que o usuário conferiu. Unit prova 73 e
  44 (Exemplo B) e o Exemplo C ("sem score").
- **Histórico re-derivado, não snapshot**: `scoreForMonth(data, ym)` recomputa da
  base toda vez; a Linha do tempo usa a mesma fórmula para os 12 meses. O
  detalhamento confirma isso em texto. Uma **ação concreta** (`scoreAction`) aponta
  a categoria mais estourada e mede o ganho re-rodando a fórmula: "Reduza R$ X em
  [cat] → +Y pts".

### Streak, conquistas e desafio

- **Streak** (`engine/streak.ts`, DERIVADO): meses consecutivos no azul (sobra ≥ 0
  **com registro**); mês sem registro **pausa** (não conta/não quebra); vermelho
  zera; marcos 3/6/12. Uma vigência de salário que só persiste não é "registro".
  Virada de ano testada.
- **Conquistas** (`engine/achievements.ts`, 13 medalhas): 1ª caixinha 100% · 1º
  aporte · mil/5 mil/10 mil investidos · streak 3/6/12 · 1º mês score ≥80 · mês
  todas no limite · 1ª parcela quitada · 1º backup · 3 desafios cumpridos.
  **Idempotente** (reavaliar não redesbloqueia) e **retroativo EM SILÊNCIO no 1º
  boot** (migração marca `gamificationOnboarded: false`; o boot avalia sem toasts e
  liga o flag). Estante no perfil (cor = desbloqueada, silhueta+critério = bloqueada).
- **Desafio** (`engine/challenge.ts`): um ativo por vez — "máx R$ X em [cat]" ou "Y%
  menos que o mês passado". Avaliado na **virada** (mês passou → resultado ao
  histórico, tom neutro). Widget na Visão geral (barra + dias restantes). 3
  cumpridos = conquista.

### INCIDENTE: regressão de perf da gamificação (50k) — causa-raiz

- A avaliação de conquistas no boot varria os meses chamando `scoreForMonth` por
  mês, e cada chamada re-varria os **50k gastos** (`sumByMonth`/`groupByMonth`).
  Resultado: **boot 1306ms** (contra ~417ms). **Corrigido** com um `ScoreCache`
  construído UMA vez por mudança de dados e reusado por todos os meses (boot e
  navegação): **boot 539ms**, navegar 12 meses **128ms/clique** — de volta ao
  envelope. Lição da R4/M3 reaplicada: número derivado que aparece em várias telas
  precisa de uma passada memoizada, nunca N.

### INCIDENTE: toasts de conquista quebravam o E2E — causa-raiz

- A avaliação AO VIVO (subscription a cada mutação) desbloqueava conquistas em
  rajada durante a jornada do E2E, e a **pilha de toasts** cobria botões (mesmo modo
  do M3) — 6 falhas de "element not stable"/não encontrado. Além disso, o título
  "R$ 1 mil investidos" continha `R$ <dígito>` e **vazava no teste de privacidade**
  (o toast fica no DOM). **Corrigido**: avaliação ao vivo **debounced (~1s) +
  coalescida** (um toast, mesmo com várias medalhas), e conquistas renomeadas sem
  "R$ <dígito>" ("Mil investidos" etc.).

### Estado da suíte (M4)

- **201 unit** (173 + seam 5 + score 8 + streak 7 + gamificação 8) + typecheck
  estrito + lint limpos. Migração v1→**v9** coberta.
- **31 E2E verdes** (30 + o novo **23c** de gamificação: score no hero,
  detalhamento, criar desafio e estante), **zero erros de console**.
- **Smoke verde**. **Perf 50k**: boot **539ms** (quente); seções 41–333ms; navegar
  12 meses **128ms/clique** — sem regressão de FPS após o `ScoreCache`.

---

## M3 — direção de arte final (roadmap v2.0) — 18/07/2026

### Fundo em 4 camadas — `<Backdrop>` full-viewport, custo zero de FPS

- Camadas ②③④ (glows por seção · geometria assinatura · malha/vinheta) migraram
  do `#root::before` estático para um componente React `<Backdrop section>`
  (`src/design/Backdrop.tsx`), full-viewport e ciente da seção ativa. Ele **pinta
  a base ele mesmo** (não depende do `background-attachment: fixed` do body) — é a
  raiz da correção da faixa preta (abaixo).
- **Glows são `radial-gradient` estáticos**, não divs com `blur()`. A 1ª passada
  usou `blur-3xl` (raio 48px) em elementos de 900px por seção; o custo de GPU
  derrubou o FPS a ponto de o E2E lentificar ~6× (ver "incidente do jank" abaixo).
  A regra da R3 — "sem blur de área gigante" — vale e foi reencontrada.
- **Mapa de glows documentado** (canto do acento → canto oposto do azul) em
  `Backdrop.tsx`: cada seção tem uma posição distinta. **Geometria assinatura por
  seção** (line-art SVG, stroke 1px, ~4,8% — abaixo do teto de 5% do §, cortada
  pela borda): arcos concêntricos (Visão geral/bloqueio) · feixe ascendente
  (Ganhos) · trilha de recibos (Gastos) · grade de cartões (Bancos) · anel
  fragmentado (Parcelas) · curvas entrelaçadas (Carteira) · órbitas (Caixinhas) ·
  régua de traços crescentes (Linha do tempo).

### BUG da QA do M2 — faixa preta no terço inferior da tela de PIN

- **Causa-raiz:** a `LockScreen` era `fixed inset-0` transparente e dependia do
  gradiente do `body` (com `background-attachment: fixed`) para a base; o terço
  inferior ficava sem glow nem conteúdo e lia-se como uma banda morta. **Corrigido
  na raiz:** o `<Backdrop>` pinta a base full-bleed (100% da altura em qualquer
  resolução) e a composição foi **centrada opticamente (~45%, viés pra cima)** com
  **rodapé de versão** fechando a base — sem ancorar tudo no topo (ajuste pedido).
- Os 3 reparos da autocrítica do M2 entraram: arcos **descentralizados** e cortados
  pela borda (via Backdrop), **halo do logo** com mais presença (halo externo largo
  + interno), **bolinhas vazias** com mais contraste (borda 1,5px + miolo sutil).

### Sidebar redesenhada em 3 grupos

- *Dia a dia* (Visão geral·Ganhos·Gastos) · *Crédito* (Bancos·Parcelas) ·
  *Patrimônio* (Carteira·Caixinhas·Linha do tempo), com micro-rótulos em caps
  (expandida) / divisores 1px (colapsada); item ativo = pílula + **barra lateral
  2px no acento com glow**; **monograma "A" com anel** no perfil expandido, logo
  com halo no colapsado; **cluster inferior** (busca·privacidade·tema) e **rodapé
  com versão**; colapso 240ms `cubic-bezier(.22,1,.36,1)`.

### Cards/hero, gráficos e micro

- Cards/hero: fio de topo com gradiente luminoso no acento (`.card-topline`), chips
  com glow radial (`.chip-glow`), número do hero +15% (52→60px) com glow
  (`.hero-num`), hover eleva 2px/180ms; sparkline com **ponto final pulsando UMA
  vez**; empty states com **detalhe no acento** (mantido o footprint — ver incidente).
- Gráficos: linhas 2.5px com **drop-shadow 4px a 30%** e área 18→0 (desenho 600ms);
  barras topo 6px com **+15% de brilho** no grupo em hover; roscas 22px com gap 2px
  e hover +3px; **tooltip universal** (`ChartTip`: card raio 12, borda luminosa no
  topo, seta) usado no app inteiro; **legenda da rosca clicável isola a fatia**.
- Micro: transição de página fade+slide 8px com stagger 30ms; backdrop do modal
  **escurece** o app atrás (a saturação foi cortada — ver DECISOES: filtro de área
  cheia re-renderiza por frame e custa FPS).

### Persistir a última seção no restart (adição do escopo)

- `activeView` entrou no `partialize` do `uiStore` (`zent-ui`, localStorage):
  fechar e reabrir volta à seção onde eu estava, igual ao re-lock por inatividade.
  `activeYm`/`bankDetailId` seguem de sessão. **E2E 23b** prova o comportamento via
  `page.reload()` (re-boot do renderer → re-lock → reidrata a seção).

### Guarda de produção do seam `ZENT_NO_LOCK` (adição do escopo)

- O bypass da tela de bloqueio agora só vale em build **NÃO empacotado**. A decisão
  vive no MAIN (`electron/seam.ts` + `app.isPackaged`), que envia ao preload um
  booleano já resolvido via `additionalArguments` — no app instalado, `ZENT_NO_LOCK`
  no ambiente é **inerte**. **5 testes** provam a regra, incluindo o caso central:
  `resolveLockDisabled(true, '1') === false` (empacotado ignora o env var).

### LOOP OBRIGATÓRIO 2.6 — autocrítica de diretor de arte

Screenshots das 8 seções + tela de bloqueio nos 2 temas (isolados: `ZENT_USER_DATA`
temporário + `ZENT_OFFLINE=1`). **1ª passada em `screenshots/m3-pass1/`.**

**Autocrítica (o que ficou tímido/errado na 1ª passada):**
1. **Rodapé mostrava `v33.4.11`** — em dev, `app.getVersion()` devolve a versão do
   Electron. Corrigido: a versão do produto é injetada em build
   (`electron.vite.config.ts` → `__APP_VERSION__`); agora mostra `v1.0.0` (e o
   número correto no empacotado).
2. **Geometria assinatura sumia nas seções densas** a 3,8%. Subida ao limite do §
   (~4,8%, ainda < 5%) — vira assinatura de fato sem competir com os dados.
3. **Halo do logo pesava no tema claro** (azul saturado sobre papel). Suavizado
   (opacidades 0.40/0.50 → 0.32/0.42).

**2ª passada** aplicando os 3 → **`screenshots/m3-pass2/`**; capturas finais do build
enviado em **`screenshots/m3/`** (8 seções × 2 temas + bloqueio × 2 = 18). A faixa
preta do PIN some nos dois temas; o rodapé fecha a base; geometria legível porém
discreta.

### INCIDENTE: jank de fundo e perda de dados no E2E — causa-raiz

Depois da 2ª passada, a suíte E2E acusou **9 falhas** (todo teste que cria gasto ou
lê dados derivados; os que não tocam gastos passavam). Duas causas compostas, ambas
de **performance de renderização**, achadas por bissecção (baseline verde → reaplicar
em grupos):

1. **Glows com `blur-3xl` (1ª passada do Backdrop)** derrubaram o FPS; os timers dos
   toasts (`setTimeout`) atrasavam e 3 "Gasto registrado" coexistiam onde o teste
   esperava 1. **Corrigido:** glows viraram `radial-gradient` (custo desprezível).
2. **Ilustração do empty state ampliada (128→160px)** empurrava páginas além da
   altura da viewport, alternando a scrollbar e criando **oscilação de layout** — o
   Playwright via elementos "not stable", cliques/`selectOption` perdiam a corrida e
   os saves de dados (IPC com debounce) eram famintos: **categorias sumiam a meio da
   jornada**. **Corrigido:** a cena voltou ao footprint original (128×76), mantendo
   o detalhe no acento — o ganho visual sem cruzar o limiar de layout.

**A lição (registrada no DECISOES):** todo efeito de fundo do M3 tem de ser
GPU-barato (gradiente estático, não blur de área) e **não pode mudar o footprint de
componentes reutilizados** a ponto de disparar reflow — o custo não aparece na tela,
aparece como flakiness e corrida de estado no E2E. Só se descobre rodando a suíte.

### Estado da suíte (M3)

- **178 unit** (173 + 5 do seam) + **typecheck estrito** + **lint** limpos.
- **30 E2E verdes** (os 29 + o novo **23b** de persistência de seção), **zero erros
  de console**.
- **Smoke verde** (janela em ~401ms). **Perf 50k** (quente): boot **417ms**; seções
  60–343ms (as de gráfico um pouco acima pelo drop-shadow das linhas, dentro do
  envelope de 35–406ms da auditoria original); navegar 12 meses **103ms/clique**.
  Os fundos novos são `radial-gradient`/SVG estáticos — **sem regressão de FPS**.

---

## M2 — segurança (roadmap v2.0) — 18/07/2026

### §a — privacidade por máscara (substitui o blur)

- O blur de CSS deixava o valor real no DOM; agora a máscara é decidida no React
  (`design/money.tsx`, `useBRL`). Sweep de 18 arquivos: `formatBRL(x)` → `brl(x)`.
  Gráficos escondem rótulos de valor e tooltip sob privacidade. `MoneyInput`
  intocado.
- **E2E (teste 16) prova "nada real no DOM"**: com privacidade ligada, o HTML da
  Visão geral não casa `/R\$\s*\d/` (nem texto, nem aria-label); ao desligar, os
  valores voltam.

### §b — PIN de bloqueio + primeira execução

- Só o hash `scrypt` + salt no disco (`electron/pin.ts`); verificação em tempo
  constante e throttling progressivo (5 erros → 1s,2s,4s… teto 30s) no MAIN. O
  renderer nunca vê o hash. O PIN nunca é gravado/logado/testado em claro (o PIN de
  teste `1234` é descartável e isolado, jamais o do usuário).
- Boot gate: com PIN, o app nasce bloqueado; sem PIN, primeira execução
  (definir → confirmar). Auto-bloqueio ao abrir (padrão) + inatividade opcional
  (5/15/30 min). Alterar PIN e "esqueci o PIN" (fricção: digitar RESET) no perfil.
- Tela de bloqueio em nível de design M3 (fundo em camadas, logo com halo, bolinhas,
  shake, teclado clicável + físico).
- Seam de teste `ZENT_NO_LOCK=1` (perf/screenshots); o E2E **não** o usa — exercita
  o fluxo real de primeira execução/alterar PIN.

### Criptografia opcional do arquivo

- Proposta apresentada (AES-256-GCM via scrypt do PIN); **decisão do usuário:
  arquivada** — reabrir só a pedido. Detalhes em `DECISOES.md`.

### Estado da suíte (M2)

- **173 unit + typecheck estrito + lint limpos.**
- **29 E2E verdes** (os 26 da R4 + toggle + realocação + o novo **21. alterar PIN**;
  o teste **16** agora prova a máscara "nada no DOM"), **zero erros de console**. O
  `beforeAll` passou a exercitar a **primeira execução real** (definir/confirmar PIN).
- **Smoke verde** (janela em ~1,2s). **Perf 50k** (quente, com o bypass de bloqueio):
  boot **351ms**; seções 38–284ms; navegar 12 meses **105ms/clique** — dentro do
  envelope da R4. A máscara e o PIN não custam FPS (o formatador é O(1); o gate é
  uma checagem no boot).

---

## M1 — integridade pendente e Orçamento 2.0 (roadmap v2.0) — 18/07/2026

Primeiro milestone do roadmap até o v2.0.0. Schema **v8**.

### §a — invariante criar→excluir neutro, provada por sabotagem

- As mutações de todo lançamento foram concentradas em `src/store/mutations.ts`
  (fonte única); a UI e os testes chamam as MESMAS funções `add*`/`remove*`.
- `tests/unit/mutations.test.ts` (15 testes): round-trip por tipo (gasto com/sem
  origem, extra, transferência, salário, pagamento de fatura, ajuste, aporte,
  parcela de cartão/avulsa) devolvendo TODOS os números ao estado anterior +
  invariante "evento de ledger não vaza para renda/gasto" + meta-teste de
  sabotagem.
- **Prova de que o teste tem dentes** (lição do smoke da R3): sabotei
  `removeInvoicePayment` (sem devolver o valor à fatura), rodei e vi o round-trip do
  pagamento **falhar** (`invoices: 50000` ≠ `80000` esperado); revertido em seguida,
  volta ao verde. Registrado em `DECISOES.md`.

### §b — toggle rosca/barras no Resumo por categoria

- Dois botões-ícone ao lado do título (barras = padrão), preferência persistida no
  `uiStore`. A rosca reusa o `Donut` único (cores das categorias, total no centro,
  hover com valor e %).

### §c — Orçamento 2.0

- Schema **v8** (`budgetReallocations`), migração v7→v8 invisível (nasce vazia;
  coberta por `migrations.test.ts` no caminho v1→v8).
- `engine/budget.ts` (11 testes): limite efetivo = base + recebido − cedido, só no
  mês (virada volta ao base); validações (origem com limite, efetivo nunca negativo,
  sem auto-transferência); destino sem limite pode receber.
- Round-trip realocar→desfazer neutro **sem tocar o ledger** (saldos intactos).
- UI: `BudgetPanel` único (Visão geral + Gastos) com disponível/âmbar/vermelho sobre
  o limite efetivo, indicador base→efetivo, lista do mês com desfazer; modal de
  realocação com prévia; aviso pré-salvar de estouro no diálogo do gasto.

### Estado da suíte (M1)

- **173 unit verdes** (147 da R4 + 12 orçamento + 14 mutações), **typecheck estrito e
  lint limpos**.
- **28 E2E verdes** (os 26 da R4 + 2 novos: toggle rosca/barras e realocar→desfazer),
  **zero erros de console**. O único E2E afetado foi o do estouro de limite (teste 6),
  ajustado ao novo aviso pré-salvar.
- **Smoke verde**: janela em ~539ms (dados isolados, sem rede).
- **Perf 50k** (quente): boot até a Visão geral **427ms**; seções 42–273ms; navegar
  12 meses **96ms/clique**. Dentro do envelope da R4 (o painel de orçamento reusa o
  `byCategory` já memoizado e `monthBudgets` é uma passada pelas realocações). As
  camadas de fundo novas são do M3 — aqui não há custo de FPS a medir ainda.

---

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
