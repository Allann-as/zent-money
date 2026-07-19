// Captura a ESTANTE DE CONQUISTAS (M4) nos dois temas, uma instância FRESCA por
// tema (estado limpo — a estante vive dentro do menu de perfil e sobrepor temas
// numa sessão só deixava modais abertos).
// Uso: node scripts/screenshot-shelf.mjs <pasta-destino>
import { _electron as electron } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const outDir = process.argv[2] ?? 'screenshots'
fs.mkdirSync(outDir, { recursive: true })

for (const theme of ['dark', 'light']) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-shelf-'))
  execFileSync(process.execPath, ['scripts/seed-demo.mjs', userData], { stdio: 'ignore' })
  const env = { ...process.env, ZENT_USER_DATA: userData, ZENT_OFFLINE: '1', ZENT_NO_LOCK: '1' }
  delete env.ELECTRON_RUN_AS_NODE

  const app = await electron.launch({ args: ['out/main/main.js'], env })
  let page
  for (let i = 0; i < 80 && !page; i++) {
    for (const w of app.windows()) if (!w.url().includes('#quick')) page = w
    if (!page) await new Promise((r) => setTimeout(r, 100))
  }
  await page.waitForSelector('aside', { timeout: 15000 })
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t
  }, theme)
  await page.waitForTimeout(250)
  await page.getByText(/^Olá, /).click()
  await page.waitForTimeout(250)
  await page.getByRole('button', { name: /^Conquistas/ }).click()
  await page.getByRole('dialog', { name: 'Conquistas' }).waitFor({ timeout: 8000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(outDir, `conquistas-${theme}.png`) })

  await app.close()
  fs.rmSync(userData, { recursive: true, force: true })
}
console.log(`Estante salva em ${outDir}/ (conquistas-dark.png, conquistas-light.png)`)
