import { describe, expect, it } from 'vitest'
import { migrate } from '@/data/migrations'
import { zentDataSchema } from '@/data/schema'

/** Arquivo v1 realista (formato da primeira versão entregue). */
function v1Data(): Record<string, unknown> {
  return {
    version: 1,
    profile: { name: 'Allan' },
    rates: { selic: 14.25, cdi: 14.15, ipca: 4.64, updatedAt: '2026-07-16' },
    salaryHistory: [{ id: 's1', startYm: '2026-07', amount: 320000 }],
    extraIncomes: [{ id: 'x1', date: '2026-07-02', description: 'Freela', amount: 40000 }],
    categories: [{ id: 'c1', name: 'Mercado', color: '#2fd680', monthlyLimit: null }],
    expenses: [
      { id: 'e1', date: '2026-07-03', categoryId: 'c1', description: '', amount: 15000, essential: true },
    ],
    banks: [{ id: 'b1', name: 'Nubank', color: '#820AD1', balance: 0 }],
    cards: [{ id: 'k1', bankId: 'b1', name: 'Ultra', limit: 500000, invoice: 0 }],
    purchases: [
      {
        id: 'p1', cardId: 'k1', name: 'Notebook', installmentAmount: 10000,
        totalInstallments: 10, paidInstallments: 0, startYm: '2026-07',
      },
    ],
    investments: [{ id: 'i1', name: 'CDB', bankId: 'b1', rateType: 'cdi', rateParam: 102 }],
    contributions: [{ id: 'a1', investmentId: 'i1', date: '2026-07-05', amount: 100000 }],
    boxes: [
      {
        id: 'x1', emoji: '🛟', name: 'Reserva', target: 250000,
        investmentId: null, manualAmount: 0, celebrated: false,
      },
    ],
    meta: { createdAt: '2026-07-16', lastManualExport: null, categoriesOnboarded: true },
  }
}

describe('migração de dados v1 → v2', () => {
  it('migra um arquivo v1 completo e passa na validação do schema v2', () => {
    const migrated = migrate(v1Data())
    const parsed = zentDataSchema.parse(migrated)
    expect(parsed.version).toBe(2)
    expect(parsed.investments[0]?.valueUpdates).toEqual([])
    expect(parsed.recurringExpenses).toEqual([])
    expect(parsed.recurringIncomes).toEqual([])
    expect(parsed.meta.lastRecurringYm).toBeNull()
    // dados v1 preservados intactos
    expect(parsed.expenses[0]?.amount).toBe(15000)
    expect(parsed.purchases[0]?.totalInstallments).toBe(10)
  })

  it('arquivo já em v2 passa direto sem alterações', () => {
    const v2 = zentDataSchema.parse(migrate(v1Data()))
    const again = zentDataSchema.parse(migrate(v2))
    expect(again).toEqual(v2)
  })

  it('rejeita arquivo de versão futura', () => {
    expect(() => migrate({ version: 99 })).toThrow(/mais novo/)
  })

  it('rejeita arquivo sem versão', () => {
    expect(() => migrate({})).toThrow(/version/)
  })
})
