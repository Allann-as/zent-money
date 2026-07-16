# DECISOES.md — Zent Money

Registro das decisões tomadas onde a especificação deixou eixos livres.

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
- **Sparkline do hero de patrimônio**: evolução do investido nos últimos 12 meses somada ao
  saldo em conta atual. Contas bancárias não têm histórico (saldo é editável livremente),
  então o traço reflete a única série histórica real — a dos investimentos.
- Salário: histórico de vigências (`startYm`); editar cria/atualiza a vigência do mês
  corrente em diante e meses passados exibem o salário da época, como pede a spec.
- Taxas de referência iniciais (16/07/2026): Selic 14,25% a.a. · CDI 14,15% a.a. ·
  IPCA 4,64% (12m). Alerta discreto após 45 dias sem atualização.
- Lembrete de backup: toast no boot se passar de 45 dias sem exportação manual
  (base: data da última exportação, ou data de criação do arquivo).
- A navegação de mês (‹ ›) é **compartilhada** entre as seções (um único mês ativo
  global) — mudar o mês em Gastos e ir para Visão geral mantém o contexto.
