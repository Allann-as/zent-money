# ZENT MONEY — Release 2: Refinamento Profissional

> Cole este arquivo na raiz do projeto e instrua o Claude Code:
> **"Leia PROMPT-ZENT-MONEY-V2.md por completo e execute a partir da seção 9 (Ordem de execução)."**
> O app da Release 1 já existe neste repositório — esta release é um passe de refinamento, correção e elevação de nível. Nada de recomeçar do zero: evoluir o que existe.

---

## 1. Objetivo desta release

Transformar o Zent Money de "app bonito" em **produto sério de nível profissional** — sobriedade de private bank, não vitrine de startup. Três frentes: (a) corrigir o instalador quebrado, (b) disciplina visual rígida (menos cores, zero emojis, mais dashboards), (c) polimento de movimento e identidade.

Referência visual permanece o print estilo "Settei" já compartilhado (dashboard navy, sidebar escura, cards com chip de ícone, balões de resumo). **Vou anexar as imagens de referência e os logos dos bancos nesta conversa — use-as.**

## 2. PRIMEIRO: diagnóstico do instalador (bloqueante)

O build do instalador falhou e o `package.json` apareceu marcado em vermelho no VS Code. Antes de qualquer trabalho visual:

1. Valide o `package.json` (vermelho no VS Code geralmente = JSON inválido: vírgula sobrando, chave duplicada, encoding, ou conflito de merge). Rode um parse estrito e corrija.
2. `rm -rf node_modules` + reinstalação limpa com lockfile; fixe a versão do Node em `engines` e documente-a no README.
3. Revise a configuração do empacotador (electron-builder/NSIS ou equivalente): `appId`, caminhos do ícone (formatos corretos: `.ico` para Windows com múltiplos tamanhos), `files`/`extraResources` incluindo `assets/`, scripts de build.
4. Gere o instalador, instale numa pasta limpa, abra o app instalado e confirme que os dados persistem no diretório de usuário (não no diretório de instalação).
5. Registre a causa-raiz e a correção em `AUDITORIA.md`. Só então avance para o refinamento visual.

## 3. Disciplina de cor — sobriedade acima de tudo

A paleta navy continua, mas com **regra dura de contenção**:

- **Neutros**: a interface inteira vive numa escala de azul-marinho (fundo, painéis, bordas, texto principal e secundário) — tokens já existentes, refinados se necessário.
- **Um único acento**: o azul-céu primário, reservado para ações (botões, links, item ativo, foco) e para a linha/série principal dos gráficos.
- **Semânticas com uso restrito**: verde e vermelho **somente em valores monetários e variações** (positivo/negativo, dentro dos balões de resumo e nos pares entradas×saídas). Âmbar apenas em alertas reais.
- **Multicolor SOMENTE no gráfico de rosca de gastos mensais** (análise por categoria). Ali, use uma paleta categórica **curada e dessaturada** (8–10 tons sóbrios que conversem com o navy — nada neon), e as cores das categorias criadas pelo usuário saem dessa paleta.
- Remova o violeta dos chips de ícone: chips agora em **azul-céu translúcido (~10%) com ícone azul-céu**, ou neutro. Um acento só.
- Logos dos bancos são a única outra exceção de cor (são marcas).
- Auditoria final: varra o código atrás de qualquer cor fora dos tokens e elimine.

## 4. Varredura de emojis → SVG (zero emojis no produto)

- **Proibido emoji em qualquer lugar**: caixinhas, toasts, empty states, botões, títulos, placeholders, celebração de meta, LEIA-ME de interface. Faça uma varredura por regex de emoji no código inteiro e substitua tudo.
- Substituto: **conjunto único de ícones SVG de traço fino** (estilo consistente, 1.5–2px de stroke, cantos arredondados), com cor via `currentColor`/tokens — **legíveis nos dois temas**. Use uma biblioteca consistente (ex.: Lucide) ou desenhe próprios; nunca misture estilos.
- **Caixinhas**: o campo de emoji vira um **seletor de ícones SVG** temático-financeiro (escudo/reserva, avião/viagem, carro, casa, anel, presente, diploma, cofre...), renderizados no chip padrão do app.
- Celebração de meta batida: sem confete infantil — um brilho sutil no anel de progresso + toast sóbrio.

## 5. Tipografia e movimento

- **Fonte premium com cara de financeiro**: escolha UMA família principal entre **Geist**, **Instrument Sans** ou **Schibsted Grotesk** (empacotada localmente, pesos 400–700) — critério: excelente em números, séria, moderna, sem parecer genérica. Numerais tabulares obrigatórios em qualquer valor. Justifique a escolha em `DECISOES.md` com um comparativo curto.
- Hierarquia mais editorial: títulos de seção menores e mais confiantes (não gritados), rótulos em caps pequenas com tracking, números grandes como protagonistas.
- **Movimento — tirar o app do estático, com custo quase zero** (apenas `transform`/`opacity`, GPU-friendly, respeitando `prefers-reduced-motion`):
  - Transição de página com fade+slide sutil (150–200ms) e leve stagger nos cards;
  - **Count-up** nos números do hero e dos cards de estatística ao entrar na tela (400–600ms, easing suave);
  - Sidebar: colapso com easing `cubic-bezier(0.22, 1, 0.36, 1)`, rótulos com fade encadeado;
  - Hover: elevação sutil de cards, barras de gráfico com transição de opacidade;
  - Gráficos: desenho animado na primeira renderização (linha "escreve", barras sobem).

## 6. Sidebar, identidade e logos

