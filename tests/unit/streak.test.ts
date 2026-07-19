import { describe, expect, it } from 'vitest'
import { createSeedData } from '@/data/seed'
import type { ZentData } from '@/data/schema'
import { currentStreak, monthState, streakMilestone } from '@/engine/streak'
import type { Ym } from '@/engine/dates'

/**
 * Constrói dados com meses controlados: `income` vira um extra (renda sem
 * vigência persistente, para isolar a lógica de registro) e `spent`, um gasto.
 * Mês com income=0 e spent=0 = SEM registro (vazio/pausa).
 */
function dataWith(months: { ym: Ym; income: number; spent: number }[]): ZentData {
  const base = createSeedData()
  base.salaryHistory = []
  base.salaryCredits = []
  base.extraIncomes = months
    .filter((m) => m.income > 0)
    .map((m, i) => ({ id: `x${i}`, date: `${m.ym}-15`, description: 't', amount: m.income, receivedIn: null }))
  base.expenses = months
    .filter((m) => m.spent > 0)
    .map((m, i) => ({ id: `e${i}`, date: `${m.ym}-10`, categoryId: 'c', description: 't', amount: m.spent, essential: true, origin: null }))
  return base
}

describe('streak — meses no azul (M4)', () => {
  it('monthState: azul, vermelho, vazio', () => {
    expect(monthState(2000, 1500, true)).toBe('blue')
    expect(monthState(2000, 2000, true)).toBe('blue') // sobra 0 ainda é azul
    expect(monthState(1000, 1500, true)).toBe('red')
    expect(monthState(0, 0, false)).toBe('empty')
    expect(monthState(2000, 0, false)).toBe('empty') // renda persistente sem registro = pausa
  })

  it('streakMilestone: 3/6/12', () => {
    expect(streakMilestone(0)).toBeNull()
    expect(streakMilestone(2)).toBeNull()
    expect(streakMilestone(3)).toBe(3)
    expect(streakMilestone(5)).toBe(3)
    expect(streakMilestone(6)).toBe(6)
    expect(streakMilestone(11)).toBe(6)
    expect(streakMilestone(12)).toBe(12)
    expect(streakMilestone(30)).toBe(12)
  })

  it('conta meses azuis consecutivos', () => {
    const data = dataWith([
      { ym: '2026-05', income: 3000, spent: 2000 },
      { ym: '2026-06', income: 3000, spent: 2500 },
      { ym: '2026-07', income: 3000, spent: 1000 },
    ])
    expect(currentStreak(data, '2026-07')).toBe(3)
  })

  it('virada de ano: dez → jan contam como consecutivos', () => {
    const data = dataWith([
      { ym: '2025-12', income: 3000, spent: 1000 },
      { ym: '2026-01', income: 3000, spent: 1000 },
    ])
    expect(currentStreak(data, '2026-01')).toBe(2)
  })

  it('mês vazio no meio PAUSA (não conta, não quebra)', () => {
    const data = dataWith([
      { ym: '2026-05', income: 3000, spent: 1000 }, // azul
      { ym: '2026-06', income: 0, spent: 0 }, // vazio → pausa
      { ym: '2026-07', income: 3000, spent: 1000 }, // azul
    ])
    // dois azuis com um vazio entre eles → streak 2
    expect(currentStreak(data, '2026-07')).toBe(2)
  })

  it('vermelho ZERA (walk para trás para no primeiro vermelho)', () => {
    const data = dataWith([
      { ym: '2026-05', income: 3000, spent: 1000 }, // azul (mais antigo)
      { ym: '2026-06', income: 1000, spent: 3000 }, // vermelho
      { ym: '2026-07', income: 3000, spent: 1000 }, // azul (atual)
    ])
    // de 2026-07: azul (1) → 2026-06 vermelho: para → streak 1
    expect(currentStreak(data, '2026-07')).toBe(1)
  })

  it('sem registro nenhum → streak 0', () => {
    expect(currentStreak(dataWith([]), '2026-07')).toBe(0)
  })
})
