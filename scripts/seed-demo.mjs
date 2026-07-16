// Gera um dataset demo realista (para screenshots/review visual).
// Uso: node scripts/seed-demo.mjs <pasta-destino>
import fs from 'node:fs'
import path from 'node:path'

const dest = process.argv[2]
if (!dest) {
  console.error('uso: node scripts/seed-demo.mjs <pasta-destino>')
  process.exit(1)
}
fs.mkdirSync(dest, { recursive: true })

const ym = (offset) => {
  const d = new Date(2026, 6 + offset, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const day = (offset, dd) => `${ym(offset)}-${String(dd).padStart(2, '0')}`

const categories = [
  { id: 'cat-mercado', name: 'Mercado', color: '#2fd680', monthlyLimit: 90000 },
  { id: 'cat-farmacia', name: 'Farmácia', color: '#22c8e6', monthlyLimit: null },
  { id: 'cat-rest', name: 'Restaurantes', color: '#ff8a5c', monthlyLimit: 35000 },
  { id: 'cat-transp', name: 'Transporte', color: '#6ba1ff', monthlyLimit: 25000 },
  { id: 'cat-lazer', name: 'Lazer', color: '#b98aff', monthlyLimit: 20000 },
  { id: 'cat-casa', name: 'Contas de casa', color: '#ffb454', monthlyLimit: 60000 },
]

let n = 0
const e = (offset, dd, categoryId, description, amount, essential = true) => ({
  id: `demo-e${n++}`, date: day(offset, dd), categoryId, description, amount, essential,
})

const expenses = []
for (let m = -11; m <= 0; m++) {
  expenses.push(
    e(m, 3, 'cat-mercado', 'Compras do mês', 62000 + ((m * 7919) % 18000 + 18000) % 18000),
    e(m, 8, 'cat-casa', 'Luz + internet', 38000 + ((m * 104729) % 9000 + 9000) % 9000),
    e(m, 12, 'cat-transp', 'Recarga transporte', 15000),
    e(m, 15, 'cat-rest', 'Almoço com amigos', 8900 + ((m * 31) % 4000 + 4000) % 4000, false),
    e(m, 20, 'cat-farmacia', 'Farmácia', 4500 + ((m * 17) % 3000 + 3000) % 3000),
    e(m, 22, 'cat-lazer', 'Cinema / jogos', 6900 + ((m * 13) % 5000 + 5000) % 5000, false),
  )
  if (m % 2 === 0) expenses.push(e(m, 26, 'cat-mercado', 'Feira', 9800))
}

const contributions = []
for (let m = -17; m <= 0; m++) {
  contributions.push({
    id: `demo-c${n++}`, investmentId: 'inv-cdb', date: day(m, 5), amount: 40000,
  })
  if (m >= -9) {
    contributions.push({
      id: `demo-c${n++}`, investmentId: 'inv-tesouro', date: day(m, 6), amount: 25000,
    })
  }
}

const data = {
  version: 2,
  profile: { name: 'Allan' },
  rates: { selic: 14.25, cdi: 14.15, ipca: 4.64, updatedAt: '2026-07-16' },
  salaryHistory: [
    { id: 'sal-1', startYm: ym(-11), amount: 290000 },
    { id: 'sal-2', startYm: ym(-3), amount: 320000 },
  ],
  extraIncomes: [
    { id: 'ex-1', date: day(0, 2), description: 'Freela — site da pizzaria', amount: 40000 },
    { id: 'ex-2', date: day(0, 10), description: 'Presente da vó', amount: 15000 },
    { id: 'ex-3', date: day(-1, 18), description: 'Venda de fone usado', amount: 12000 },
    { id: 'ex-4', date: day(-4, 7), description: 'Freela — logo', amount: 25000 },
  ],
  categories,
  expenses,
  banks: [
    { id: 'bank-nu', name: 'Nubank', color: '#820AD1', balance: 412550 },
    { id: 'bank-itau', name: 'Itaú', color: '#EC7000', balance: 158020 },
    { id: 'bank-bradesco', name: 'Bradesco', color: '#CC092F', balance: 0 },
    { id: 'bank-santander', name: 'Santander', color: '#EA1D25', balance: 0 },
    { id: 'bank-btg', name: 'BTG', color: '#0C2340', balance: 250000 },
  ],
  cards: [
    { id: 'card-uv', bankId: 'bank-nu', name: 'Ultravioleta', limit: 500000, invoice: 84300 },
    { id: 'card-click', bankId: 'bank-itau', name: 'Click', limit: 250000, invoice: 21500 },
  ],
  purchases: [
    { id: 'pur-note', cardId: 'card-uv', name: 'Notebook', installmentAmount: 10000, totalInstallments: 10, paidInstallments: 3, startYm: ym(-3) },
    { id: 'pur-cel', cardId: 'card-uv', name: 'Celular', installmentAmount: 25000, totalInstallments: 12, paidInstallments: 10, startYm: ym(-10) },
    { id: 'pur-sofa', cardId: 'card-click', name: 'Sofá', installmentAmount: 15000, totalInstallments: 6, paidInstallments: 6, startYm: ym(-6) },
  ],
  investments: [
    { id: 'inv-cdb', name: 'CDB 102% CDI', bankId: 'bank-nu', rateType: 'cdi', rateParam: 102, valueUpdates: [] },
    { id: 'inv-tesouro', name: 'Tesouro Selic 2029', bankId: 'bank-btg', rateType: 'selic', rateParam: 0, valueUpdates: [] },
    { id: 'inv-ipca', name: 'Tesouro IPCA+ 5,8%', bankId: 'bank-btg', rateType: 'ipca', rateParam: 5.8, valueUpdates: [] },
    {
      id: 'inv-fii', name: 'FII HGLG11', bankId: 'bank-btg', rateType: 'manual', rateParam: 0,
      valueUpdates: [
        { id: 'vu-1', date: day(-6, 10), value: 180000 },
        { id: 'vu-2', date: day(-3, 10), value: 192000 },
        { id: 'vu-3', date: day(0, 10), value: 201500 },
      ],
    },
  ],
  contributions: [
    ...contributions,
    { id: `demo-c${n++}`, investmentId: 'inv-ipca', date: day(-14, 10), amount: 300000 },
    { id: `demo-c${n++}`, investmentId: 'inv-fii', date: day(-6, 10), amount: 180000 },
  ],
  boxes: [
    { id: 'box-reserva', emoji: '🛟', name: 'Reserva de emergência', target: 250000, investmentId: 'inv-cdb', manualAmount: 0, celebrated: false },
    { id: 'box-viagem', emoji: '✈️', name: 'Viagem pro Chile', target: 600000, investmentId: 'inv-tesouro', manualAmount: 0, celebrated: false },
    { id: 'box-pc', emoji: '💻', name: 'PC novo', target: 450000, investmentId: null, manualAmount: 120000, celebrated: false },
  ],
  recurringExpenses: [
    {
      id: 'rec-1', categoryId: 'cat-casa', description: 'Luz + internet', amount: 42000,
      essential: true, dayOfMonth: 8, startYm: ym(0), endYm: null,
    },
  ],
  recurringIncomes: [],
  meta: {
    createdAt: '2026-07-16',
    lastManualExport: '2026-07-16',
    categoriesOnboarded: true,
    lastRecurringYm: ym(0),
  },
}

fs.writeFileSync(path.join(dest, 'zent-data.json'), JSON.stringify(data, null, 2))
console.log(`Demo salvo em ${path.join(dest, 'zent-data.json')}`)
