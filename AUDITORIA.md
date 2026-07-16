# AUDITORIA.md — Zent Money

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

## 6. Comandos de reprodução

```bash
npm run typecheck && npm run lint   # estático
npm test                            # 66 testes unitários
npm run build && npm run test:e2e   # 16 testes E2E no Electron real
node scripts/perf-test.mjs          # performance 50k + migração v1→v2 real
npm run dist                        # instalador em release/
```
