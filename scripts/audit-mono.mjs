/**
 * Auditoria da §12: TODO valor monetário, data, eixo, tooltip e badge tem de
 * estar em Roboto Mono. Roda o app de verdade, percorre as 10 seções nos dois
 * temas e mede a `font-family` COMPUTADA de cada nó de texto que parece número.
 *
 * Por que medir no app e não grepar o código: `.tnum` pode existir na classe e
 * mesmo assim perder a família para outra classe de mesma especificidade (foi
 * exatamente o que acontecia com `.font-display tnum` nos números-herói). Só a
 * computação real do navegador responde a pergunta.
 *
 * Uso: node scripts/audit-mono.mjs
 */
import { _electron as electron } from 'playwright'

const env = { ...process.env, ZENT_NO_LOCK: '1', ZENT_OFFLINE: '1' }
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({ args: ['out/main/main.js'], env })

/** A janela PRINCIPAL — a mini-janela da bandeja (`#quick`) também existe. */
async function mainWindow() {
  for (let i = 0; i < 80; i++) {
    for (const w of app.windows()) {
      if (!w.url().includes('#quick')) return w
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('janela principal não encontrada')
}

const page = await mainWindow()
await page.waitForSelector('aside', { timeout: 20000 })
await page.waitForTimeout(600)

const SECTIONS = [
  'Hoje', 'Visão geral', 'Ganhos', 'Gastos', 'Bancos & Cartões',
  'Crédito', 'Parcelas', 'Carteira', 'Caixinhas', 'Linha do tempo',
]

/** Texto que o app promete renderizar em mono (§12). */
const MONEY = /R\$\s?-?[\d.]+,\d{2}/
const DATE = /\b\d{2}\/\d{2}(\/\d{2,4})?\b/

const offenders = new Map()

async function scan(section, theme) {
  const found = await page.evaluate(
    ({ moneySrc, dateSrc }) => {
      const money = new RegExp(moneySrc)
      const date = new RegExp(dateSrc)
      const out = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.nodeValue ?? '').trim()
        if (text === '' || (!money.test(text) && !date.test(text))) continue
        const el = n.parentElement
        if (!el) continue
        const style = getComputedStyle(el)
        // Nós invisíveis não contam (menus fechados, painéis fora de tela).
        if (style.display === 'none' || style.visibility === 'hidden') continue
        const family = style.fontFamily
        if (!/mono/i.test(family)) {
          out.push({
            text: text.slice(0, 40),
            family: family.split(',')[0].replace(/"/g, ''),
            cls: el.className?.toString?.().slice(0, 90) ?? '',
            tag: el.tagName.toLowerCase(),
          })
        }
      }
      return out
    },
    { moneySrc: MONEY.source, dateSrc: DATE.source },
  )
  for (const f of found) {
    const key = `${f.tag}.${f.cls}`
    if (!offenders.has(key)) offenders.set(key, { ...f, section, theme, count: 0 })
    offenders.get(key).count += 1
  }
}

for (const theme of ['dark', 'light']) {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t
  }, theme)
  for (const label of SECTIONS) {
    if (label === 'Crédito') {
      await page
        .getByRole('navigation', { name: 'Seções' })
        .getByRole('button', { name: 'Crédito', exact: true })
        .click()
    } else {
      await page.click(`aside >> text="${label}"`)
    }
    await page.waitForTimeout(450)
    await scan(label, theme)
  }
}

await app.close()

if (offenders.size === 0) {
  console.log('§12 OK — todo número visível das 10 seções está em mono, nos 2 temas.')
  process.exit(0)
}
console.error(`§12 FALHOU — ${offenders.size} lugares com número fora do mono:\n`)
for (const o of offenders.values()) {
  console.error(`  ${o.section}/${o.theme}  <${o.tag}> "${o.text}"`)
  console.error(`     família: ${o.family}   classe: ${o.cls}\n`)
}
process.exit(1)
