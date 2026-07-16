import { describe, expect, it } from 'vitest'
import { monthPace } from '@/engine/aggregations'

const items = (pairs: Array<[string, number]>) => pairs.map(([date, amount]) => ({ date, amount }))

describe('ritmo do mês (média diária + projeção)', () => {
  it('mês corrente: projeta pelo gasto médio dos dias corridos', () => {
    // 16 dias corridos, R$ 800,00 gastos → média 50/dia → projeção 50×31
    const pace = monthPace(items([['2026-07-03', 50_000], ['2026-07-10', 30_000]]), '2026-07', '2026-07-16')
    expect(pace.spentSoFar).toBe(80_000)
    expect(pace.daysElapsed).toBe(16)
    expect(pace.daysInMonth).toBe(31)
    expect(pace.avgPerDay).toBe(5_000)
    expect(pace.projected).toBe(155_000)
    expect(pace.closed).toBe(false)
  })

  it('mês passado: fechado, projeção = realizado', () => {
    const pace = monthPace(items([['2026-06-10', 90_000]]), '2026-06', '2026-07-16')
    expect(pace.closed).toBe(true)
    expect(pace.projected).toBe(90_000)
    expect(pace.avgPerDay).toBe(3_000) // 90.000 / 30 dias
  })

  it('mês futuro: zeros', () => {
    const pace = monthPace([], '2026-09', '2026-07-16')
    expect(pace.spentSoFar).toBe(0)
    expect(pace.projected).toBe(0)
    expect(pace.closed).toBe(false)
  })

  it('dia 1 não divide por zero', () => {
    const pace = monthPace(items([['2026-07-01', 10_000]]), '2026-07', '2026-07-01')
    expect(pace.daysElapsed).toBe(1)
    expect(pace.avgPerDay).toBe(10_000)
  })
})
