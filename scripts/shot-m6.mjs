// Capturas do milestone ⑥ (R10): a linha do tempo como painel dos anos.
// Uso: node scripts/shot-m6.mjs [pasta-destino]
//
// Roda sobre o dataset demo (`seed-demo`), que tem 12+ meses de histórico — é o
// único jeito de ver a área contínua atravessar o zero de verdade.
import { _electron as electron } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const outDir = process.argv[2] ?? 'screenshots/r10-m6'
fs.mkdirSync(outDir, { recursive: true })

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-shot-'))
// seed-demo recebe a pasta como argumento (grava zent-data.json v8; a migração
// o leva a v11 no boot).
execFileSync(process.execPath, ['scripts/seed-demo.mjs', userData], { stdio: 'inherit' })

const env = { ...process.env, ZENT_NO_LOCK: '1', ZENT_OFFLINE: '1', ZENT_USER_DATA: userData }
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({ args: ['out/main/main.js'], env })
const page = await app.firstWindow()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.waitForSelector('aside', { timeout: 15000 })
await page.waitForTimeout(700)

async function setTheme(theme) {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t
    localStorage.setItem('zent-ui', JSON.stringify({ state: { theme: t, sidebarCollapsed: false }, version: 0 }))
  }, theme)
  await page.waitForTimeout(400)
}

async function scrollTo(y) {
  await page.evaluate((top) => {
    for (const el of document.querySelectorAll('*')) {
      if (el.scrollHeight > el.clientHeight + 40) el.scrollTop = top
    }
  }, y)
  await page.waitForTimeout(350)
}

for (const theme of ['dark', 'light']) {
  await setTheme(theme)
  await page.click('aside >> text="Linha do tempo"')
  await page.waitForTimeout(700)

  await scrollTo(0)
  await page.screenshot({ path: path.join(outDir, `topo-${theme}.png`) })

  await scrollTo(700)
  await page.screenshot({ path: path.join(outDir, `paineis-${theme}.png`) })

  await scrollTo(3000)
  await page.screenshot({ path: path.join(outDir, `fim-${theme}.png`) })

  // janelas de período
  await scrollTo(0)
  for (const w of ['6m', '24m', 'tudo']) {
    await page.getByRole('tab', { name: w, exact: true }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(outDir, `janela-${w}-${theme}.png`) })
  }
  await page.getByRole('tab', { name: '12m', exact: true }).click()
  await page.waitForTimeout(400)

  // privacidade: o traço fica, o número some
  await page.getByRole('button', { name: 'Ocultar valores (modo privacidade)' }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(outDir, `privacidade-${theme}.png`) })
  await page.getByRole('button', { name: 'Mostrar valores' }).click()
  await page.waitForTimeout(400)
}

console.log(errors.length === 0 ? 'OK — sem erros de console' : `ERROS: ${errors.join(' | ')}`)
console.log(`capturas em ${outDir}`)
await app.close()
fs.rmSync(userData, { recursive: true, force: true })
