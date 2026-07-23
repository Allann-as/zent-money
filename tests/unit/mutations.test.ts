import { describe, expect, it } from 'vitest'
import { DATA_VERSION, type ZentData } from '@/data/schema'
import {
  addAdjustment,
  addBoxTransfer,
  addBudgetReallocation,
  addContribution,
  addExpense,
  addExtraIncome,
  addInvoicePayment,
  addPurchase,
  addSalaryCredit,
  addTransfer,
  removeAdjustment,
  removeBoxTransfer,
  removeBudgetReallocation,
  removeContribution,
  removeExpense,
  removeExtraIncome,
  removeInvoicePayment,
  removePurchase,
  removeSalaryCredit,
  removeTransfer,
  payInstallment,
  unpayInstallment,
} from '@/store/mutations'
import { bankBalances, boxStoredAmount, totalInAccounts } from '@/engine/ledger'
import { expensesByCategory, incomeByMonth } from '@/engine/aggregations'
import { effectiveLimit } from '@/engine/budget'
import {
  availableLimit,
  standaloneMonthlyCommitment,
  totalInvoices,
  totalMonthlyCommitment,
} from '@/engine/cards'

/**
 * Invariante de integridade do ledger (M1 §a): **criar→excluir é neutro**.
 *
 * Para QUALQUER tipo de lançamento, criar o evento e depois excluí-lo tem de
 * devolver o app exatamente ao estado anterior. O teste exercita a fonte única
 * `store/mutations` — a MESMA função que a UI chama — e não uma reencenação dela;
 * é isso que faz a invariante valer no produto, e não só no teste.
 *
 * Seguindo a lição do smoke test da R3 ("um teste só vale depois de vê-lo falhar
 * contra o bug que ele afirma pegar"), o bloco final sabota uma reversão de
 * propósito e prova que o verificador a pega.
 */

const MONTH = '2026-07'

/** Base v7 com dois bancos, um cartão e uma aplicação — o palco dos lançamentos. */
function baseData(over: Partial<ZentData> = {}): ZentData {
  return {
    version: DATA_VERSION,
    profile: { name: 'Allan' },
    rates: {
      selic: 14.25,
      cdi: 14.15,
      ipca: 4.64,
      updatedAt: '2026-07-16',
      autoUpdate: true,
      lastAutoAt: null,
      overrides: { selic: false, cdi: false, ipca: false },
    },
    salaryHistory: [{ id: 's1', startYm: '2026-01', amount: 2_000_00 }],
    salaryConfig: { bankId: 'b1', payDay: 5, autoCredit: true },
    extraIncomes: [],
    categories: [{ id: 'c1', name: 'Mercado', color: '#2fd680', monthlyLimit: null }],
    budgetReallocations: [],
    expenses: [],
    banks: [
      { id: 'b1', name: 'Nubank', color: '#820AD1', openingBalance: 1_000_00 },
      { id: 'b2', name: 'Itaú', color: '#EC7000', openingBalance: 500_00 },
    ],
    cards: [{ id: 'k1', bankId: 'b1', name: 'Ultra', limit: 5_000_00, invoice: 800_00 }],
    purchases: [],
    salaryCredits: [],
    transfers: [],
    adjustments: [],
    invoicePayments: [],
    investments: [
      { id: 'i1', name: 'Tesouro', bankId: 'b1', rateType: 'selic', rateParam: 0, valueUpdates: [] },
    ],
    contributions: [],
    boxes: [{ id: 'box1', icon: 'target', name: 'Reserva', target: 500_00, investmentId: null, manualAmount: 300_00, celebrated: false }],
    boxTransfers: [],
    recurringExpenses: [],
    recurringIncomes: [],
    gamification: { achievements: [], activeChallenge: null, challengeHistory: [] },
    meta: {
      createdAt: '2026-01-01',
      lastManualExport: null,
      categoriesOnboarded: true,
      lastRecurringYm: null,
      lastSalaryCreditYm: null,
      gamificationOnboarded: true,
    },
    ...over,
  }
}

