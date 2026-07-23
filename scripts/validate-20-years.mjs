// ⑨ VALIDAÇÃO DE 20 ANOS (R10) — o app aguenta duas décadas de histórico?
// Uso: node scripts/validate-20-years.mjs
//
// Semeia ~20 anos de dados mensais (salário, gastos, aportes, transferências) e
// verifica, no app RODANDO: boot, navegação por todas as seções nos dois temas,
// zero erros de console, datas de 2006 a 2026 renderizadas, a janela "tudo" da
// Linha do tempo cobrindo o período inteiro, e — reusando a sonda do estresse —
// que nenhum número transborda com o patrimônio que 20 anos acumulam.
import { _electron as electron } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const START_YEAR = 2006
const END = { y: 2026, m: 7 } // até julho/2026 (o "hoje" do app)

const cents = (reais) => Math.round(reais * 100)
const pad = (n) => String(n).padStart(2, '0')

/** Constrói ~20 anos de dados, já no formato do schema atual (migra trivialmente). */
function build() {
  const banks = [
    { id: 'b-nu', name: 'Nubank', color: '#820AD1', openingBalance: cents(2000) },
    { id: 'b-ita', name: 'Itaú', color: '#EC7000', openingBalance: cents(5000) },
  ]
  const categories = [
    { id: 'cat-merc', name: 'Mercado', color: '#7e9c86', monthlyLimit: cents(1500) },
    { id: 'cat-casa', name: 'Contas de casa', color: '#c7a55e', monthlyLimit: cents(1200) },
    { id: 'cat-transp', name: 'Transporte', color: '#7fa9c0', monthlyLimit: cents(600) },
    { id: 'cat-lazer', name: 'Lazer', color: '#b598f0', monthlyLimit: cents(400) },
  ]
  const salaryHistory = []
  const salaryCredits = []
  const expenses = []
  const contributions = []
  const transfers = []
  let n = 0

  // Salário sobe ~4%/ano ao longo das duas décadas.
  for (let y = START_YEAR; y <= END.y; y++) {
    const base = 3000 * Math.pow(1.04, y - START_YEAR)
    salaryHistory.push({ id: `sal-${y}`, startYm: `${y}-01`, amount: cents(base) })
  }

  for (let y = START_YEAR; y <= END.y; y++) {
    const lastM = y === END.y ? END.m : 12
    for (let m = 1; m <= lastM; m++) {
      const ym = `${y}-${pad(m)}`
      const sal = 3000 * Math.pow(1.04, y - START_YEAR)
      salaryCredits.push({ id: `sc-${ym}`, ym, date: `${ym}-05`, bankId: 'b-nu', amount: cents(sal) })
      // ~12 gastos/mês espalhados
      for (let i = 0; i < 12; i++) {
        const cat = categories[i % categories.length]
        const day = pad(2 + ((i * 2) % 26))
        expenses.push({
          id: `e-${ym}-${i}`,
          date: `${ym}-${day}`,
          categoryId: cat.id,
          description: `${cat.name} ${i}`,
          amount: cents(40 + ((i * 37 + m) % 160)),
          essential: i % 3 !== 0,
          origin: { kind: 'bank', bankId: 'b-nu' },
        })
        n++
      }
      // aporte mensal e uma transferência de folga para o Itaú
      contributions.push({ id: `c-${ym}`, investmentId: 'inv-cdb', date: `${ym}-06`, amount: cents(300), fromBankId: 'b-nu' })
      transfers.push({ id: `t-${ym}`, date: `${ym}-28`, fromBankId: 'b-nu', toBankId: 'b-ita', amount: cents(100) })
    }
  }

  return {
    version: 11,
    profile: { name: 'Allan' },
    rates: { selic: 14.25, cdi: 14.15, ipca: 4.64, updatedAt: '2026-07-16', autoUpdate: true, lastAutoAt: null, overrides: { selic: false, cdi: false, ipca: false } },
    salaryHistory,
    salaryConfig: { bankId: 'b-nu', payDay: 5, autoCredit: true },
    salaryCredits,
    extraIncomes: [],
    categories,
    expenses,
    banks,
    cards: [{ id: 'k1', bankId: 'b-nu', name: 'Ultravioleta', limit: cents(15000), invoice: cents(800) }],
    purchases: [{ id: 'p1', cardId: 'k1', creditor: null, name: 'Notebook', installmentAmount: cents(500), totalInstallments: 10, paidInstallments: 3, startYm: '2026-03' }],
    investments: [{ id: 'inv-cdb', name: 'CDB 102% CDI', bankId: 'b-nu', rateType: 'cdi', rateParam: 102, valueUpdates: [] }],
    contributions,
    boxes: [{ id: 'bx1', icon: 'target', name: 'Reserva', target: cents(50000), investmentId: null, manualAmount: cents(20000), celebrated: false }],
    boxTransfers: [],
    transfers,
    adjustments: [],
    invoicePayments: [],
    budgetReallocations: [],
    recurringExpenses: [],
    recurringIncomes: [],
    gamification: { achievements: [], activeChallenge: null, challengeHistory: [] },
    meta: { createdAt: `${START_YEAR}-01-01`, lastManualExport: null, categoriesOnboarded: true, lastRecurringYm: '2026-07', lastSalaryCreditYm: '2026-07', gamificationOnboarded: true },
    _count: n,
  }
}

