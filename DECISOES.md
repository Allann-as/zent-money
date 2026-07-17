# DECISOES.md — Zent Money

Registro das decisões tomadas onde a especificação deixou eixos livres.

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