/**
 * TODOS os números que o app mostra, num objeto comparável: saldo por banco,
 * "Em conta", entrou/saiu/sobra do mês, faturas, compromissos e investido.
 * Cada um depende de pelo menos um array de lançamento — é o que torna a
 * asserção "o create teve efeito" significativa.
 */
function appNumbers(d: ZentData): Record<string, unknown> {
  const income = incomeByMonth(d.salaryHistory, d.extraIncomes, [MONTH]).get(MONTH) ?? 0
  const spent = [...expensesByCategory(d.expenses, MONTH).values()].reduce((a, b) => a + b, 0)
  const invested = d.contributions.reduce((a, c) => a + c.amount, 0)
  const inAccounts = totalInAccounts(d)
  return {
    balances: [...bankBalances(d).entries()].sort(([a], [b]) => a.localeCompare(b)),
    inAccounts,
    income,
    spent,
    sobra: income - spent,
    invoices: totalInvoices(d.cards),
    commitments: totalMonthlyCommitment(d.purchases),
    standalone: standaloneMonthlyCommitment(d.purchases),
    invested,
    patrimonio: inAccounts + invested,
    boxStored: boxStoredAmount('box1', 300_00, d.boxTransfers),
  }
}

interface Case {
  name: string
  /** Cria o lançamento com um id fixo, via recipe da fonte única. */
  create(d: ZentData): void
  /** Exclui o lançamento pelo mesmo id, via recipe da fonte única. */
  remove(d: ZentData): void
  /**
   * true = o ARQUIVO inteiro volta ao estado anterior. false só no salário, cujo
   * marcador `lastSalaryCreditYm` fica de propósito (não é "número do app").
   */
  fullNeutral: boolean
}

const ID = 'x1'

