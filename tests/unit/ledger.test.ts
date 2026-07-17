import { describe, expect, it } from 'vitest'
import type { ZentData } from '@/data/schema'
import {
  bankBalance,
  bankBalances,
  bankMovements,
  isLedgerLinked,
  materializeSalaryCredits,
  pendingSalaryCredits,
  salaryCreditDate,
  totalInAccounts,
} from '@/engine/ledger'
import { standaloneMonthlyCommitment, totalInvoices, totalMonthlyCommitment } from '@/engine/cards'

/**
 * Ledger híbrido (R4 §1). O que estes testes protegem é a promessa central da
 * release: o saldo é derivado dos movimentos e o histórico fecha a conta.
 */

/** Base v7 mínima com dois bancos e um cartão. */
function baseData(over: Partial<ZentData> = {}): ZentData {
  return {
    version: 7,
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
    salaryConfig: { bankId: null, payDay: 5, autoCredit: true },
    extraIncomes: [],
    categories: [{ id: 'c1', name: 'Mercado', color: '#2fd680', monthlyLimit: null }],
    expenses: [],
    banks: [
      { id: 'b1', name: 'Nubank', color: '#820AD1', openingBalance: 0 },
      { id: 'b2', name: 'Itaú', color: '#EC7000', openingBalance: 500_00 },
    ],
    cards: [{ id: 'k1', bankId: 'b1', name: 'Ultra', limit: 5_000_00, invoice: 0 }],
    purchases: [],
    salaryCredits: [],
    transfers: [],
    adjustments: [],
    invoicePayments: [],
    investments: [],
    contributions: [],
    boxes: [],
    recurringExpenses: [],
    recurringIncomes: [],
    meta: {
      createdAt: '2026-01-01',
      lastManualExport: null,
      categoriesOnboarded: true,
      lastRecurringYm: null,
      lastSalaryCreditYm: null,
    },
    ...over,
  }
}

function expense(id: string, amount: number, origin: ZentData['expenses'][number]['origin']): ZentData['expenses'][number] {
  return { id, date: '2026-07-10', categoryId: 'c1', description: id, amount, essential: true, origin }
}

