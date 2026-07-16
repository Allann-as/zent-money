import { describe, expect, it } from 'vitest'
import type { RecurringExpense, RecurringIncome } from '@/data/schema'
import { materializeRecurrences, recurrenceDate } from '@/engine/recurring'
import { daysInYm } from '@/engine/dates'

const rentTemplate: RecurringExpense = {
  id: 'r1',
  categoryId: 'casa',
  description: 'Aluguel',
  amount: 120_000,
  essential: true,
  dayOfMonth: 5,
  startYm: '2026-01',
  endYm: null,
}

const salaryExtra: RecurringIncome = {
  id: 'r2',
  description: 'Mesada streaming',
  amount: 5_000,
  dayOfMonth: 31,
  startYm: '2026-01',
  endYm: '2026-03',
}

describe('lançamentos recorrentes', () => {
  it('materializa um lançamento por mês decorrido', () => {
    const out = materializeRecurrences([rentTemplate], [], '2026-04', '2026-07')
    expect(out.expenses).toHaveLength(3) // mai, jun, jul
    expect(out.expenses.map((e) => e.date)).toEqual(['2026-05-05', '2026-06-05', '2026-07-05'])
    expect(out.expenses[0]?.recurringId).toBe('r1')
    expect(out.lastYm).toBe('2026-07')
  })

  it('primeira execução (lastYm null) só inicializa o marcador', () => {
    const out = materializeRecurrences([rentTemplate], [salaryExtra], null, '2026-07')
    expect(out.expenses).toHaveLength(0)
    expect(out.incomes).toHaveLength(0)
    expect(out.lastYm).toBe('2026-07')
  })

  it('nada a fazer quando já está no mês atual', () => {
    const out = materializeRecurrences([rentTemplate], [], '2026-07', '2026-07')
    expect(out.expenses).toHaveLength(0)
  })

  it('cruza a virada de ano', () => {
    const out = materializeRecurrences([rentTemplate], [], '2026-11', '2027-02')
    expect(out.expenses.map((e) => e.date)).toEqual(['2026-12-05', '2027-01-05', '2027-02-05'])
  })

  it('dia 31 em mês curto usa o último dia (inclusive fevereiro)', () => {
    expect(recurrenceDate('2026-02', 31)).toBe('2026-02-28')
    expect(recurrenceDate('2028-02', 31)).toBe('2028-02-29') // bissexto
    expect(recurrenceDate('2026-04', 31)).toBe('2026-04-30')
    expect(recurrenceDate('2026-01', 31)).toBe('2026-01-31')
    expect(daysInYm('2100-02')).toBe(28) // 2100 NÃO é bissexto
  })

  it('respeita startYm e endYm do template', () => {
    const out = materializeRecurrences([], [salaryExtra], '2025-12', '2026-06')
    // ativo apenas jan–mar/2026
    expect(out.incomes.map((i) => i.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })
})
