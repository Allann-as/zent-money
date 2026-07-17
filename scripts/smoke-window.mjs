/**
 * Smoke test: A JANELA APARECE? (R3)
 *
 * Por que existe: a R3 quase saiu com o app subindo sem nunca mostrar a janela
 * (`titleBarOverlay` impede `ready-to-show` de disparar no Windows). A suíte E2E
 * inteira passou mesmo assim — o Playwright fala com o app via CDP, e
 * `firstWindow()`/`capturePage()`/cliques funcionam com a janela OCULTA. Nenhum
 * teste que passe pelo Playwright pode provar que o usuário vê alguma coisa.
 *
 * Este script lança o app como o usuário lança (processo solto, sem depuração
 * anexada) e pergunta ao WINDOWS se existe uma janela de topo — a única prova real.
 *
 * Uso: node scripts/smoke-window.mjs [caminho-do-exe]
 *      sem argumento, testa o build local (out/main/main.js).
 */
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const TIMEOUT_MS = 20_000
const POLL_MS = 500

const exeArg = process.argv[2]
const usingLocalBuild = exeArg === undefined

// O shell do VS Code exporta ELECTRON_RUN_AS_NODE=1, que faria o Electron rodar
// como Node puro — sem janela, e o teste acusaria uma falha que não existe.
const env = { ...process.env }
delete env['ELECTRON_RUN_AS_NODE']

/**
 * ISOLAMENTO (R4). "Lançar como o usuário lança" vale para o PROCESSO — solto,
 * sem depuração anexada, que é o que dá valor a este teste. Não vale para os
 * DADOS nem para a REDE: sem estas duas linhas o smoke abria o app contra o
 * `zent-data.json` real, migrava-o e ainda consultava as taxas na internet.
 * Foi o que aconteceu de fato na R4 — sem perda, porque o arquivo estava vazio,
 * mas a regra da R2 ("teste nenhum toca dados reais") já existia justamente
 * para isso. Uma janela aparecer não depende de quais dados ela mostra.
 */
const smokeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-smoke-'))
env['ZENT_USER_DATA'] = smokeDataDir
env['ZENT_OFFLINE'] = '1'

function cleanupDataDir() {
  fs.rmSync(smokeDataDir, { recursive: true, force: true })
}

const command = usingLocalBuild
  ? path.resolve('node_modules/electron/dist/electron.exe')
  : exeArg
const args = usingLocalBuild ? ['out/main/main.js'] : []

console.log(`Lançando: ${command} ${args.join(' ')}`)
const child = spawn(command, args, { env, detached: false, stdio: 'ignore' })

/** Nome do processo a inspecionar (sem .exe). */
const procName = path.basename(command).replace(/\.exe$/i, '')

/**
 * Pergunta ao Windows se o PROCESSO do app tem janela de topo.
 * Filtra por nome de processo, nunca por título: o título do VS Code contém
 * "Zent Money" (é o nome da pasta do projeto) e daria um falso positivo.
 */
function windowTitle() {
  const ps = `Get-Process -Name '${procName}' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 -ExpandProperty MainWindowTitle`
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      encoding: 'utf8',
    }).trim()
  } catch {
    return ''
  }
}

const started = Date.now()
let title = ''
while (Date.now() - started < TIMEOUT_MS) {
  title = windowTitle()
  if (title !== '') break
  await new Promise((r) => setTimeout(r, POLL_MS))
}

const elapsed = Date.now() - started
try {
  process.kill(child.pid)
} catch {
  // já morreu
}
// Electron deixa processos filhos (GPU/renderer); limpa pelo nome
try {
  execFileSync('taskkill', ['/F', '/IM', usingLocalBuild ? 'electron.exe' : path.basename(command)], {
    stdio: 'ignore',
  })
} catch {
  // nada a matar
}

cleanupDataDir()

if (title === '') {
  console.error(`FALHOU: nenhuma janela em ${TIMEOUT_MS}ms — o app subiu sem aparecer.`)
  process.exit(1)
}
console.log(`OK: janela "${title}" apareceu em ${elapsed}ms (dados isolados, sem rede).`)
