# Zent Money

Painel de comando pessoal de finanças — bancos, cartões, parcelas, carteira de investimentos e
metas em um só lugar. **100% offline**: nenhum dado sai do seu computador.

**Seções:** Visão geral · Ganhos · Gastos · Bancos & Cartões (com página por banco) · Parcelas
(de cartão e avulsas) · Carteira · Caixinhas · Linha do tempo. **Extras:** busca global (Ctrl+K),
lançamentos recorrentes, alerta de limite por categoria, balões de resumo inteligente, modo
privacidade.

## Requisitos de desenvolvimento

- **Node.js 20–24** (fixado em `engines`; desenvolvido com Node 24) e npm
- Windows (o instalador é gerado para Windows x64)

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
