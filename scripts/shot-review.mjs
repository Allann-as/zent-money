// Auto-revisão visual do fecho da R10 (⑩): todas as seções nos dois temas,
// sobre o dataset demo. Uso: node scripts/shot-review.mjs
import { _electron as electron } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const outDir = 'screenshots/r10-final'
fs.mkdirSync(outDir, { recursive: true })
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-review-'))
execFileSync(process.execPath, ['scripts/seed-demo.mjs', userData], { stdio: 'ignore' })

const env = { ...process.env, ZENT_NO_LOCK: '1', ZENT_OFFLINE: '1', ZENT_USER_DATA: userData }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['out/main/main.js'], env })
let page = null
for (let i = 0; i < 80 && !page; i++) { for (const w of app.windows()) if (!w.url().includes('#quick')) page = w; if (!page) await new Promise((r) => setTimeout(r, 100)) }
await page.waitForSelector('aside', { timeout: 15000 })
await page.waitForTimeout(700)

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')
const SECTIONS = ['Hoje', 'Visão geral', 'Ganhos', 'Gastos', 'Bancos & Cartões', 'Crédito', 'Parcelas', 'Carteira', 'Caixinhas', 'Linha do tempo']
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

for (const theme of ['dark', 'light']) {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t
    localStorage.setItem('zent-ui', JSON.stringify({ state: { theme: t, sidebarCollapsed: false }, version: 0 }))
  }, theme)
  await page.waitForTimeout(300)
  for (const section of SECTIONS) {
    if (section === 'Crédito') {
      await page.getByRole('navigation', { name: 'Seções' }).getByRole('button', { name: 'Crédito', exact: true }).click()
    } else {
      await page.click(`aside >> text="${section}"`)
    }
    await page.waitForTimeout(450)
    await page.evaluate(() => { for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0) el.scrollTop = 0 })
    await page.waitForTimeout(200)
    await page.screenshot({ path: path.join(outDir, `${slug(section)}-${theme}.png`) })
  }
}

console.log(errors.length === 0 ? 'OK — sem erros de console na revisão' : `ERROS: ${errors.join(' | ')}`)
console.log(`capturas em ${outDir}`)
await app.close()
fs.rmSync(userData, { recursive: true, force: true })
