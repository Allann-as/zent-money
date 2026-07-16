# AUDITORIA.md — Zent Money

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

## 6. Comandos de reprodução

```bash
npm run typecheck && npm run lint   # estático
npm test                            # 88 testes unitários
npm run build && npm run test:e2e   # 24 testes E2E no Electron real
node scripts/perf-test.mjs          # performance 50k + migração v1→v2 real
npm run dist                        # instalador em release/
```
