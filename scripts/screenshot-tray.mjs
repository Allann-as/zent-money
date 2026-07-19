// Captura a MINI-JANELA da bandeja (M5) nos dois temas.
// Uso: node scripts/screenshot-tray.mjs <pasta-destino>
// Dados isolados (ZENT_USER_DATA temporário) + ZENT_OFFLINE=1; ZENT_NO_LOCK=1
// deixa o app desbloqueado para a mini abrir direto no formulário.
import { _electron as electron } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const outDir = process.argv[2] ?? 'screenshots'
fs.mkdirSync(outDir, { recursive: true })

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-shot-tray-'))
execFileSync(process.execPath, ['scripts/seed-demo.mjs', userData], { stdio: 'ignore' })

const env = { ...process.env, ZENT_USER_DATA: userData, ZENT_OFFLINE: '1', ZENT_NO_LOCK: '1' }
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({ args: ['out/main/main.js'], env })

async function windowByHash(quick) {
  for (let i = 0; i < 80; i++) {
    for (const w of app.windows()) {
      const isQuick = w.url().includes('#quick')
      if (isQuick === quick) return w
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`janela (${quick ? 'quick' : 'main'}) não encontrada`)
}

const main = await windowByHash(false)
await main.waitForSelector('aside', { timeout: 15000 })
await main.evaluate(() => window.zent.showQuickEntry())
const mini = await windowByHash(true)
await mini.getByRole('textbox', { name: 'Valor do gasto rápido' }).waitFor({ timeout: 10000 })

for (const theme of ['dark', 'light']) {
  await mini.evaluate((t) => {
    document.documentElement.dataset.theme = t
  }, theme)
  await mini.waitForTimeout(300)
  await mini.screenshot({ path: path.join(outDir, `bandeja-${theme}.png`) })
}

await app.close()
fs.rmSync(userData, { recursive: true, force: true })
console.log(`Mini-janela salva em ${outDir}/ (bandeja-dark.png, bandeja-light.png)`)
