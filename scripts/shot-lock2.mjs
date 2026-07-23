// Capturas dos dois ajustes: tela de bloqueio em duas colunas (antes/depois do
// PIN, primeira execução) e o tooltip do "Recolher" com a janela pequena.
// Uso: node scripts/shot-lock2.mjs
//
// A senha de teste "2468" é descartável e some com o userData temporário.
import { _electron as electron } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const outDir = 'screenshots/r10-lock2'
fs.mkdirSync(outDir, { recursive: true })

async function mainWindow(app) {
  for (let i = 0; i < 80; i++) {
    for (const w of app.windows()) if (!w.url().includes('#quick')) return w
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('janela principal não encontrada')
}
const setTheme = (page, t) =>
  page.evaluate((th) => {
    document.documentElement.dataset.theme = th
    localStorage.setItem('zent-ui', JSON.stringify({ state: { theme: th, sidebarCollapsed: false }, version: 0 }))
  }, t)

async function typePin(page, pin) {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar PIN' }).click()
}

// ── A) PRIMEIRA EXECUÇÃO, dados limpos (sem ZENT_NO_LOCK) ────────────────────
{
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-lk-'))
  const env = { ...process.env, ZENT_OFFLINE: '1', ZENT_USER_DATA: userData }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: ['out/main/main.js'], env })
  const page = await mainWindow(app)
  await page.waitForSelector('h1', { timeout: 15000 })
  await page.waitForTimeout(900) // deixa a barra terminar de datilografar

  for (const theme of ['dark', 'light']) {
    await setTheme(page, theme)
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(outDir, `1-primeira-execucao-criar-${theme}.png`) })
  }
  await typePin(page, '2468')
  await page.getByRole('heading', { name: 'Confirme sua senha' }).waitFor()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(outDir, '2-primeira-execucao-confirmar-light.png') })
  await typePin(page, '2468')
  await page.getByRole('heading', { name: 'Como você quer ser chamado?' }).waitFor()
  await page.waitForTimeout(300)
  await page.getByLabel('insira seu nome').pressSequentially('Allan', { delay: 70 })
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(outDir, '3-primeira-execucao-nome-light.png') })
  await setTheme(page, 'dark')
  await page.waitForTimeout(350)
  await page.screenshot({ path: path.join(outDir, '3-primeira-execucao-nome-dark.png') })
  await page.getByRole('button', { name: 'Entrar no Zent' }).click()
  await page.waitForSelector('aside', { timeout: 15000 })

  // ── B) DESBLOQUEIO: antes e depois do PIN, nos dois temas ─────────────────
  for (const theme of ['dark', 'light']) {
    await setTheme(page, theme)
    await page.reload()
    await page.getByText('Digite seu PIN para desbloquear').waitFor({ timeout: 15000 })
    await page.waitForTimeout(1200) // barra datilografada + relógio andando
    await page.screenshot({ path: path.join(outDir, `4-bloqueio-antes-${theme}.png`) })
    // depois do PIN: o beat de "operador identificado" (o nome só aparece aqui)
    await typePin(page, '2468')
    await page.waitForTimeout(420)
    await page.screenshot({ path: path.join(outDir, `5-bloqueio-depois-${theme}.png`) })
    await page.waitForSelector('aside', { timeout: 15000 })
  }
  await app.close()
  fs.rmSync(userData, { recursive: true, force: true })
}

// ── C) TOOLTIP do "Recolher" com a janela PEQUENA ────────────────────────────
{
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-tip2-'))
  execFileSync(process.execPath, ['scripts/seed-demo.mjs', userData], { stdio: 'ignore' })
  const env = { ...process.env, ZENT_NO_LOCK: '1', ZENT_OFFLINE: '1', ZENT_USER_DATA: userData }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: ['out/main/main.js'], env })
  const page = await mainWindow(app)
  await page.waitForSelector('aside', { timeout: 15000 })
  const win = await app.browserWindow(page)
  await win.evaluate((b) => b.setContentSize(1024, 640))
  await page.waitForTimeout(500)
  await setTheme(page, 'dark')
  await page.waitForTimeout(300)

  // menu fixado: tooltip do "Recolher (Ctrl+B)"
  await page.locator('aside button[aria-label="Recolher menu"]').hover({ force: true })
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(outDir, '6-tooltip-recolher-janela-pequena.png') })

  // menu solto: tooltip do "Expandir"
  await page.keyboard.press('Control+b')
  await page.waitForTimeout(500)
  const exp = page.locator('aside button[aria-label="Expandir menu"]')
  if (await exp.count()) {
    await exp.first().hover({ force: true })
    await page.waitForTimeout(250)
    await page.screenshot({ path: path.join(outDir, '7-tooltip-expandir-janela-pequena.png') })
  }
  await app.close()
  fs.rmSync(userData, { recursive: true, force: true })
}

console.log(`capturas em ${outDir}`)
