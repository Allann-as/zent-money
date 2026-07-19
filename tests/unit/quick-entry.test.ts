import { describe, expect, it } from 'vitest'
import { buildQuickExpense } from '@/store/quickActions'
import { addExpense } from '@/store/mutations'
import { bankBalances } from '@/engine/ledger'
import { createSeedData } from '@/data/seed'

/**
 * Lançamento rápido da bandeja (M5). A mini não tem store: manda o payload e o
 * app monta o `Expense`. Aqui provamos o formato e que um gasto com origem-banco
 * debita o saldo daquele banco (reflete na origem), como um gasto normal.
 */
describe('lançamento rápido (M5)', () => {
  it('monta o Expense: data=hoje, essential=true, origem preservada', () => {
    const e = buildQuickExpense(
      { amount: 5000, categoryId: 'c1', description: 'Café', origin: { kind: 'bank', bankId: 'b1' } },
      'id-1',
      '2026-07-18',
    )
    expect(e).toEqual({
      id: 'id-1',
      date: '2026-07-18',
      categoryId: 'c1',
      description: 'Café',
      amount: 5000,
      essential: true,
      origin: { kind: 'bank', bankId: 'b1' },
    })
  })

  it('sem origem vira gasto sem vínculo (origin null)', () => {
    const e = buildQuickExpense({ amount: 900, categoryId: 'c1', description: '', origin: null }, 'id-2', '2026-07-18')
    expect(e.origin).toBeNull()
  })

  it('gasto rápido com origem-banco debita o saldo daquele banco', () => {
    const data = createSeedData()
    const bank = data.banks[0]
    expect(bank).toBeDefined()
    if (!bank) return
    const before = bankBalances(data).get(bank.id) ?? 0
    addExpense(
      data,
      buildQuickExpense(
        { amount: 5000, categoryId: 'x', description: 'Lanche', origin: { kind: 'bank', bankId: bank.id } },
        'q1',
        '2026-07-18',
      ),
    )
    const after = bankBalances(data).get(bank.id) ?? 0
    expect(after).toBe(before - 5000)
  })
})
