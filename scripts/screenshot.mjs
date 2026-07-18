// Captura screenshots do app (temas escuro e claro) via Playwright + Electron.
// Uso: node scripts/screenshot.mjs <pasta-destino> [alvo 1] [alvo 2] ...
// Sem alvos, captura apenas a view inicial (Visão geral).
//
// Um alvo é um rótulo da sidebar ("Gastos") ou um dos especiais:
//   banco:<Nome>  → drill-down do banco, rolado até o histórico da conta (R4)
//   perfil        → menu de perfil aberto (taxas automáticas, R4 §2)
import { _electron as electron } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const outDir = process.argv[2] ?? 'screenshots'
const views = process.argv.slice(3)
fs.mkdirSync(outDir, { recursive: true })

// O shell do VS Code herda ELECTRON_RUN_AS_NODE=1, que faria o Electron
// rodar como Node puro — removemos antes de lançar o app.
const env = { ...process.env, ZENT_NO_LOCK: '1' }
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

/** Fecha o que estiver aberto por cima (menu/modal) antes do próximo alvo. */
async function dismiss() {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
}

/**
 * Volta ao topo. O app é uma SPA com container de rolagem próprio: trocar de
 * seção não zera o scroll, então sem isto um alvo herdava a rolagem do anterior
 * e o screenshot saía cortado no meio da página.
 */
async function scrollTop() {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      if (el.scrollTop > 0) el.scrollTop = 0
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(250)
}

async function goToTarget(label) {
  if (label.startsWith('banco:')) {
    const bank = label.slice('banco:'.length)
    await page.click('aside >> text="Bancos & Cartões"')
    await page.waitForTimeout(300)
    await scrollTop()
    await page.getByRole('button', { name: `Abrir ${bank}` }).click()
    await page.waitForTimeout(400)
    // o histórico é o último bloco da página — rola até ele
    await page.getByText('Histórico da conta').scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    return
  }
  if (label === 'perfil') {
    // Visão geral primeiro: sai de qualquer drill-down e volta ao topo, para o
    // menu não aparecer sobre uma página rolada pela metade.
    await page.click('aside >> text="Visão geral"')
    await page.waitForTimeout(300)
    await scrollTop()
    await page.getByText(/^Olá, /).click()
    await page.waitForTimeout(350)
    return
  }
  await page.click(`aside >> text="${label}"`)
  await page.waitForTimeout(350)
  await scrollTop()
}

async function capture(theme) {
  await setTheme(theme)
  if (views.length === 0) {
    await page.screenshot({ path: path.join(outDir, `app-${theme}.png`) })
    return
  }
  for (const label of views) {
    await goToTarget(label)
    await page.screenshot({ path: path.join(outDir, `${slug(label)}-${theme}.png`) })
    await dismiss()
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
