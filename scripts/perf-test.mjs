// Auditoria de performance (§10.4): gera 50.000 lançamentos sintéticos,
// abre o app real e mede a fluidez de navegação entre seções e meses.
// Uso: node scripts/perf-test.mjs
import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function id(n) {
  return `perf-${n.toString(36)}`
}

// ── dataset sintético: 10 anos de história ──────────────────────────
const CATEGORIES = [
  ['Mercado', '#2fd680', 120000],
  ['Farmácia', '#22c8e6', null],
  ['Restaurantes', '#ff8a5c', 40000],
  ['Transporte', '#6ba1ff', null],
  ['Lazer', '#b98aff', 30000],
  ['Assinaturas', '#ff7ab8', null],
  ['Contas de casa', '#ffb454', 200000],
  ['Educação', '#4adfc3', null],
].map(([name, color, monthlyLimit], i) => ({ id: id(i), name, color, monthlyLimit }))

const banks = [
  { id: 'b1', name: 'Nubank', color: '#820AD1', balance: 532040 },
  { id: 'b2', name: 'Itaú', color: '#EC7000', balance: 120000 },
]

const expenses = []
let seed = 42
function rand() {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}

for (let n = 0; n < 50_000; n++) {
  const monthsBack = Math.floor(rand() * 120) // 10 anos
  const d = new Date(2026, 6 - monthsBack, 1 + Math.floor(rand() * 28))
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  expenses.push({
    id: id(1000 + n),
    date: iso,
    categoryId: CATEGORIES[Math.floor(rand() * CATEGORIES.length)].id,
    description: `Lançamento ${n}`,
    amount: 500 + Math.floor(rand() * 40000),
    essential: rand() > 0.3,
  })
}

const contributions = []
for (let m = 0; m < 60; m++) {
  const d = new Date(2026, 6 - m, 5)
  contributions.push({
    id: id(90000 + m),
    investmentId: 'inv1',
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-05`,
    amount: 50000,
  })
}

// Propositalmente na versão 1 do schema: o boot precisa migrar 1→2 de
// verdade com 50k lançamentos — valida migração E performance juntas.
const data = {
  version: 1,
  profile: { name: 'Allan' },
  rates: { selic: 14.25, cdi: 14.15, ipca: 4.64, updatedAt: '2026-07-16' },
  salaryHistory: [{ id: 's1', startYm: '2016-08', amount: 320000 }],
  extraIncomes: [],
  categories: CATEGORIES,
  expenses,
  banks,
  cards: [{ id: 'c1', bankId: 'b1', name: 'Ultravioleta', limit: 500000, invoice: 80000 }],
  purchases: [
    {
      id: 'p1', cardId: 'c1', name: 'Notebook', installmentAmount: 10000,
      totalInstallments: 10, paidInstallments: 3, startYm: '2026-04',
    },
  ],
  investments: [{ id: 'inv1', name: 'CDB 102% CDI', bankId: 'b1', rateType: 'cdi', rateParam: 102 }],
  contributions,
  boxes: [
    { id: 'x1', emoji: '🛟', name: 'Reserva de emergência', target: 250000, investmentId: 'inv1', manualAmount: 0, celebrated: false },
  ],
  meta: { createdAt: '2026-07-16', lastManualExport: '2026-07-16', categoriesOnboarded: true },
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-perf-'))
fs.writeFileSync(path.join(userData, 'zent-data.json'), JSON.stringify(data))
console.log(`Dataset: ${expenses.length} lançamentos, ${contributions.length} aportes → ${userData}`)

// ── medição ─────────────────────────────────────────────────────────
// ZENT_NO_LOCK: mede o app sem o atrito da tela de PIN (não é teste de segurança).
const env = { ...process.env, ZENT_USER_DATA: userData, ZENT_NO_LOCK: '1' }
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({ args: ['out/main/main.js'], env })
const page = await app.firstWindow()

const t0 = Date.now()
await page.waitForSelector('text=Patrimônio total', { timeout: 30000 })
console.log(`Boot até a Visão geral renderizada: ${Date.now() - t0}ms`)

const sections = ['Ganhos', 'Gastos', 'Bancos & Cartões', 'Parcelas', 'Carteira', 'Caixinhas', 'Linha do tempo', 'Visão geral']
for (const s of sections) {
  const t = Date.now()
  await page.click(`aside >> text="${s}"`)
  // espera o header da seção renderizar
  await page.waitForSelector(`main >> role=heading[level=1] >> text="${s}"`, { timeout: 15000 })
  console.log(`Abrir "${s}": ${Date.now() - t}ms`)
}

// navegação de meses na Visão geral (o caso crítico da janela de 12m)
const times = []
for (let i = 0; i < 12; i++) {
  const t = Date.now()
  await page.click('[aria-label="Mês anterior"]')
  await page.waitForTimeout(16)
  times.push(Date.now() - t)
}
console.log(`Navegar 12 meses para trás (média por clique): ${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}ms`)

// Gastos com mês cheio de lançamentos
const tG = Date.now()
await page.click('aside >> text="Gastos"')
await page.waitForSelector('text=Resumo por categoria', { timeout: 15000 })
console.log(`Abrir Gastos com dataset 50k: ${Date.now() - tG}ms`)

await app.close()
fs.rmSync(userData, { recursive: true, force: true })
console.log('OK — dataset removido.')