const cases: Case[] = [
  {
    name: 'gasto sem origem',
    create: (d) =>
      addExpense(d, { id: ID, date: '2026-07-10', categoryId: 'c1', description: 'g', amount: 150_00, essential: true, origin: null }),
    remove: (d) => removeExpense(d, ID),
    fullNeutral: true,
  },
  {
    name: 'gasto com origem-conta',
    create: (d) =>
      addExpense(d, { id: ID, date: '2026-07-10', categoryId: 'c1', description: 'g', amount: 150_00, essential: true, origin: { kind: 'bank', bankId: 'b2' } }),
    remove: (d) => removeExpense(d, ID),
    fullNeutral: true,
  },
  {
    name: 'gasto com origem-cartão',
    create: (d) =>
      addExpense(d, { id: ID, date: '2026-07-10', categoryId: 'c1', description: 'g', amount: 300_00, essential: false, origin: { kind: 'card', cardId: 'k1' } }),
    remove: (d) => removeExpense(d, ID),
    fullNeutral: true,
  },
  {
    name: 'extra recebido em conta',
    create: (d) => addExtraIncome(d, { id: ID, date: '2026-07-02', description: 'Freela', amount: 400_00, receivedIn: 'b1' }),
    remove: (d) => removeExtraIncome(d, ID),
    fullNeutral: true,
  },
  {
    name: 'transferência entre contas',
    create: (d) => addTransfer(d, { id: ID, date: '2026-07-12', fromBankId: 'b2', toBankId: 'b1', amount: 200_00 }),
    remove: (d) => removeTransfer(d, ID),
    fullNeutral: true,
  },
  {
    name: 'salário registrado',
    create: (d) => addSalaryCredit(d, { id: ID, ym: MONTH, date: '2026-07-05', bankId: 'b1', amount: 2_000_00 }),
    remove: (d) => removeSalaryCredit(d, ID),
    fullNeutral: false, // o marcador lastSalaryCreditYm fica de propósito
  },
  {
    name: 'pagamento de fatura (sem estourar)',
    create: (d) => addInvoicePayment(d, { id: ID, date: '2026-07-20', cardId: 'k1', bankId: 'b1', amount: 300_00 }),
    remove: (d) => removeInvoicePayment(d, ID),
    fullNeutral: true,
  },
  {
    name: 'ajuste de conciliação',
    create: (d) => addAdjustment(d, { id: ID, date: '2026-07-16', bankId: 'b1', amount: 137_50, note: 'Ajuste de conciliação' }),
    remove: (d) => removeAdjustment(d, ID),
    fullNeutral: true,
  },
  {
    name: 'aporte',
    create: (d) => addContribution(d, { id: ID, investmentId: 'i1', date: '2026-07-08', amount: 500_00, fromBankId: null }),
    remove: (d) => removeContribution(d, ID),
    fullNeutral: true,
  },
  {
    name: 'aporte com conta de origem (§5)',
    create: (d) => addContribution(d, { id: ID, investmentId: 'i1', date: '2026-07-08', amount: 500_00, fromBankId: 'b1' }),
    remove: (d) => removeContribution(d, ID),
    fullNeutral: true,
  },
  {
    name: 'guardar na caixinha (§4)',
    create: (d) => addBoxTransfer(d, { id: ID, boxId: 'box1', bankId: 'b1', amount: 200_00, date: '2026-07-10', direction: 'in' }),
    remove: (d) => removeBoxTransfer(d, ID),
    fullNeutral: true,
  },
  {
    name: 'resgatar da caixinha (§4)',
    create: (d) => addBoxTransfer(d, { id: ID, boxId: 'box1', bankId: 'b2', amount: 100_00, date: '2026-07-11', direction: 'out' }),
    remove: (d) => removeBoxTransfer(d, ID),
    fullNeutral: true,
  },
  {
    name: 'parcela de cartão',
    create: (d) => addPurchase(d, { id: ID, cardId: 'k1', creditor: null, name: 'Notebook', installmentAmount: 100_00, totalInstallments: 10, paidInstallments: 0, startYm: MONTH }),
    remove: (d) => removePurchase(d, ID),
    fullNeutral: true,
  },
  {
    name: 'parcela avulsa',
    create: (d) => addPurchase(d, { id: ID, cardId: null, creditor: 'Banco X', name: 'Empréstimo', installmentAmount: 250_00, totalInstallments: 12, paidInstallments: 0, startYm: MONTH }),
    remove: (d) => removePurchase(d, ID),
    fullNeutral: true,
  },
]

describe('criar→excluir é neutro (M1 §a)', () => {
  for (const c of cases) {
    it(`${c.name}: criar teve efeito e excluir devolve todos os números`, () => {
      const d = baseData()
      const before = structuredClone(d)
      const beforeNums = appNumbers(d)

      c.create(d)
      // Se o create não mudasse número algum, o teste seria vazio — provamos que mudou.
      expect(appNumbers(d)).not.toEqual(beforeNums)

      c.remove(d)
      expect(appNumbers(d)).toEqual(beforeNums)
      if (c.fullNeutral) expect(d).toEqual(before)
    })
  }

  it('salário: os números voltam, mas o marcador fica de propósito (não é número do app)', () => {
    const d = baseData()
    const beforeNums = appNumbers(d)
    addSalaryCredit(d, { id: ID, ym: MONTH, date: '2026-07-05', bankId: 'b1', amount: 2_000_00 })
    removeSalaryCredit(d, ID)
    expect(appNumbers(d)).toEqual(beforeNums)
    // o marcador avançou e NÃO recuou — é ele que impede o boot de recriar o
    // crédito desfeito (ver materializeSalaryCredits / DECISOES.md R4 §1.1)
    expect(d.meta.lastSalaryCreditYm).toBe(MONTH)
    expect(d.salaryCredits).toHaveLength(0)
  })
})

