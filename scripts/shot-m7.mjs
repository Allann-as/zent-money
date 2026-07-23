// Capturas do milestone ⑦ (R10): primeira execução com nome + desbloqueio.
// Uso: node scripts/shot-m7.mjs [pasta-destino]
//
// Roda o fluxo REAL de primeira execução (sem ZENT_NO_LOCK) para capturar os
// três passos, e depois reabre para a saudação personalizada e a linha viva.
// A senha de teste "2468" é descartável e some com o userData temporário —
// nunca a senha do usuário.
import { _electron as electron } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const outDir = process.argv[2] ?? 'screenshots/r10-m7'
fs.mkdirSync(outDir, { recursive: true })

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-m7-'))
// Semeia o demo para a linha viva ter dado real (streak, meta, score).
execFileSync(process.execPath, ['scripts/seed-demo.mjs', userData], { stdio: 'ignore' })

const env = { ...process.env, ZENT_OFFLINE: '1', ZENT_USER_DATA: userData }
delete env.ELECTRON_RUN_AS_NODE

let app = await electron.launch({ args: ['out/main/main.js'], env })
let page = await firstMain(app)
await page.waitForSelector('h1', { timeout: 15000 })
await page.waitForTimeout(500)

const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) })

async function setTheme(t) {
  await page.evaluate((th) => {
    document.documentElement.dataset.theme = th
    localStorage.setItem('zent-ui', JSON.stringify({ state: { theme: th, sidebarCollapsed: false }, version: 0 }))
  }, t)
  await page.waitForTimeout(300)
}

async function firstMain(a) {
  for (let i = 0; i < 60; i++) {
    for (const w of a.windows()) if (!w.url().includes('#quick')) return w
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('janela principal não encontrada')
}

async function typePin(pin) {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar PIN' }).click()
}

await setTheme('dark')

// Passo 1 — criar a senha
await page.getByRole('heading', { name: 'Crie sua senha' }).waitFor()
await shot('1-criar-senha-dark')
await typePin('2468')

// Passo 2 — confirmar
await page.getByRole('heading', { name: 'Confirme sua senha' }).waitFor()
await shot('2-confirmar-dark')
await typePin('2468')

// Passo 3 — o nome, com o cursor à esquerda do placeholder (campo vazio)
await page.getByRole('heading', { name: 'Como você quer ser chamado?' }).waitFor()
await page.waitForTimeout(400)
await shot('3-nome-vazio-dark')
// digitando: o placeholder some e o cursor acompanha o texto
await page.getByLabel('insira seu nome').pressSequentially('Alex', { delay: 90 })
await page.waitForTimeout(300)
await shot('3-nome-digitado-dark')
await page.getByRole('button', { name: 'Entrar no Zent' }).click()
await page.waitForSelector('aside', { timeout: 15000 })

/** Escreve `privacy` no zent-ui persistido — vale no próximo reload (rehydrate). */
async function setPrivacyPersisted(on) {
  await page.evaluate((val) => {
    const s = JSON.parse(localStorage.getItem('zent-ui') ?? '{}')
    s.state = { ...(s.state ?? {}), privacy: val }
    localStorage.setItem('zent-ui', JSON.stringify(s))
  }, on)
}

// Reabrir → desbloqueio com saudação e linha viva (nos dois temas)
for (const theme of ['dark', 'light']) {
  await setTheme(theme)
  await setPrivacyPersisted(false)
  await page.reload()
  await page.getByRole('heading', { name: 'Seja bem-vindo de volta, Alex' }).waitFor({ timeout: 15000 })
  await page.waitForTimeout(700)
  await shot(`4-desbloqueio-${theme}`)

  // a mesma tela sob privacidade: a linha viva usa a variante SEM número.
  // Persisto antes do reload, para o rehydrate do store já nascer privado (o
  // componente React lê o store, não o atributo do DOM).
  await setPrivacyPersisted(true)
  await page.reload()
  await page.getByRole('heading', { name: 'Seja bem-vindo de volta, Alex' }).waitFor({ timeout: 15000 })
  await page.waitForTimeout(700)
  await shot(`5-desbloqueio-privacidade-${theme}`)
  await setPrivacyPersisted(false)

  // desbloqueia para o próximo tema reabrir limpo
  await typePin('2468')
  await page.waitForSelector('aside', { timeout: 15000 })
}

await app.close()
fs.rmSync(userData, { recursive: true, force: true })
console.log(`capturas em ${outDir}`)
