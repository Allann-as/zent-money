# Zent Money

Painel de comando pessoal de finanças — bancos, cartões, parcelas, carteira de investimentos e
metas em um só lugar.

**Privacidade:** seus dados nunca saem do seu computador. A **única** conexão de rede do app é
a consulta das taxas oficiais (Selic, CDI e IPCA) — dois `GET` públicos, sem chave e sem enviar
um byte seu, na [BrasilAPI](https://brasilapi.com.br/api/taxas/v1) com fallback no
[SGS do Banco Central](https://api.bcb.gov.br). Ela é **opcional**: o menu de perfil tem um
toggle "Atualização automática de taxas", e com ele desligado (ou sem internet) o app funciona
inteiro, mantendo as últimas taxas conhecidas com a data delas.

**Seções:** Visão geral · Ganhos · Gastos · Bancos & Cartões (com página por banco) · Parcelas
(de cartão e avulsas) · Carteira · Caixinhas · Linha do tempo. **Extras:** busca global (Ctrl+K),
lançamentos recorrentes, alerta de limite por categoria, balões de resumo inteligente, modo
privacidade.

## Requisitos de desenvolvimento

- **Node.js 20–24** (fixado em `engines`; desenvolvido com Node 24) e npm
- Windows (o instalador é gerado para Windows x64)

## Retomar em outra máquina

O código vive no GitHub privado **[Allann-as/zent-money](https://github.com/Allann-as/zent-money)**.
O instalador **não** entra no git — cada versão é publicada como asset de uma
[GitHub Release](https://github.com/Allann-as/zent-money/releases).

```powershell
# 1. clonar (fora de pasta sincronizada, se possível — ver aviso do OneDrive abaixo)
gh repo clone Allann-as/zent-money
cd zent-money

# 2. recriar as junctions de build (se estiver dentro do OneDrive) e instalar
New-Item -ItemType Junction node_modules -Target "$env:LOCALAPPDATA\ZentMoneyBuild\node_modules"
New-Item -ItemType Junction out          -Target "$env:LOCALAPPDATA\ZentMoneyBuild\out"
New-Item -ItemType Junction release      -Target "$env:LOCALAPPDATA\ZentMoneyBuild\release"
npm install

# 3. rodar em desenvolvimento, ou gerar o instalador
npm run dev
npm run dist        # instalador em release/

# 4. só usar o app? baixe o .exe da Release mais recente:
gh release download --repo Allann-as/zent-money --pattern "*.exe"
```

Os seus **dados** ficam em `%APPDATA%/zent-money/` (não no repositório) — para levá-los
junto, use Exportar/Importar no menu de perfil.

## ⚠️ Projeto dentro do OneDrive

Esta pasta é sincronizada pelo OneDrive. Para evitar corrupção de builds (ver AUDITORIA.md),
`node_modules/`, `out/` e `release/` são **junctions** para `%LOCALAPPDATA%\ZentMoneyBuild\`.
Se clonar o projeto em outra máquina, recrie-as (ou trabalhe fora de pasta sincronizada):

```powershell
New-Item -ItemType Junction node_modules -Target "$env:LOCALAPPDATA\ZentMoneyBuild\node_modules"
New-Item -ItemType Junction out          -Target "$env:LOCALAPPDATA\ZentMoneyBuild\out"
New-Item -ItemType Junction release      -Target "$env:LOCALAPPDATA\ZentMoneyBuild\release"
```

**Nunca execute o instalador com o diretório de trabalho dentro do projeto** — teste
instalações a partir de %TEMP%.

## Comandos

```bash
npm install          # instala as dependências
npm run dev          # abre o app em modo desenvolvimento (HMR)
npm run typecheck    # TypeScript estrito, zero any
npm run lint         # ESLint
npm test             # testes unitários do motor financeiro (Vitest)
npm run test:e2e     # teste ponta a ponta (Playwright dirigindo o Electron real)
npm run dist         # gera o instalador .exe em release/
```

## Gerar o instalador `.exe`

```bash
node scripts/gen-icon.mjs   # (re)gera assets/icon/zent.ico a partir do SVG
npm run dist
```

O instalador sai em `release/ZentMoney-Setup-<versão>.exe`, com ícone do Zent Money,
atalho na área de trabalho e no menu Iniciar.

## Logos dos bancos

O app detecta automaticamente logos colocados na pasta `assets/logos/`:

- **Em desenvolvimento:** `<projeto>/assets/logos/`
- **App instalado:** `<pasta de instalação>/resources/assets/logos/`

O nome do arquivo deve ser o nome do banco em minúsculas, sem acentos nem espaços —
`nubank.svg`, `itau.png`, `bradesco.svg`, `santander.png`, `btgbanking.svg` (SVG, PNG, JPG ou WEBP).
Os logos que acompanham o app são gerados por `node scripts/gen-bank-logos.mjs` a partir dos
vetores oficiais em `assets/logos-src/` (recorta o símbolo do lockup — wordmark some, que a 34px
seria ilegível).
Sem arquivo, o app usa um monograma com a cor oficial da marca. A pasta é monitorada:
adicionou um logo com o app aberto, ele aparece na hora.

## Dados e backups

- Os dados vivem em um único arquivo `zent-data.json` no diretório de dados do app
  (`%APPDATA%/zent-money/`), com **escrita atômica** e campo `version` com migrações.
- **Backup automático rotativo**: uma cópia por dia de uso em `%APPDATA%/zent-money/backups/`
  (mantém as 10 mais recentes).
- **Exportar/Importar** manual: menu de perfil (clique no seu nome na sidebar).
  O app lembra você de exportar se passar 45 dias.

## Arquitetura

| Camada | Pasta | Descrição |
|---|---|---|
| Main (Electron) | `electron/` | janela, persistência atômica, backups, logos, IPC |
| Motor financeiro | `src/engine/` | puro, sem IO — datas até 2100, juros compostos, regra de limite, recorrências |
| Design system | `src/design/` | tokens (2 temas), componentes, gráficos SVG próprios |
| Features | `src/features/` | uma pasta por seção do app |
| Testes | `tests/` | unit (Vitest) + E2E (Playwright) |

Decisões de produto/técnica: [DECISOES.md](DECISOES.md) · Auditoria de qualidade: [AUDITORIA.md](AUDITORIA.md)

## Manutenção — como pedir e fazer mudanças

O projeto é mantido em **milestones curtos**, um de cada vez, com um ciclo fixo que
manteve a suíte verde do M0 ao v2.0.0. Para evoluir o app:

1. **Ler o contexto primeiro.** Toda mudança começa lendo três arquivos:
   [`ROADMAP.md`](ROADMAP.md) (o plano mestre e as regras de trabalho),
   [`AUDITORIA.md`](AUDITORIA.md) (o que existe, como foi verificado, os incidentes
   e suas causas-raiz) e [`DECISOES.md`](DECISOES.md) (por que cada eixo livre foi
   resolvido assim — e a **lista de reprovados**, que não devem voltar sem pedido).
2. **Plano em ≤15 linhas → aguardar o OK.** Nada é implementado antes de um plano
   curto e do aval. Onde houver fórmula/decisão de produto, ela vem no plano com
   exemplos numéricos para aprovar.
3. **Executar → suíte COMPLETA verde.** `npm run typecheck && npm run lint &&
   npm test && npm run build && npm run test:e2e && npm run test:smoke`, e para
   mudanças de peso, `node scripts/perf-test.mjs` (50k lançamentos, sem regressão
   de FPS). Testes e scripts jamais tocam dados reais nem a rede (`ZENT_USER_DATA`
   temporário + `ZENT_OFFLINE=1`).
4. **Atualizar `AUDITORIA.md`/`DECISOES.md`** — o que mudou, como foi verificado e o
   porquê das decisões. A auditoria é honesta: se algo diverge, corrige antes de
   fechar, não anota e segue.
5. **Commit + push** (Conventional Commits em português).
6. **Release de app:** `npm run dist` gera o instalador NSIS; publique com
   `gh release create vX.Y.Z release/ZentMoney-Setup-*.exe` + changelog curto. O
   instalador **nunca** entra no git (vai como asset da Release).

**Onde cada coisa mora:** motor puro em `src/engine/` (datas, dinheiro, ledger,
orçamento, score, streak, conquistas, desafio) — é onde vivem as regras e os
testes; UI por seção em `src/features/`; design system em `src/design/`; janela,
bandeja, IPC e persistência em `electron/`; schema + migrações em `src/data/`.
Disciplina inegociável: navy + um acento, zero emoji, zero cor fora de token,
`prefers-reduced-motion` respeitado, e o PIN do dono nunca em arquivo/log/teste.