describe('saldo derivado (R4 §1)', () => {
  it('sem movimento nenhum, o saldo é o ponto de partida — o app de antes, intacto', () => {
    const d = baseData()
    expect(bankBalance(d, 'b1')).toBe(0)
    expect(bankBalance(d, 'b2')).toBe(500_00)
    expect(totalInAccounts(d)).toBe(500_00)
    expect(isLedgerLinked(d)).toBe(false)
  })

  it('o problema central da release: entrou R$ 2.000 e "Em conta" reflete', () => {
    const d = baseData({
      salaryCredits: [{ id: 'sc1', ym: '2026-07', date: '2026-07-05', bankId: 'b1', amount: 2_000_00 }],
    })
    expect(bankBalance(d, 'b1')).toBe(2_000_00)
    expect(totalInAccounts(d)).toBe(2_500_00)
  })

  it('gasto pago pela CONTA debita o saldo dela', () => {
    const d = baseData({ expenses: [expense('e1', 150_00, { kind: 'bank', bankId: 'b2' })] })
    expect(bankBalance(d, 'b2')).toBe(350_00)
  })

  it('gasto pago com CARTÃO não debita conta nenhuma — vira fatura (§1.7)', () => {
    const d = baseData({ expenses: [expense('e1', 150_00, { kind: 'card', cardId: 'k1' })] })
    expect(bankBalance(d, 'b1')).toBe(0)
    expect(bankBalance(d, 'b2')).toBe(500_00)
  })

  it('gasto SEM origem não move saldo algum (retrocompatibilidade, §1.6)', () => {
    const d = baseData({ expenses: [expense('e1', 150_00, null)] })
    expect(totalInAccounts(d)).toBe(500_00)
  })

  it('extra "recebido em" credita; sem vínculo, não move nada', () => {
    const d = baseData({
      extraIncomes: [
        { id: 'x1', date: '2026-07-02', description: 'Freela', amount: 400_00, receivedIn: 'b1' },
        { id: 'x2', date: '2026-07-03', description: 'Presente', amount: 100_00, receivedIn: null },
      ],
    })
    expect(bankBalance(d, 'b1')).toBe(400_00)
    expect(totalInAccounts(d)).toBe(900_00)
  })

  it('transferência sai de uma conta e entra na outra — o total não muda', () => {
    const d = baseData({
      transfers: [{ id: 't1', date: '2026-07-10', fromBankId: 'b2', toBankId: 'b1', amount: 200_00 }],
    })
    expect(bankBalance(d, 'b2')).toBe(300_00)
    expect(bankBalance(d, 'b1')).toBe(200_00)
    expect(totalInAccounts(d)).toBe(500_00)
  })

  it('pagamento de fatura debita a conta que pagou', () => {
    const d = baseData({
      invoicePayments: [{ id: 'ip1', date: '2026-07-10', cardId: 'k1', bankId: 'b2', amount: 150_00 }],
    })
    expect(bankBalance(d, 'b2')).toBe(350_00)
  })

  it('ajuste de conciliação leva o saldo ao valor declarado, com sinal', () => {
    const d = baseData({
      adjustments: [
        { id: 'a1', date: '2026-07-16', bankId: 'b1', amount: 137_50, note: 'Ajuste de conciliação' },
        { id: 'a2', date: '2026-07-16', bankId: 'b2', amount: -50_00, note: 'Ajuste de conciliação' },
      ],
    })
    expect(bankBalance(d, 'b1')).toBe(137_50)
    expect(bankBalance(d, 'b2')).toBe(450_00)
  })

  it('movimento apontando para banco excluído é ignorado, não vira saldo fantasma', () => {
    const d = baseData({
      salaryCredits: [{ id: 'sc1', ym: '2026-07', date: '2026-07-05', bankId: 'sumiu', amount: 2_000_00 }],
    })
    expect(totalInAccounts(d)).toBe(500_00)
    expect(bankBalances(d).has('sumiu')).toBe(false)
  })

  it('tudo junto: cada fonte entra uma vez só, na ordem certa', () => {
    const d = baseData({
      salaryCredits: [{ id: 'sc1', ym: '2026-07', date: '2026-07-05', bankId: 'b1', amount: 2_000_00 }],
      extraIncomes: [{ id: 'x1', date: '2026-07-02', description: 'Freela', amount: 400_00, receivedIn: 'b1' }],
      expenses: [
        expense('e1', 150_00, { kind: 'bank', bankId: 'b1' }),
        expense('e2', 300_00, { kind: 'card', cardId: 'k1' }), // não toca a conta
      ],
      transfers: [{ id: 't1', date: '2026-07-10', fromBankId: 'b1', toBankId: 'b2', amount: 100_00 }],
      invoicePayments: [{ id: 'ip1', date: '2026-07-12', cardId: 'k1', bankId: 'b1', amount: 300_00 }],
      adjustments: [{ id: 'a1', date: '2026-07-16', bankId: 'b1', amount: 50_00, note: 'Ajuste de conciliação' }],
    })
    // 0 + 2000 + 400 − 150 − 100 − 300 + 50
    expect(bankBalance(d, 'b1')).toBe(1_900_00)
    expect(bankBalance(d, 'b2')).toBe(600_00)
  })

  it('isLedgerLinked detecta cada forma de vincular', () => {
    expect(isLedgerLinked(baseData())).toBe(false)
    expect(isLedgerLinked(baseData({ salaryConfig: { bankId: 'b1', payDay: 5, autoCredit: true } }))).toBe(true)
    expect(
      isLedgerLinked(baseData({ expenses: [expense('e1', 100, { kind: 'bank', bankId: 'b1' })] })),
    ).toBe(true)
    // origem-cartão sozinha NÃO liga o ledger: nenhuma conta se move por ela
    expect(
      isLedgerLinked(baseData({ expenses: [expense('e1', 100, { kind: 'card', cardId: 'k1' })] })),
    ).toBe(false)
  })
})