/**
 * R10 §⑤ — "registrar pagamento da Nª" e o seu desfazer.
 *
 * Não é lançamento de dinheiro (nenhum saldo se move: a parcela de cartão já
 * está na fatura, e a avulsa não tem conta vinculada), então o invariante que
 * importa aqui é outro: **pagar→desfazer devolve o arquivo inteiro**, e o efeito
 * real acontece no LIMITE derivado do cartão.
 */
describe('parcela paga: pagar→desfazer é neutro e devolve o limite (R10 §⑤)', () => {
  function comCompra(): ZentData {
    const d = baseData()
    addPurchase(d, {
      id: 'p1', cardId: 'k1', creditor: null, name: 'Notebook',
      installmentAmount: 100_00, totalInstallments: 10, paidInstallments: 0, startYm: MONTH,
    })
    return d
  }

  it('pagar uma parcela devolve o valor dela ao limite disponível, por derivação', () => {
    const d = comCompra()
    const card = d.cards.find((c) => c.id === 'k1')!
    const antes = availableLimit(card, d.purchases)
    payInstallment(d, 'p1')
    expect(availableLimit(card, d.purchases)).toBe(antes + 100_00)
    expect(totalMonthlyCommitment(d.purchases)).toBe(100_00) // segue devendo 9
  })

  it('pagar→desfazer devolve o arquivo inteiro (e todos os números do app)', () => {
    const d = comCompra()
    const antesArquivo = structuredClone(d)
    const antesNums = appNumbers(d)
    payInstallment(d, 'p1')
    /**
     * O efeito NÃO está em `appNumbers`, e isso é a prova de que a operação não
     * mexe em dinheiro: saldo, renda, gasto, fatura e comprometido do mês seguem
     * iguais (com 9 de 10 parcelas em aberto, o compromisso mensal é o mesmo).
     * O que muda é o contador e, por derivação, o limite disponível — asserido
     * no teste acima.
     */
    expect(appNumbers(d)).toEqual(antesNums)
    expect(d.purchases[0]?.paidInstallments).toBe(1)
    unpayInstallment(d, 'p1')
    expect(appNumbers(d)).toEqual(antesNums)
    expect(d).toEqual(antesArquivo)
  })

  it('nenhum saldo de conta se move — o dinheiro sai no pagamento da fatura', () => {
    const d = comCompra()
    const antesSaldos = [...bankBalances(d).entries()]
    const antesFaturas = totalInvoices(d.cards)
    payInstallment(d, 'p1')
    expect([...bankBalances(d).entries()]).toEqual(antesSaldos)
    // e a fatura também não muda: ela é snapshot manual, não soma de parcelas
    expect(totalInvoices(d.cards)).toBe(antesFaturas)
  })

  it('não passa do total nem desce abaixo de zero (clamp nas duas pontas)', () => {
    const d = comCompra()
    for (let i = 0; i < 15; i++) payInstallment(d, 'p1')
    expect(d.purchases[0]?.paidInstallments).toBe(10)
    for (let i = 0; i < 15; i++) unpayInstallment(d, 'p1')
    expect(d.purchases[0]?.paidInstallments).toBe(0)
  })

  it('id inexistente é no-op, não exceção', () => {
    const d = comCompra()
    const antes = structuredClone(d)
    payInstallment(d, 'nao-existe')
    unpayInstallment(d, 'nao-existe')
    expect(d).toEqual(antes)
  })
})

