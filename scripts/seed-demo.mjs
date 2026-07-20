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
  { id: 'cat-mercado', name: 'Mercado', color: '#7e9c86', monthlyLimit: 90000 },
  { id: 'cat-farmacia', name: 'Farmácia', color: '#6fa894', monthlyLimit: null },
  { id: 'cat-rest', name: 'Restaurantes', color: '#d98f7e', monthlyLimit: 35000 },
  { id: 'cat-transp', name: 'Transporte', color: '#7fa9c0', monthlyLimit: 25000 },
  { id: 'cat-lazer', name: 'Lazer', color: '#b598f0', monthlyLimit: 20000 },
  { id: 'cat-casa', name: 'Contas de casa', color: '#c7a55e', monthlyLimit: 60000 },
]

let n = 0
// `origin` (R3 §3.4): quando aponta para uma CONTA, o gasto debita o saldo dela
// (ledger da R4). Quando aponta para um cartão, ele vive na fatura e só toca a
// conta quando a fatura é paga.
const e = (offset, dd, categoryId, description, amount, essential = true, origin = null) => ({
  id: `demo-e${n++}`, date: day(offset, dd), categoryId, description, amount, essential, origin,
})

const fromNubank = { kind: 'bank', bankId: 'bank-nu' }
const fromUltravioleta = { kind: 'card', cardId: 'card-uv' }

