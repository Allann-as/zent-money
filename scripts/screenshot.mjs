// Captura screenshots do app (temas escuro e claro) via Playwright + Electron.
// Uso: node scripts/screenshot.mjs <pasta-destino> [Rótulo da seção 1] [Rótulo 2] ...
// Sem rótulos, captura apenas a view inicial (Visão geral).
import { _electron as electron } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const outDir = process.argv[2] ?? 'screenshots'
const views = process.argv.slice(3)
fs.mkdirSync(outDir, { recursive: true })

// O shell do VS Code herda ELECTRON_RUN_AS_NODE=1, que faria o Electron
// rodar como Node puro — removemos antes de lançar o app.
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({ args: ['out/main/main.js'], env })
const page = await app.firstWindow()

const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(String(err)))

await page.waitForSelector('aside', { timeout: 15000 })
await page.waitForTimeout(600)

function slug(label) {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
}

async function setTheme(theme) {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t
    localStorage.setItem(
      'zent-ui',
      JSON.stringify({ state: { theme: t, sidebarCollapsed: false }, version: 0 }),
    )
  }, theme)
  await page.waitForTimeout(300)
}

async function capture(theme) {
  await setTheme(theme)
  if (views.length === 0) {
    await page.screenshot({ path: path.join(outDir, `app-${theme}.png`) })
    return
  }
  for (const label of views) {
    await page.click(`aside >> text="${label}"`)
    await page.waitForTimeout(350)
    await page.screenshot({ path: path.join(outDir, `${slug(label)}-${theme}.png`) })
  }
}

await capture('dark')
await capture('light')
await setTheme('dark')

if (errors.length > 0) {
  console.error('ERROS DE CONSOLE DETECTADOS:')
  for (const e of errors) console.error(' -', e)
  await app.close()
  process.exit(1)
}

await app.close()
console.log(`Screenshots salvos em ${outDir}/`)
