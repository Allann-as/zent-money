// Verificação da suficiência de saldo (adendo R10): os três estados.
// Uso: node scripts/shot-saldo.mjs
import { _electron as electron } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const outDir = 'screenshots/r10-saldo'
fs.mkdirSync(outDir, { recursive: true })
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-saldo-'))
execFileSync(process.execPath, ['scripts/seed-demo.mjs', userData], { stdio: 'ignore' })

const env = { ...process.env, ZENT_NO_LOCK: '1', ZENT_OFFLINE: '1', ZENT_USER_DATA: userData }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['out/main/main.js'], env })
let page = null
for (let i = 0; i < 80 && !page; i++) { for (const w of app.windows()) if (!w.url().includes('#quick')) page = w; if (!page) await new Promise((r) => setTimeout(r, 100)) }
await page.waitForSelector('aside', { timeout: 15000 })
await page.waitForTimeout(600)
await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))

// Concilia o Santander a R$ 10,00.
await page.click('aside >> text="Bancos & Cartões"')
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Abrir Santander' }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Editar saldo em conta' }).click()
const field = page.getByRole('textbox', { name: 'Saldo em conta' })
await field.click()
await page.keyboard.press('Control+a')
await page.keyboard.type('10', { delay: 40 })
await page.getByRole('button', { name: 'OK' }).click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Voltar para Bancos & Cartões' }).click()
await page.waitForTimeout(300)

// (1) BLOQUEADO — Guardar R$ 11,00 pelo Santander (só tem R$ 10,00).
await page.click('aside >> text="Caixinhas"')
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Guardar', exact: true }).first().click()
await page.waitForTimeout(300)
let dialog = page.getByRole('dialog')
await dialog.getByRole('textbox', { name: 'Valor a guardar' }).fill('11')
await page.waitForTimeout(300)
await page.screenshot({ path: path.join(outDir, '1-bloqueado-dark.png') })
// aceita R$ 10,00 e zera
await dialog.getByRole('textbox', { name: 'Valor a guardar' }).fill('10')
await dialog.getByRole('radio', { name: /Santander/ }).click()
await dialog.getByRole('button', { name: /^Guardar R\$/ }).click()
await page.waitForTimeout(500)

// (2) AVISADO — gasto R$ 5,00 pela conta zerada.
await page.click('aside >> text="Gastos"')
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Novo gasto' }).click()
await page.waitForTimeout(300)
dialog = page.getByRole('dialog')
await dialog.getByLabel('Categoria').selectOption({ index: 1 })
await dialog.getByPlaceholder('Ex.: Compras da semana').fill('Gasto no vermelho')
await dialog.getByRole('textbox', { name: 'Valor do gasto' }).fill('5')
await dialog.getByRole('radio', { name: /Santander/ }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: path.join(outDir, '2-avisado-dark.png') })
await dialog.getByRole('button', { name: 'Lançar mesmo assim' }).click()
await page.waitForTimeout(500)

// (3) NEGATIVO — Santander em −R$ 5,00 (coral) nos Bancos.
await page.click('aside >> text="Bancos & Cartões"')
await page.waitForTimeout(500)
await page.getByText('Santander', { exact: true }).first().scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
await page.screenshot({ path: path.join(outDir, '3-negativo-dark.png') })

// light também, no estado negativo
await page.evaluate(() => (document.documentElement.dataset.theme = 'light'))
await page.waitForTimeout(300)
await page.getByText('Santander', { exact: true }).first().scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
await page.screenshot({ path: path.join(outDir, '3-negativo-light.png') })

console.log(`capturas em ${outDir}`)
await app.close()
fs.rmSync(userData, { recursive: true, force: true })
