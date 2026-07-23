import { describe, expect, it } from 'vitest'
import { DATA_VERSION, type ZentData } from '@/data/schema'
import { menorSaldoDesde, podeDebitar, saldoDisponivel } from '@/engine/balance'
import {
  InsufficientBalanceError,
  addBoxTransfer,
  addContribution,
  addExpense,
  addTransfer,
} from '@/store/mutations'
import { bankBalances } from '@/engine/ledger'

/**
 * Suficiência de saldo (adendo R10).
 *
 * O invariante central: para QUALQUER sequência de operações da Família A,
 * nenhum saldo de conta em nenhuma data pode ficar negativo. Se ele falhar,
 * existe um caminho de mutação sem validação — exatamente o que os guardas de
 * `mutations.ts` fecham.
 */

function base(over: Partial<ZentData> = {}): ZentData {
  return {
    version: DATA_VERSION,
    profile: { name: 'Alex' },
    rates: { selic: 14.25, cdi: 14.15, ipca: 4.64, updatedAt: '2026-07-16', autoUpdate: true, lastAutoAt: null, overrides: { selic: false, cdi: false, ipca: false } },
    salaryHistory: [],
    salaryConfig: { bankId: null, payDay: 5, autoCredit: true },
    salaryCredits: [],
    extraIncomes: [],
    categories: [{ id: 'c1', name: 'Mercado', color: '#2fd680', monthlyLimit: null }],
    expenses: [],
    banks: [{ id: 'b1', name: 'Nubank', color: '#820AD1', openingBalance: 1_000_00 }],
    cards: [],
    purchases: [],
    investments: [{ id: 'i1', name: 'CDB', bankId: 'b1', rateType: 'cdi', rateParam: 100, valueUpdates: [] }],
    contributions: [],
    boxes: [{ id: 'bx1', icon: 'target', name: 'Reserva', target: 900_00, investmentId: null, manualAmount: 200_00, celebrated: false }],
    boxTransfers: [],
    transfers: [],
    adjustments: [],
    invoicePayments: [],
    budgetReallocations: [],
    recurringExpenses: [],
    recurringIncomes: [],
    gamification: { achievements: [], activeChallenge: null, challengeHistory: [] },
    meta: { createdAt: '2026-01-01', lastManualExport: null, categoriesOnboarded: true, lastRecurringYm: null, lastSalaryCreditYm: null, gamificationOnboarded: true },
    ...over,
  } as ZentData
}

describe('saldoDisponivel — o saldo é DATADO', () => {
  it('soma os movimentos até a data (inclusive)', () => {
    const d = base({
      salaryConfig: { bankId: 'b1', payDay: 5, autoCredit: true },
      salaryCredits: [{ id: 's1', ym: '2026-03', date: '2026-03-05', bankId: 'b1', amount: 500_00 }],
      expenses: [{ id: 'e1', date: '2026-04-10', categoryId: 'c1', description: 'x', amount: 300_00, essential: true, origin: { kind: 'bank', bankId: 'b1' } }],
    })
    // opening 1.000 (datado em createdAt 2026-01-01)
    expect(saldoDisponivel(d, 'b1', '2026-02-01')).toBe(1_000_00)
    // + salário 500 em março
    expect(saldoDisponivel(d, 'b1', '2026-03-31')).toBe(1_500_00)
    // − gasto 300 em abril
    expect(saldoDisponivel(d, 'b1', '2026-05-01')).toBe(1_200_00)
  })

  it('menorSaldoDesde vê o débito futuro que já existe no histórico', () => {
    const d = base({
      expenses: [{ id: 'e1', date: '2026-06-10', categoryId: 'c1', description: 'gasto grande', amount: 950_00, essential: true, origin: { kind: 'bank', bankId: 'b1' } }],
    })
    // hoje (antes de junho) o saldo é 1.000, mas em junho cai para 50 — um débito
    // retroativo em janeiro tem de respeitar esse piso futuro, não o saldo de hoje
    expect(saldoDisponivel(d, 'b1', '2026-01-15')).toBe(1_000_00)
    expect(menorSaldoDesde(d, 'b1', '2026-01-15')).toBe(50_00)
    expect(podeDebitar(d, 'b1', 50_00, '2026-01-15')).toBe(true)
    expect(podeDebitar(d, 'b1', 50_01, '2026-01-15')).toBe(false)
  })
})

