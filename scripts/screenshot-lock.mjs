// Captura a TELA DE BLOQUEIO / primeira execução (M2 §b / M3) nos dois temas.
// Ela NÃO pode usar o bypass ZENT_NO_LOCK — o objetivo é justamente vê-la.
// Uso: node scripts/screenshot-lock.mjs <pasta-destino>
//
// Dados isolados (ZENT_USER_DATA temporário, removido ao fim) + ZENT_OFFLINE=1.
// Sem PIN definido, o app nasce em "Bem-vindo ao Zent Money" (definir PIN).
import { _electron as electron } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const outDir = process.argv[2] ?? 'screenshots'
fs.mkdirSync(outDir, { recursive: true })

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-shot-lock-'))
const env = { ...process.env, ZENT_USER_DATA: userData, ZENT_OFFLINE: '1' }
delete env.ELECTRON_RUN_AS_NODE
delete env.ZENT_NO_LOCK // garantia: a tela de bloqueio precisa aparecer

const app = await electron.launch({ args: ['out/main/main.js'], env })
const page = await app.firstWindow()

const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.getByRole('heading', { name: 'Bem-vindo ao Zent Money' }).waitFor({ timeout: 20000 })

async function setTheme(theme) {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t
  }, theme)
  await page.waitForTimeout(300)
}

for (const theme of ['dark', 'light']) {
  await setTheme(theme)
  await page.screenshot({ path: path.join(outDir, `bloqueio-${theme}.png`) })
}
await setTheme('dark')

await app.close()
fs.rmSync(userData, { recursive: true, force: true })

if (errors.length > 0) {
  console.error('ERROS DE CONSOLE NA TELA DE BLOQUEIO:')
  for (const e of errors) console.error(' -', e)
  process.exit(1)
}
console.log(`Tela de bloqueio salva em ${outDir}/ (bloqueio-dark.png, bloqueio-light.png)`)
