import { describe, expect, it } from 'vitest'
import { createSeedData } from '@/data/seed'
import type { Box, Category, Expense, ZentData } from '@/data/schema'
import { XP, xpBreakdown } from '@/engine/xp'

function blank(): ZentData {
  const d = createSeedData()
  d.categories = []
  d.expenses = []
  d.extraIncomes = []
  d.salaryHistory = []
  d.salaryCredits = []
  d.budgetReallocations = []
  d.boxes = []
  return d
}
function exp(id: string, date: string, amount: number, categoryId = 'c'): Expense {
  return { id, date, categoryId, description: '', amount, essential: true, origin: null }
}
function cat(id: string, limit: number | null): Category {
  return { id, name: id, color: '#6fa894', monthlyLimit: limit }
}

describe('xpBreakdown — combustível derivado (§2)', () => {
  it('hábito é por DIA ÚNICO, não por lançamento (anti-farm)', () => {
    const d1 = blank()
    d1.expenses = [exp('a', '2026-07-16', 100)]
    const oneEntry = xpBreakdown(d1, '2026-07-16').habit

    const d2 = blank()
    // 20 lançamentos no MESMO dia — não pode render mais XP de hábito
    d2.expenses = Array.from({ length: 20 }, (_, i) => exp(`e${i}`, '2026-07-16', 100))
    const twentyEntries = xpBreakdown(d2, '2026-07-16').habit

    expect(oneEntry).toBe(XP.HABIT_PER_DAY)
    expect(twentyEntries).toBe(XP.HABIT_PER_DAY) // igual: 1 dia único
  })

  it('hábito soma por dias distintos e respeita o teto mensal', () => {
    const d = blank()
    // 20 dias distintos no mês → 20*15 = 300, mas o teto é HABIT_MONTH_CAP
    d.expenses = Array.from({ length: 20 }, (_, i) =>
      exp(`e${i}`, `2026-07-${String(i + 1).padStart(2, '0')}`, 100),
    )
    expect(xpBreakdown(d, '2026-07-20').habit).toBe(XP.HABIT_MONTH_CAP)
  })

  it('mês no azul, limites respeitados e caixinha batida somam disciplina', () => {
    const d = blank()
    d.salaryHistory = [{ id: 's', startYm: '2026-07', amount: 300000 }]
    d.categories = [cat('c', 100000)] // limite 1000; gasta 500 → respeitado
    d.expenses = [exp('a', '2026-07-10', 50000, 'c')]
    d.boxes = [
      { id: 'b', icon: 'target', name: 'x', target: 1000, investmentId: null, manualAmount: 1000, celebrated: true } as Box,
    ]
    const r = xpBreakdown(d, '2026-07-16')
    expect(r.blueMonths).toBe(XP.BLUE_MONTH) // renda 3000 > gasto 500
    expect(r.limitsRespected).toBe(XP.LIMIT_RESPECTED) // 1 categoria dentro
    expect(r.boxes).toBe(XP.BOX_HIT) // 1 caixinha celebrada
    expect(r.discipline).toBe(XP.BLUE_MONTH + XP.LIMIT_RESPECTED + XP.BOX_HIT)
  })

  it('cada evento de disciplina vale mais que um dia de hábito', () => {
    expect(XP.BLUE_MONTH).toBeGreaterThan(XP.HABIT_PER_DAY)
    expect(XP.LIMIT_RESPECTED).toBeGreaterThan(XP.HABIT_PER_DAY)
    expect(XP.BOX_HIT).toBeGreaterThan(XP.HABIT_PER_DAY)
  })

  it('um mês disciplinado (azul + caixinha) supera o teto do hábito', () => {
    expect(XP.BLUE_MONTH + XP.BOX_HIT).toBeGreaterThan(XP.HABIT_MONTH_CAP)
  })

  it('mês ocioso (sem registro) não gera XP algum', () => {
    const d = blank()
    d.salaryHistory = [{ id: 's', startYm: '2026-01', amount: 300000 }] // vigência só não é registro
    const r = xpBreakdown(d, '2026-07-16')
    expect(r.total).toBe(0)
  })

  it('nível e progresso derivam do total', () => {
    const d = blank()
    // 1 dia de hábito = 15 → nível 1, 15 dentro, falta 485
    d.expenses = [exp('a', '2026-07-16', 100)]
    const r = xpBreakdown(d, '2026-07-16')
    expect(r.level).toBe(1)
    expect(r.intoLevel).toBe(15)
    expect(r.toNext).toBe(XP.LEVEL_SIZE - 15)
  })
})