const expenses = []
for (let m = -11; m <= 0; m++) {
  // No mês corrente, os gastos têm origem: é o que faz o saldo em conta se mover
  // sozinho e o histórico da conta ter o que contar (R4 §1).
  const debit = m === 0 ? fromNubank : null
  const onCard = m === 0 ? fromUltravioleta : null
  expenses.push(
    e(m, 3, 'cat-mercado', 'Compras do mês', 62000 + ((m * 7919) % 18000 + 18000) % 18000, true, debit),
    e(m, 8, 'cat-casa', 'Luz + internet', 38000 + ((m * 104729) % 9000 + 9000) % 9000, true, debit),
    e(m, 12, 'cat-transp', 'Recarga transporte', 15000, true, debit),
    e(m, 15, 'cat-rest', 'Almoço com amigos', 8900 + ((m * 31) % 4000 + 4000) % 4000, false, onCard),
    e(m, 20, 'cat-farmacia', 'Farmácia', 4500 + ((m * 17) % 3000 + 3000) % 3000),
    e(m, 22, 'cat-lazer', 'Cinema / jogos', 6900 + ((m * 13) % 5000 + 5000) % 5000, false, onCard),
  )
  if (m % 2 === 0) expenses.push(e(m, 26, 'cat-mercado', 'Feira', 9800, true, debit))
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
  // v8: o demo já nasce com o ledger da R4 ligado — é o produto que ele mostra.
  // A migração tem os testes dela (unit + ensaio contra o arquivo real).
  version: 8,
  profile: { name: 'Allan' },
  rates: {
    selic: 14.25,
    cdi: 14.15,
    ipca: 4.64,
    updatedAt: '2026-07-16',
    autoUpdate: true,
    // Timestamp de uma busca automática bem-sucedida (R4 §2)
    lastAutoAt: '2026-07-16T09:12:00.000Z',
    overrides: { selic: false, cdi: false, ipca: false },
  },
  salaryHistory: [
    { id: 'sal-1', startYm: ym(-11), amount: 290000 },
    { id: 'sal-2', startYm: ym(-3), amount: 320000 },
  ],
  // R4 §1.1: o salário cai no Nubank todo dia 5, automaticamente
  salaryConfig: { bankId: 'bank-nu', payDay: 5, autoCredit: true },
  extraIncomes: [
    { id: 'ex-1', date: day(0, 2), description: 'Freela — site da pizzaria', amount: 40000, receivedIn: 'bank-nu' },
    { id: 'ex-2', date: day(0, 10), description: 'Presente da vó', amount: 15000, receivedIn: null },
    { id: 'ex-3', date: day(-1, 18), description: 'Venda de fone usado', amount: 12000, receivedIn: null },
    { id: 'ex-4', date: day(-4, 7), description: 'Freela — logo', amount: 25000, receivedIn: null },
  ],
  categories,
  budgetReallocations: [],
  expenses,
  // `openingBalance` = ponto de partida; o saldo exibido é derivado dele mais os
  // movimentos abaixo (ver engine/ledger.ts).
  banks: [
    { id: 'bank-nu', name: 'Nubank', color: '#820AD1', openingBalance: 150000 },
    { id: 'bank-itau', name: 'Itaú', color: '#EC7000', openingBalance: 108020 },
    { id: 'bank-bradesco', name: 'Bradesco', color: '#CC092F', openingBalance: 0 },
    { id: 'bank-santander', name: 'Santander', color: '#EA1D25', openingBalance: 0 },
    { id: 'bank-btg', name: 'BTG Investimentos', color: '#0A2540', openingBalance: 0 },
    { id: 'bank-btgb', name: 'BTG Banking', color: '#2C5EA9', openingBalance: 250000 },
  ],
  cards: [
    { id: 'card-uv', bankId: 'bank-nu', name: 'Ultravioleta', limit: 500000, invoice: 84300 },
    { id: 'card-click', bankId: 'bank-itau', name: 'Click', limit: 250000, invoice: 21500 },
  ],
  purchases: [
    { id: 'pur-note', cardId: 'card-uv', creditor: null, name: 'Notebook', installmentAmount: 10000, totalInstallments: 10, paidInstallments: 3, startYm: ym(-3) },
    { id: 'pur-cel', cardId: 'card-uv', creditor: null, name: 'Celular', installmentAmount: 25000, totalInstallments: 12, paidInstallments: 10, startYm: ym(-10) },
    { id: 'pur-sofa', cardId: 'card-click', creditor: null, name: 'Sofá', installmentAmount: 15000, totalInstallments: 6, paidInstallments: 6, startYm: ym(-6) },
    // Avulsa (R3 §2): entra em Compromissos, não consome limite de cartão
    { id: 'pur-emp', cardId: null, creditor: 'Banco Itaú', name: 'Empréstimo pessoal', installmentAmount: 32000, totalInstallments: 24, paidInstallments: 7, startYm: ym(-7) },
  ],
  // ── Movimentos do ledger (R4 §1) ────────────────────────────────────────
  salaryCredits: [
    { id: 'sc-0', ym: ym(0), date: day(0, 5), bankId: 'bank-nu', amount: 320000 },
  ],
  transfers: [
    { id: 'tr-1', date: day(0, 11), fromBankId: 'bank-nu', toBankId: 'bank-itau', amount: 50000 },
  ],
  adjustments: [
    // O exemplo da spec: o extrato do banco mostrava R$ 137,50 a mais
    { id: 'adj-1', date: day(0, 14), bankId: 'bank-nu', amount: 13750, note: 'Ajuste de conciliação' },
  ],
  invoicePayments: [
    // Fatura do mês passado paga pela conta: é assim que o dinheiro do cartão
    // sai do saldo — uma vez só, no pagamento (§1.7)
    { id: 'ip-1', date: day(0, 9), cardId: 'card-uv', bankId: 'bank-nu', amount: 76000 },
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
    { id: 'box-reserva', icon: 'lifebuoy', name: 'Reserva de emergência', target: 250000, investmentId: 'inv-cdb', manualAmount: 0, celebrated: false },
    { id: 'box-viagem', icon: 'plane', name: 'Viagem pro Chile', target: 600000, investmentId: 'inv-tesouro', manualAmount: 0, celebrated: false },
    { id: 'box-pc', icon: 'laptop', name: 'PC novo', target: 450000, investmentId: null, manualAmount: 120000, celebrated: false },
  ],
  recurringExpenses: [
    {
      id: 'rec-1', categoryId: 'cat-casa', description: 'Luz + internet', amount: 42000,
      essential: true, dayOfMonth: 8, startYm: ym(0), endYm: null,
    },
  ],
  recurringIncomes: [],
  meta: {
    createdAt: ym(-11) + '-01',
    lastManualExport: '2026-07-16',
    categoriesOnboarded: true,
    lastRecurringYm: ym(0),
    lastSalaryCreditYm: ym(0),
  },
}

fs.writeFileSync(path.join(dest, 'zent-data.json'), JSON.stringify(data, null, 2))
console.log(`Demo salvo em ${path.join(dest, 'zent-data.json')}`)