describe('histórico da conta fecha o saldo (R4 §1)', () => {
  const d = baseData({
    banks: [{ id: 'b1', name: 'Nubank', color: '#820AD1', openingBalance: 100_00 }],
    salaryCredits: [{ id: 'sc1', ym: '2026-07', date: '2026-07-05', bankId: 'b1', amount: 2_000_00 }],
    expenses: [expense('e1', 150_00, { kind: 'bank', bankId: 'b1' })],
    adjustments: [{ id: 'a1', date: '2026-07-16', bankId: 'b1', amount: 37_50, note: 'Ajuste de conciliação' }],
  })

  it('a soma dos movimentos é exatamente o saldo derivado', () => {
    const total = bankMovements(d, 'b1').reduce((a, m) => a + m.amount, 0)
    expect(total).toBe(bankBalance(d, 'b1'))
    expect(total).toBe(1_987_50)
  })

  it('inclui o saldo inicial como movimento e ordena do mais recente para o mais antigo', () => {
    const ms = bankMovements(d, 'b1')
    expect(ms.map((m) => m.kind)).toEqual(['adjustment', 'expense', 'salary', 'opening'])
    expect(ms[ms.length - 1]?.amount).toBe(100_00)
  })

  it('transferência aparece nas DUAS contas, com sinais opostos', () => {
    const t = baseData({
      transfers: [{ id: 't1', date: '2026-07-10', fromBankId: 'b1', toBankId: 'b2', amount: 200_00 }],
    })
    expect(bankMovements(t, 'b1').find((m) => m.kind === 'transfer-out')?.amount).toBe(-200_00)
    expect(bankMovements(t, 'b2').find((m) => m.kind === 'transfer-in')?.amount).toBe(200_00)
  })

  it('gasto no cartão não aparece no histórico da conta; o pagamento da fatura sim', () => {
    const t = baseData({
      expenses: [expense('e1', 300_00, { kind: 'card', cardId: 'k1' })],
      invoicePayments: [{ id: 'ip1', date: '2026-07-12', cardId: 'k1', bankId: 'b1', amount: 300_00 }],
    })
    const kinds = bankMovements(t, 'b1').map((m) => m.kind)
    expect(kinds).not.toContain('expense')
    expect(kinds).toContain('invoice')
  })

  it('banco inexistente devolve histórico vazio em vez de quebrar', () => {
    expect(bankMovements(d, 'nao-existe')).toEqual([])
  })
})

describe('crédito automático do salário (R4 §1.1)', () => {
  it('sem conta vinculada, não credita nada — o app de quem não quer ledger', () => {
    const { credits } = materializeSalaryCredits(baseData(), '2026-07-16')
    expect(credits).toEqual([])
  })

  it('credita o mês corrente quando o dia de pagamento já passou', () => {
    const d = baseData({ salaryConfig: { bankId: 'b1', payDay: 5, autoCredit: true } })
    const { credits, lastYm } = materializeSalaryCredits(d, '2026-07-16')
    expect(credits).toEqual([{ ym: '2026-07', date: '2026-07-05', bankId: 'b1', amount: 2_000_00 }])
    expect(lastYm).toBe('2026-07')
  })

  it('NÃO credita antes do dia — e credita quando o dia chega', () => {
    const d = baseData({ salaryConfig: { bankId: 'b1', payDay: 20, autoCredit: true } })
    expect(materializeSalaryCredits(d, '2026-07-16').credits).toEqual([])
    expect(materializeSalaryCredits(d, '2026-07-20').credits).toHaveLength(1)
  })

  it('não inventa passado: meses anteriores à configuração nunca são creditados', () => {
    const d = baseData({ salaryConfig: { bankId: 'b1', payDay: 5, autoCredit: true } })
    const { credits } = materializeSalaryCredits(d, '2026-07-16')
    // junho e maio existem no histórico de salário, mas o marcador nasce em julho
    expect(credits.map((c) => c.ym)).toEqual(['2026-07'])
  })

  it('cobre os meses decorridos desde o último boot', () => {
    const d = baseData({
      salaryConfig: { bankId: 'b1', payDay: 5, autoCredit: true },
      meta: { ...baseData().meta, lastSalaryCreditYm: '2026-04' },
    })
    const { credits, lastYm } = materializeSalaryCredits(d, '2026-07-16')
    expect(credits.map((c) => c.ym)).toEqual(['2026-05', '2026-06', '2026-07'])
    expect(lastYm).toBe('2026-07')
  })

  it('não duplica um crédito que já existe', () => {
    const d = baseData({
      salaryConfig: { bankId: 'b1', payDay: 5, autoCredit: true },
      salaryCredits: [{ id: 'sc1', ym: '2026-07', date: '2026-07-05', bankId: 'b1', amount: 2_000_00 }],
      meta: { ...baseData().meta, lastSalaryCreditYm: '2026-06' },
    })
    expect(materializeSalaryCredits(d, '2026-07-16').credits).toEqual([])
  })

  it('crédito desfeito não volta no próximo boot (o marcador segura)', () => {
    const d = baseData({
      salaryConfig: { bankId: 'b1', payDay: 5, autoCredit: true },
      salaryCredits: [], // o usuário desfez
      meta: { ...baseData().meta, lastSalaryCreditYm: '2026-07' }, // mas o mês já foi processado
    })
    expect(materializeSalaryCredits(d, '2026-07-16').credits).toEqual([])
  })

  it('autoCredit desligado não credita; a fila de confirmação é que aparece', () => {
    const d = baseData({ salaryConfig: { bankId: 'b1', payDay: 5, autoCredit: false } })
    expect(materializeSalaryCredits(d, '2026-07-16').credits).toEqual([])
    expect(pendingSalaryCredits(d, '2026-07-16')).toEqual(['2026-07'])
  })

  it('com autoCredit ligado não há fila de confirmação', () => {
    const d = baseData({ salaryConfig: { bankId: 'b1', payDay: 5, autoCredit: true } })
    expect(pendingSalaryCredits(d, '2026-07-16')).toEqual([])
  })

  it('mês sem salário vigente é pulado', () => {
    const d = baseData({
      salaryHistory: [],
      salaryConfig: { bankId: 'b1', payDay: 5, autoCredit: true },
    })
    expect(materializeSalaryCredits(d, '2026-07-16').credits).toEqual([])
  })

  it('conta vinculada que foi excluída não gera crédito órfão', () => {
    const d = baseData({ salaryConfig: { bankId: 'sumiu', payDay: 5, autoCredit: true } })
    expect(materializeSalaryCredits(d, '2026-07-16').credits).toEqual([])
  })

  it('dia 31 vira o último dia do mês (fev de 2027, não bissexto)', () => {
    expect(salaryCreditDate('2027-02', 31)).toBe('2027-02-28')
    expect(salaryCreditDate('2026-07', 31)).toBe('2026-07-31')
    expect(salaryCreditDate('2028-02', 31)).toBe('2028-02-29')
    expect(salaryCreditDate('2026-07', 5)).toBe('2026-07-05')
  })
})