- **Sidebar hambúrguer**: apenas o ícone hambúrguer no topo controla o colapso. **Remova o texto "recolher menu"** e qualquer rótulo do gênero. Colapsada: só ícones com tooltip; expandida: ícone + rótulo; item ativo em pílula discreta no acento.
- **Nova logo (a atual foi reprovada)**: crie uma marca mais forte e funcional — direção: um **"Z" construído por três traços horizontais em degrau ascendente** (o Z que também lê como gráfico subindo/candlestick abstrato). Requisitos: monocromática por natureza (funciona em navy sobre claro e em gelo sobre escuro), legível de 16px (favicon) a 256px, geometria limpa sem gradientes espalhafatosos. Entregue variações: símbolo, símbolo+wordmark "Zent Money", e versão para o ícone do app.
- **Novo ícone do app**: quadrado de cantos arredondados em navy profundo com o símbolo "Z" em azul-céu, leve gradiente vertical no fundo (escuro→mais escuro) e um traço de luz sutil no topo — forte, sério, reconhecível na barra de tarefas. Gerar `.ico` multi-tamanho (16/24/32/48/64/128/256) e aplicar no app, no instalador e no atalho.
- **Logos dos bancos (serão colados por mim na conversa/pasta)**: coloque cada imagem em `assets/logos/` com nome normalizado e **use nos devidos lugares**: cards de banco, chips de filtro da Carteira, itens da seção Parcelas e select de banco nos formulários. Regras de aplicação: container circular/quadrado com padding consistente, fundo neutro claro atrás de logos escuros (e vice-versa) para contraste nos dois temas, tamanho padronizado por contexto. Fallback monograma permanece para bancos sem arquivo.

## 7. Visão geral: mais dashboards (sem poluir)

Expandir a Visão geral para uma grade de dashboards de densidade profissional — cada widget responde uma pergunta:

1. **Hero de patrimônio** (mantém) com count-up e sparkline;
2. Cards de estatística: Entrou · Saiu · Sobra (% da renda) · Compromissos;
3. **Balão de resumo inteligente** (mantém, tom sóbrio);
4. **Rosca de gastos por categoria** (única área multicolor);
5. Orçamento por categoria (barras vs. limite);
6. Entradas × saídas 12 meses;
7. **NOVO — Ritmo do mês**: gasto médio diário e projeção de fechamento ("no ritmo atual, o mês fecha em R$ 1.630 — R$ 210 acima do mês passado");
8. **NOVO — Taxa de poupança**: % da renda que sobrou, mês a mês (mini-barras 6m);
9. **NOVO — Mapa de calor de gastos**: calendário do mês com intensidade por dia de gasto (tons do próprio navy→acento, sem cores novas);
10. **NOVO — Evolução do patrimônio 12m** (linha, mini).

Widgets em grid responsivo com hierarquia clara; nada de scroll infinito de cards iguais.

## 8. Complementos úteis — efeito UAU com custo mínimo

Implementar (todos leves, sem dependências pesadas):

- **Modo privacidade**: ícone de olho no topo que **borra/oculta todos os valores monetários** com um clique (para usar o app com alguém olhando) — assinatura de app financeiro sério; estado persistido.
- **Paleta de comandos (Ctrl+K)**: busca global e ações rápidas ("novo gasto", "ir para Carteira", "alternar tema", buscar lançamento por texto).
- **Atalhos de teclado** documentados num overlay (tecla `?`).
- Clique em qualquer valor monetário → copia para a área de transferência (toast discreto).
- Tooltips ricos e consistentes em todos os gráficos (mês, valor, variação %).
- Sugestões adicionais que você julgar dignas: proponha no plano, com custo estimado, para eu aprovar. **Critério de corte: não elevar consumo de memória/CPU de forma perceptível e não fugir do objetivo (clareza financeira pessoal).**

## 9. Ordem de execução

1. **§2 primeiro** — instalador funcionando e causa-raiz documentada.
2. Plano curto desta release: tokens revisados, fonte escolhida, wireframe da nova Visão geral, lista de widgets/wow aprováveis. Aguarde meu OK.
3. Execução em milestones: ① cor/tipografia/tokens + varredura de emojis → ② sidebar/movimento/logo/ícone → ③ dashboards novos → ④ complementos UAU → ⑤ logos dos bancos aplicados → ⑥ reempacotar `.exe`.
4. Ao fim de cada milestone: testes rodando + screenshots nos **dois temas**.
5. **Revisão final obrigatória**: reler esta especificação item a item contra o produto, rodar a suíte completa (unit + E2E + auditoria estrutural), atualizar `AUDITORIA.md` e `DECISOES.md`, gerar o instalador e validar a instalação limpa.

## 10. Checklist de aceite da Release 2

- [x] Instalador `.exe` gera, instala e abre sem erros; causa-raiz do bug documentada
- [x] `package.json` válido, lockfile consistente, versão do Node fixada
- [x] Zero emojis no produto (varredura por regex comprova); ícones SVG únicos e consistentes, legíveis nos dois temas
- [x] Disciplina de cor: neutros navy + 1 acento + semânticas restritas; multicolor apenas na rosca de gastos; nenhuma cor fora de token
- [x] Fonte premium única empacotada, numerais tabulares, hierarquia editorial
- [x] Sidebar hambúrguer sem texto "recolher menu"; animações suaves (colapso, páginas, count-up, gráficos) respeitando reduced-motion
- [x] Nova logo (símbolo + wordmark) e novo ícone `.ico` multi-tamanho aplicados em app, instalador e atalho
- [x] Logos dos bancos posicionados em todos os contextos com contraste garantido nos dois temas; fallback intacto
- [x] Visão geral com os 4 novos dashboards (ritmo do mês, taxa de poupança, mapa de calor, patrimônio 12m)
- [x] Modo privacidade, Ctrl+K, atalhos com overlay `?` e copiar-valor funcionando
- [x] Suíte completa verde; screenshots dos dois temas entregues; consumo de memória/CPU sem regressão perceptível