describe('Família A — bloqueio duro (adendo R10)', () => {
  it('guardar até o saldo é permitido; um centavo além é recusado', () => {
    const d = base()
    // valor = saldo → zera a conta, permitido (caso de borda 1)
    expect(() =>
      addBoxTransfer(d, { id: 't1', boxId: 'bx1', bankId: 'b1', amount: 1_000_00, date: '2026-07-10', direction: 'in' }),
    ).not.toThrow()
    expect(bankBalances(d).get('b1')).toBe(0)
    // agora a conta está zerada — mais um centavo é recusado
    expect(() =>
      addBoxTransfer(d, { id: 't2', boxId: 'bx1', bankId: 'b1', amount: 1, date: '2026-07-10', direction: 'in' }),
    ).toThrow(InsufficientBalanceError)
  })

  it('valor = saldo + 1 centavo é recusado nas quatro operações', () => {
    const mk = (): ZentData => base()
    const over = 1_000_01
    expect(() => addBoxTransfer(mk(), { id: 't', boxId: 'bx1', bankId: 'b1', amount: over, date: '2026-07-10', direction: 'in' })).toThrow(InsufficientBalanceError)
    expect(() => addContribution(mk(), { id: 'c', investmentId: 'i1', date: '2026-07-10', amount: over, fromBankId: 'b1' })).toThrow(InsufficientBalanceError)
    expect(() => addTransfer(mk(), { id: 'tr', date: '2026-07-10', fromBankId: 'b1', toBankId: 'b1x', amount: over })).toThrow(InsufficientBalanceError)
    // resgatar mais do que o guardado (200) também barra
    expect(() => addBoxTransfer(mk(), { id: 'r', boxId: 'bx1', bankId: 'b1', amount: 200_01, date: '2026-07-10', direction: 'out' })).toThrow(InsufficientBalanceError)
  })

  it('o erro carrega o disponível real, para a UI mostrar o motivo', () => {
    const d = base()
    try {
      addTransfer(d, { id: 'tr', date: '2026-07-10', fromBankId: 'b1', toBankId: 'b2', amount: 1_500_00 })
      expect.unreachable('deveria ter lançado')
    } catch (e) {
      expect(e).toBeInstanceOf(InsufficientBalanceError)
      expect((e as InsufficientBalanceError).available).toBe(1_000_00)
    }
  })

  it('aporte SEM conta de origem (fromBankId null) não é validado — não debita nada', () => {
    const d = base()
    expect(() => addContribution(d, { id: 'c', investmentId: 'i1', date: '2026-07-10', amount: 9_999_00, fromBankId: null })).not.toThrow()
  })

  it('duas operações no mesmo dia: a segunda vê o saldo já debitado pela primeira', () => {
    const d = base() // b1 = 1.000
    addBoxTransfer(d, { id: 't1', boxId: 'bx1', bankId: 'b1', amount: 700_00, date: '2026-07-10', direction: 'in' })
    // sobrou 300 — guardar mais 400 tem de barrar
    expect(() => addBoxTransfer(d, { id: 't2', boxId: 'bx1', bankId: 'b1', amount: 400_00, date: '2026-07-10', direction: 'in' })).toThrow(InsufficientBalanceError)
    // mas 300 passa (zera)
    expect(() => addBoxTransfer(d, { id: 't3', boxId: 'bx1', bankId: 'b1', amount: 300_00, date: '2026-07-10', direction: 'in' })).not.toThrow()
  })

  it('retroativo que negativaria um dia intermediário é recusado', () => {
    // conta zera em junho por um gasto; um Guardar retroativo em janeiro que
    // deixasse junho negativo é barrado, mesmo com saldo de hoje positivo
    const d = base({
      expenses: [{ id: 'e1', date: '2026-06-10', categoryId: 'c1', description: 'x', amount: 990_00, essential: true, origin: { kind: 'bank', bankId: 'b1' } }],
    })
    // piso futuro = 10; guardar 20 em janeiro negativa junho → recusado
    expect(() => addBoxTransfer(d, { id: 't', boxId: 'bx1', bankId: 'b1', amount: 20_00, date: '2026-01-15', direction: 'in' })).toThrow(InsufficientBalanceError)
    // guardar 10 (= piso) passa
    expect(() => addBoxTransfer(d, { id: 't2', boxId: 'bx1', bankId: 'b1', amount: 10_00, date: '2026-01-15', direction: 'in' })).not.toThrow()
  })
})

describe('Família B — gasto NÃO bloqueia (só avisa; a UI confirma)', () => {
  it('um gasto pela conta pode deixar o saldo negativo', () => {
    const d = base() // b1 = 1.000
    expect(() =>
      addExpense(d, { id: 'e1', date: '2026-07-10', categoryId: 'c1', description: 'compra grande', amount: 1_500_00, essential: true, origin: { kind: 'bank', bankId: 'b1' } }),
    ).not.toThrow()
    expect(bankBalances(d).get('b1')).toBe(-500_00) // negativo permitido, exibido em coral pela UI
  })
})

describe('INVARIANTE de propriedade — nenhum saldo negativo em Família A', () => {
  it('qualquer sequência de operações da Família A mantém todo saldo ≥ 0', () => {
    // Gera muitas sequências pseudo-aleatórias (determinísticas) de Guardar,
    // aportar e transferir; cada op ou é aceita (e o saldo continua ≥ 0) ou é
    // recusada (InsufficientBalanceError) — nunca uma op aceita negativa a conta.
    let seed = 12345
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let run = 0; run < 200; run++) {
      const d = base({
        banks: [
          { id: 'b1', name: 'A', color: '#111', openingBalance: 500_00 },
          { id: 'b2', name: 'B', color: '#222', openingBalance: 300_00 },
        ],
      })
      for (let i = 0; i < 30; i++) {
        const valor = Math.floor(rand() * 400_00) + 1
        const bank = rand() < 0.5 ? 'b1' : 'b2'
        const kind = Math.floor(rand() * 3)
        try {
          if (kind === 0) addBoxTransfer(d, { id: `t${run}-${i}`, boxId: 'bx1', bankId: bank, amount: valor, date: '2026-07-10', direction: 'in' })
          else if (kind === 1) addContribution(d, { id: `c${run}-${i}`, investmentId: 'i1', date: '2026-07-10', amount: valor, fromBankId: bank })
          else addTransfer(d, { id: `tr${run}-${i}`, date: '2026-07-10', fromBankId: bank, toBankId: bank === 'b1' ? 'b2' : 'b1', amount: valor })
        } catch (e) {
          expect(e).toBeInstanceOf(InsufficientBalanceError)
        }
        // O invariante: NENHUM saldo pode estar negativo depois de qualquer op.
        for (const [, bal] of bankBalances(d)) expect(bal).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