describe('zero dupla contagem em Compromissos (R4 §1.7)', () => {
  /**
   * A regra: Compromissos = faturas abertas + parcelas de cartão + avulsas.
   * Gastos NUNCA entram — nem os de cartão (a fatura, digitada pelo usuário, já
   * os inclui) nem os de conta (esses já saíram do saldo).
   */
  const d = baseData({
    cards: [{ id: 'k1', bankId: 'b1', name: 'Ultra', limit: 5_000_00, invoice: 800_00 }],
    purchases: [
      { id: 'p1', cardId: 'k1', creditor: null, name: 'Notebook', installmentAmount: 100_00, totalInstallments: 10, paidInstallments: 0, startYm: '2026-07' },
      { id: 'p2', cardId: null, creditor: 'Banco X', name: 'Empréstimo', installmentAmount: 250_00, totalInstallments: 12, paidInstallments: 0, startYm: '2026-07' },
    ],
    expenses: [
      expense('e1', 300_00, { kind: 'card', cardId: 'k1' }),
      expense('e2', 150_00, { kind: 'bank', bankId: 'b1' }),
    ],
  })

  it('cada real entra uma vez só: faturas + parcelas de cartão + avulsas', () => {
    const invoices = totalInvoices(d.cards)
    const standalone = standaloneMonthlyCommitment(d.purchases)
    const cardCommit = totalMonthlyCommitment(d.purchases) - standalone
    const commitments = invoices + cardCommit + standalone
    expect(invoices).toBe(800_00)
    expect(cardCommit).toBe(100_00)
    expect(standalone).toBe(250_00)
    expect(commitments).toBe(1_150_00)
  })

  it('os gastos do mês não inflam Compromissos, nem o de cartão nem o de conta', () => {
    const spent = d.expenses.reduce((a, e) => a + e.amount, 0)
    const standalone = standaloneMonthlyCommitment(d.purchases)
    const commitments = totalInvoices(d.cards) + (totalMonthlyCommitment(d.purchases) - standalone) + standalone
    expect(spent).toBe(450_00)
    // o gasto de cartão está DENTRO da fatura de 800, não somado a ela
    expect(commitments).toBe(1_150_00)
  })

  it('o gasto de cartão sai da conta uma vez só — quando a fatura é paga', () => {
    // sem pagamento: nada saiu da conta
    expect(bankBalance(d, 'b1')).toBe(-150_00) // só o gasto de conta
    const pago = baseData({
      ...d,
      banks: [{ id: 'b1', name: 'Nubank', color: '#820AD1', openingBalance: 1_000_00 }],
      invoicePayments: [{ id: 'ip1', date: '2026-07-20', cardId: 'k1', bankId: 'b1', amount: 800_00 }],
    })
    // 1000 − 150 (gasto de conta) − 800 (fatura). O gasto de 300 no cartão
    // saiu junto com a fatura, não em dobro.
    expect(bankBalance(pago, 'b1')).toBe(50_00)
  })
})
