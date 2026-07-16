import { describe, expect, it } from 'vitest'
import type { Expense, ExtraIncome, SalaryEntry } from '@/data/schema'
import {
  essentialSplit,
  expensesByCategory,
  incomeByMonth,
  salaryForYm,
  sumByMonth,
} from '@/engine/aggregations'

function expense(date: string, categoryId: string, amount: number, essential = true): Expense {
  return { id: `e-${date}-${amount}`, date, categoryId, description: '', amount, essential }
}

describe('agregações mensais (passada única)', () => {
  it('sumByMonth agrupa por mês', () => {
    const items = [
      { date: '2026-07-01', amount: 100 },
      { date: '2026-07-20', amount: 50 },
      { date: '2026-06-30', amount: 10 },
    ]
    const map = sumByMonth(items)
    expect(map.get('2026-07')).toBe(150)
    expect(map.get('2026-06')).toBe(10)
    expect(map.get('2026-05')).toBeUndefined()
  })

  it('expensesByCategory soma só o mês pedido', () => {
    const list = [
      expense('2026-07-01', 'mercado', 200_00),
      expense('2026-07-15', 'mercado', 150_00),
      expense('2026-07-10', 'farmacia', 80_00),
      expense('2026-06-10', 'mercado', 999_00),
    ]
    const map = expensesByCategory(list, '2026-07')
    expect(map.get('mercado')).toBe(350_00)
    expect(map.get('farmacia')).toBe(80_00)
    expect(map.size).toBe(2)
  })

  it('necessário × supérfluo com % acionável', () => {
    const list = [
      expense('2026-07-01', 'c', 1_243_00, true),
      expense('2026-07-02', 'c', 157_00, false),
    ]
    const split = essentialSplit(list, '2026-07')
    expect(split.essential).toBe(1_243_00)
    expect(split.superfluous).toBe(157_00)
    expect(split.total).toBe(1_400_00)
    expect(split.superfluousRatio).toBeCloseTo(0.1121, 3)
  })
})

describe('salário com histórico de vigências', () => {
  const history: SalaryEntry[] = [
    { id: 's1', startYm: '2025-01', amount: 2_500_00 },
    { id: 's2', startYm: '2026-05', amount: 3_200_00 },
  ]

  it('mês passado exibe o salário da época', () => {
    expect(salaryForYm(history, '2025-06')).toBe(2_500_00)
    expect(salaryForYm(history, '2026-04')).toBe(2_500_00)
  })

  it('novo valor vale do mês de vigência em diante', () => {
    expect(salaryForYm(history, '2026-05')).toBe(3_200_00)
    expect(salaryForYm(history, '2026-07')).toBe(3_200_00)
  })

  it('antes de qualquer vigência → 0', () => {
    expect(salaryForYm(history, '2024-12')).toBe(0)
    expect(salaryForYm([], '2026-07')).toBe(0)
  })

  it('incomeByMonth soma salário vigente + extras do mês', () => {
    const extras: ExtraIncome[] = [
      { id: 'x1', date: '2026-07-02', description: 'Presente da vó', amount: 150_00 },
      { id: 'x2', date: '2026-07-20', description: 'Freela', amount: 400_00 },
      { id: 'x3', date: '2026-06-01', description: 'Outro mês', amount: 999_00 },
    ]
    const map = incomeByMonth(history, extras, ['2026-06', '2026-07'])
    expect(map.get('2026-07')).toBe(3_200_00 + 550_00)
    expect(map.get('2026-06')).toBe(3_200_00 + 999_00)
  })
})