describe('eventos internos de reversão não aparecem como ganho/gasto (M1 §a)', () => {
  /**
   * Salário, transferência, ajuste e pagamento de fatura movem o SALDO, mas não
   * são "Entrou/Saiu" — não podem vazar para a renda declarada nem para os gastos
   * do mês, senão inflariam entrou/saiu/sobra sem o usuário ter lançado nada.
   */
  it('nenhum movimento de ledger entra em incomeByMonth nem em expensesByCategory', () => {
    const d = baseData()
    const income0 = incomeByMonth(d.salaryHistory, d.extraIncomes, [MONTH]).get(MONTH) ?? 0
    const spent0 = [...expensesByCategory(d.expenses, MONTH).values()].reduce((a, b) => a + b, 0)
    const inAccounts0 = totalInAccounts(d)

    addSalaryCredit(d, { id: 'a', ym: MONTH, date: '2026-07-05', bankId: 'b1', amount: 2_000_00 })
    addTransfer(d, { id: 'b', date: '2026-07-12', fromBankId: 'b2', toBankId: 'b1', amount: 200_00 })
    addAdjustment(d, { id: 'c', date: '2026-07-16', bankId: 'b1', amount: 137_50, note: 'x' })
    addInvoicePayment(d, { id: 'e', date: '2026-07-20', cardId: 'k1', bankId: 'b1', amount: 300_00 })

    // o saldo se moveu…
    expect(totalInAccounts(d)).not.toBe(inAccounts0)
    // …mas renda e gastos do mês continuam intocados
    expect(incomeByMonth(d.salaryHistory, d.extraIncomes, [MONTH]).get(MONTH) ?? 0).toBe(income0)
    expect([...expensesByCategory(d.expenses, MONTH).values()].reduce((a, b) => a + b, 0)).toBe(spent0)
  })
})

describe('realocação de orçamento: criar→desfazer neutro e sem tocar o ledger (M1 §c)', () => {
  it('realocar muda o limite efetivo mas nenhum número de dinheiro; desfazer volta ao base', () => {
    const d = baseData({
      categories: [
        { id: 'c1', name: 'Mercado', color: '#2fd680', monthlyLimit: 200_00 },
        { id: 'c2', name: 'Lazer', color: '#57b6f2', monthlyLimit: 100_00 },
      ],
    })
    const beforeNums = appNumbers(d)

    addBudgetReallocation(d, { id: ID, ym: MONTH, fromCategoryId: 'c1', toCategoryId: 'c2', amount: 50_00 })
    // o orçamento efetivo se moveu…
    expect(effectiveLimit(d.categories[0]!, d.budgetReallocations, MONTH)).toBe(150_00)
    expect(effectiveLimit(d.categories[1]!, d.budgetReallocations, MONTH)).toBe(150_00)
    // …mas NENHUM número de dinheiro mudou: realocação não é movimento de conta
    expect(appNumbers(d)).toEqual(beforeNums)

    removeBudgetReallocation(d, ID)
    expect(effectiveLimit(d.categories[0]!, d.budgetReallocations, MONTH)).toBe(200_00)
    expect(d.budgetReallocations).toHaveLength(0)
    expect(appNumbers(d)).toEqual(beforeNums)
  })
})

describe('o verificador tem dentes: uma reversão sabotada é pega (lição do smoke da R3)', () => {
  it('excluir o pagamento sem devolver o valor à fatura NÃO passa no criar→excluir', () => {
    const d = baseData() // cartão k1 com fatura de R$ 800
    const before = appNumbers(d)

    addInvoicePayment(d, { id: ID, date: '2026-07-20', cardId: 'k1', bankId: 'b1', amount: 300_00 })

    // reversão SABOTADA: apaga o pagamento (a conta volta pelo ledger) mas
    // "esquece" de devolver os R$ 300 à fatura — exatamente o bug que a fonte
    // única evita. O verificador precisa reprovar isto.
    d.invoicePayments = d.invoicePayments.filter((p) => p.id !== ID)

    expect(appNumbers(d)).not.toEqual(before)

    // e a reversão CORRETA (a de verdade) passa — o par vermelho/verde
    const d2 = baseData()
    const before2 = appNumbers(d2)
    addInvoicePayment(d2, { id: ID, date: '2026-07-20', cardId: 'k1', bankId: 'b1', amount: 300_00 })
    removeInvoicePayment(d2, ID)
    expect(appNumbers(d2)).toEqual(before2)
  })
})