const OVERFLOW_PROBE = `(() => {
  const MONEY = /R\\$|\\d{1,3}(\\.\\d{3})*,\\d{2}|••••/
  const bad = []
  const visible = (el) => { const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden'||s.opacity==='0') return false; const r = el.getBoundingClientRect(); return r.width>0&&r.height>0 }
  for (const el of document.querySelectorAll('*')) {
    const own = Array.from(el.childNodes).filter(n=>n.nodeType===3).map(n=>n.nodeValue).join('').trim()
    if (own==='' || !MONEY.test(own) || !visible(el) || el.ownerSVGElement) continue
    const s = getComputedStyle(el)
    if (s.overflowX==='auto'||s.overflowX==='scroll') continue
    if (el.scrollWidth > el.clientWidth + 1) bad.push((el.className||'')+' :: '+own.slice(0,30))
  }
  return bad
})()`

const data = build()
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-20y-'))
fs.writeFileSync(path.join(userData, 'zent-data.json'), JSON.stringify(data))
console.log(`Semeados ${data._count} gastos, ${data.salaryCredits.length} meses de salário — ${START_YEAR} a ${END.y}.`)

const env = { ...process.env, ZENT_NO_LOCK: '1', ZENT_OFFLINE: '1', ZENT_USER_DATA: userData }
delete env.ELECTRON_RUN_AS_NODE

const SECTIONS = ['Hoje', 'Visão geral', 'Ganhos', 'Gastos', 'Bancos & Cartões', 'Crédito', 'Parcelas', 'Carteira', 'Caixinhas', 'Linha do tempo']
let problems = 0
const fail = (msg) => { problems++; console.log('  ✗ ' + msg) }

const t0 = Date.now()
const app = await electron.launch({ args: ['out/main/main.js'], env })
let page = null
for (let i = 0; i < 80 && !page; i++) { for (const w of app.windows()) if (!w.url().includes('#quick')) page = w; if (!page) await new Promise((r) => setTimeout(r, 100)) }
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

try {
  await page.waitForSelector('aside', { timeout: 25000 })
  console.log(`Boot com 20 anos de dados: ${Date.now() - t0}ms`)
  await page.waitForTimeout(800)

  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
    for (const section of SECTIONS) {
      if (section === 'Crédito') {
        await page.getByRole('navigation', { name: 'Seções' }).getByRole('button', { name: 'Crédito', exact: true }).click()
      } else {
        await page.click(`aside >> text="${section}"`)
      }
      await page.waitForTimeout(350)
      const heading = await page.getByRole('heading', { level: 1 }).first().isVisible().catch(() => false)
      if (!heading) fail(`${section}/${theme}: sem cabeçalho`)
      const bad = await page.evaluate(OVERFLOW_PROBE)
      for (const b of bad.slice(0, 3)) fail(`${section}/${theme}: transbordo — ${b}`)
    }
  }

  // A Linha do tempo "tudo" cobre o período inteiro (2006 → 2026).
  await page.click('aside >> text="Linha do tempo"')
  await page.waitForTimeout(400)
  await page.getByRole('tab', { name: 'tudo', exact: true }).click()
  await page.waitForTimeout(500)
  const sub = await page.getByText(/jan\/2006 até/).first().isVisible().catch(() => false)
  if (!sub) fail('Linha do tempo "tudo" não abre em jan/2006')
  else console.log('  ✓ Linha do tempo "tudo" abre em jan/2006')
  const meses = await page.getByText(/· 247 meses/).first().isVisible().catch(() => false)
  if (!meses) fail('Linha do tempo "tudo" não conta 247 meses')
  else console.log('  ✓ 247 meses (jan/2006 … jul/2026) na janela "tudo"')

  if (errors.length > 0) { problems += errors.length; console.log('  ✗ erros de console:\n    ' + errors.slice(0, 5).join('\n    ')) }
} finally {
  await app.close()
  fs.rmSync(userData, { recursive: true, force: true })
}

console.log('\n══ VALIDAÇÃO DE 20 ANOS ══\n')
if (problems === 0) {
  console.log('OK — 20 anos de dados: boot, navegação nas 10 seções × 2 temas, datas de 2006 a 2026, janela "tudo" completa, zero transbordo, zero erro de console.\n')
  process.exit(0)
}
console.log(`${problems} problema(s) em 20 anos de dados.\n`)
process.exit(1)
