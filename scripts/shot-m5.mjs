// Capturas do milestone ⑤ (R10): parcela em um clique + ícones v2.
// Uso: node scripts/shot-m5.mjs [pasta-destino]
//
// Ao contrário do screenshot.mjs genérico, este roteiro ABRE ESTADOS: a
// confirmação de pagamento (cartão e avulsa), o card quitado e o seletor de
// ícones das caixinhas — que é onde o set v2 se vê inteiro, a 16px.
import { _electron as electron } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const outDir = process.argv[2] ?? 'screenshots/r10-m5'
fs.mkdirSync(outDir, { recursive: true })

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-shot-'))
const env = { ...process.env, ZENT_NO_LOCK: '1', ZENT_OFFLINE: '1', ZENT_USER_DATA: userData }
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({ args: ['out/main/main.js'], env })
const page = await app.firstWindow()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.waitForSelector('aside', { timeout: 15000 })
await page.waitForTimeout(600)

async function setTheme(theme) {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t
    localStorage.setItem('zent-ui', JSON.stringify({ state: { theme: t, sidebarCollapsed: false }, version: 0 }))
  }, theme)
  await page.waitForTimeout(350)
}

async function shot(name, theme) {
  await page.screenshot({ path: path.join(outDir, `${name}-${theme}.png`) })
}

async function goTo(label) {
  await page.click(`aside >> text="${label}"`)
  await page.waitForTimeout(400)
}

// ── Palco: um cartão com uma compra parcelada e uma avulsa ──────────────────
await goTo('Bancos & Cartões')
await page.getByRole('button', { name: 'Cartão', exact: true }).first().click()
let dlg = page.getByRole('dialog')
await dlg.getByPlaceholder('Ex.: Ultravioleta').fill('Ultravioleta')
await dlg.getByRole('textbox', { name: 'Limite total do cartão' }).fill('12.000,00')
await dlg.getByRole('button', { name: 'Adicionar' }).click()
await page.waitForTimeout(400)

await page.getByRole('button', { name: 'Compra parcelada' }).first().click()
dlg = page.getByRole('dialog')
await dlg.getByPlaceholder('Ex.: Notebook').fill('Notebook')
await dlg.getByRole('textbox', { name: 'Valor da parcela' }).fill('1.234,56')
await dlg.getByLabel('Total de parcelas').fill('10')
await dlg.getByRole('button', { name: 'Adicionar' }).click()
await page.waitForTimeout(400)

await goTo('Parcelas')
await page.getByRole('button', { name: 'Nova parcela' }).click()
dlg = page.getByRole('dialog')
await dlg.getByRole('tab', { name: 'Avulsa', exact: true }).click()
await dlg.getByPlaceholder('Ex.: Empréstimo pessoal').fill('Empréstimo pessoal')
await dlg.getByRole('textbox', { name: 'Credor da parcela avulsa' }).fill('Banco X')
await dlg.getByRole('textbox', { name: 'Valor da parcela' }).fill('300')
await dlg.getByLabel('Total de parcelas').fill('24')
await dlg.getByRole('button', { name: 'Adicionar' }).click()
await page.waitForTimeout(500)

// uma avulsa de 1 parcela, paga de imediato: é o palco do card QUITADO
await page.getByRole('button', { name: 'Nova parcela' }).click()
dlg = page.getByRole('dialog')
await dlg.getByRole('tab', { name: 'Avulsa', exact: true }).click()
await dlg.getByPlaceholder('Ex.: Empréstimo pessoal').fill('Boleto do IPVA')
await dlg.getByRole('textbox', { name: 'Credor da parcela avulsa' }).fill('Detran')
await dlg.getByRole('textbox', { name: 'Valor da parcela' }).fill('1.480,00')
await dlg.getByLabel('Total de parcelas').fill('1')
await dlg.getByRole('button', { name: 'Adicionar' }).click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Registrar pagamento da 1ª parcela de Boleto do IPVA' }).click()
await page.waitForTimeout(300)
await page.getByRole('dialog').getByRole('button', { name: 'Confirmar pagamento' }).click()
await page.waitForTimeout(400)
await page.keyboard.press('Escape')

for (const theme of ['dark', 'light']) {
  await setTheme(theme)

  // lista de parcelas com o botão "Registrar pagamento da Nª"
  await goTo('Parcelas')
  await shot('parcelas-lista', theme)

  // o card QUITADO no estado próprio (selo em `pos`, sem ação de pagar)
  await page.getByRole('tab', { name: 'Quitadas' }).click()
  await page.waitForTimeout(350)
  await shot('parcelas-quitada', theme)
  await page.getByRole('tab', { name: 'Ativas' }).click()
  await page.waitForTimeout(300)

  // confirmação de uma parcela de CARTÃO (limite antes → depois)
  await page.getByRole('button', { name: 'Registrar pagamento da 1ª parcela de Notebook' }).click()
  await page.waitForTimeout(350)
  await shot('confirmar-cartao', theme)
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
  await page.waitForTimeout(250)

  // confirmação de uma AVULSA (sem conta a debitar, e diz por quê)
  await page.getByRole('button', { name: 'Registrar pagamento da 1ª parcela de Empréstimo pessoal' }).click()
  await page.waitForTimeout(350)
  await shot('confirmar-avulsa', theme)
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
  await page.waitForTimeout(250)

  // o card QUITADO no seu estado próprio
  await page.getByRole('button', { name: 'Registrar pagamento da 1ª parcela de Notebook' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar pagamento' }).click()
  await page.waitForTimeout(400)
  await shot('toast-desfazer', theme)
  await page.getByRole('button', { name: 'Desfazer última parcela paga de Notebook' }).click()
  await page.waitForTimeout(300)

  // ícones v2 — o set inteiro, no tamanho real do seletor
  await goTo('Caixinhas')
  await page.getByRole('button', { name: /Nova caixinha/ }).first().click()
  await page.waitForTimeout(400)
  await shot('icones-v2', theme)
  /**
   * …e o mesmo set AMPLIADO, que é como se confere um traço de 1,6.
   *
   * Ampliar o modal no lugar (zoom/scale) não serve: ele tem rolagem própria e a
   * captura sai cortada. Então o grid real é CLONADO para um painel solto em
   * cima da página — são os mesmos SVGs que o app acabou de renderizar, só que
   * grandes.
   */
  await page.evaluate(() => {
    document.querySelector('#zoom-icons')?.remove()
    const grid = document.querySelector('[aria-label="Escolher ícone"]')
    if (grid === null) return
    const panel = document.createElement('div')
    panel.id = 'zoom-icons'
    panel.style.cssText =
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
      'background:var(--bg)'
    const inner = document.createElement('div')
    // largura fixa: solto num flex, o grid clonado perderia a quebra de linha
    inner.style.cssText = 'width:330px;transform:scale(3.4);transform-origin:center'
    inner.appendChild(grid.cloneNode(true))
    panel.appendChild(inner)
    document.body.appendChild(panel)
  })
  await page.waitForTimeout(300)
  await shot('icones-v2-zoom', theme)
  await page.evaluate(() => document.querySelector('#zoom-icons')?.remove())
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}

console.log(errors.length === 0 ? 'OK — sem erros de console' : `ERROS: ${errors.join(' | ')}`)
console.log(`capturas em ${outDir}`)
await app.close()
fs.rmSync(userData, { recursive: true, force: true })
