import { describe, expect, it } from 'vitest'
import { createSeedData } from '@/data/seed'
import type { Category, Expense, ZentData } from '@/data/schema'
import {
  dailyConsumption,
  dailyStreak,
  daySummary,
  weekRibbon,
} from '@/engine/today'

/** Dados enxutos: só categorias e gastos controlados (sem seed padrão). */
function blank(): ZentData {
  const d = createSeedData()
  d.categories = []
  d.expenses = []
  d.extraIncomes = []
  d.budgetReallocations = []
  return d
}

function cat(id: string, limit: number | null): Category {
  return { id, name: id, color: '#6fa894', monthlyLimit: limit }
}
function exp(id: string, date: string, amount: number, categoryId = 'c'): Expense {
  return { id, date, categoryId, description: '', amount, essential: true, origin: null }
}

describe('dailyConsumption — limite diário auto-corretivo (§2)', () => {
  it('deriva o limite do orçamento efetivo e desconta o gasto até ontem', () => {
    const d = blank()
    d.categories = [cat('c', 3100)] // R$ 31,00 no mês de 31 dias → média R$ 1,00/dia
    // hoje = 2026-07-16; dias restantes = 31 - 16 + 1 = 16
    d.expenses = [
      exp('a', '2026-07-10', 500), // gasto antes de hoje
      exp('b', '2026-07-16', 200), // hoje
    ]
    const r = dailyConsumption(d, '2026-07-16', null)
    expect(r.source).toBe('budget')
    // (3100 − 500) / 16 = 162.5 → 163
    expect(r.limit).toBe(163)
    expect(r.spentToday).toBe(200)
    expect(r.spentBeforeToday).toBe(500)
    expect(r.over).toBe(true) // 200 > 163
    expect(r.remaining).toBe(0) // nunca negativo
  })

  it('estourar antes de hoje APERTA o limite de hoje (auto-correção)', () => {
    const d = blank()
    d.categories = [cat('c', 3100)]
    const folgado = dailyConsumption(d, '2026-07-16', null).limit! // sem gasto anterior
    d.expenses = [exp('a', '2026-07-10', 2000)] // gastou muito antes
    const apertado = dailyConsumption(d, '2026-07-16', null).limit!
    expect(apertado).toBeLessThan(folgado)
  })

  it('sem categoria com limite → usa o teto diário configurável', () => {
    const d = blank()
    d.categories = [cat('c', null)]
    d.expenses = [exp('b', '2026-07-16', 4200)]
    const r = dailyConsumption(d, '2026-07-16', 8000)
    expect(r.source).toBe('cap')
    expect(r.limit).toBe(8000)
    expect(r.remaining).toBe(3800)
    expect(r.over).toBe(false)
  })

  it('sem orçamento e sem teto → limite null, só mostra o gasto (sem inventar teto)', () => {
    const d = blank()
    d.expenses = [exp('b', '2026-07-16', 4200)]
    const r = dailyConsumption(d, '2026-07-16', null)
    expect(r.source).toBe('none')
    expect(r.limit).toBeNull()
    expect(r.remaining).toBeNull()
    expect(r.spentToday).toBe(4200)
  })

  it('conta lançamentos de hoje para a frase viva', () => {
    const d = blank()
    d.categories = [cat('c', 8000)]
    d.expenses = [exp('a', '2026-07-16', 100), exp('b', '2026-07-16', 200), exp('c2', '2026-07-15', 300)]
    expect(dailyConsumption(d, '2026-07-16', null).countToday).toBe(2)
  })
})

describe('weekRibbon — fita Seg→Dom (§2)', () => {
  it('marca hoje, dias com registro e futuros', () => {
    const d = blank()
    // 2026-07-16 é quinta; semana Seg 13 → Dom 19
    d.expenses = [exp('a', '2026-07-13', 100), exp('b', '2026-07-16', 100)]
    const w = weekRibbon(d, '2026-07-16')
    expect(w).toHaveLength(7)
    expect(w[0]).toMatchObject({ day: 13, label: 'Seg', state: 'done' })
    expect(w[1]).toMatchObject({ day: 14, label: 'Ter', state: 'past-empty' })
    expect(w[3]).toMatchObject({ day: 16, label: 'Qui', state: 'today' })
    expect(w[4]).toMatchObject({ day: 17, state: 'future' })
    expect(w[6]).toMatchObject({ day: 19, label: 'Dom', state: 'future' })
  })
})

describe('dailyStreak — sequência de ignição (§2)', () => {
  it('conta dias consecutivos terminando hoje', () => {
    const d = blank()
    d.expenses = [
      exp('a', '2026-07-14', 100),
      exp('b', '2026-07-15', 100),
      exp('c', '2026-07-16', 100),
    ]
    expect(dailyStreak(d, '2026-07-16')).toBe(3)
  })

  it('hoje sem registro NÃO quebra: conta até ontem', () => {
    const d = blank()
    d.expenses = [exp('a', '2026-07-14', 100), exp('b', '2026-07-15', 100)]
    expect(dailyStreak(d, '2026-07-16')).toBe(2)
  })

  it('lacuna quebra a sequência', () => {
    const d = blank()
    d.expenses = [exp('a', '2026-07-12', 100), exp('c', '2026-07-16', 100)]
    expect(dailyStreak(d, '2026-07-16')).toBe(1)
  })

  it('sem gastos → 0', () => {
    expect(dailyStreak(blank(), '2026-07-16')).toBe(0)
  })
})

describe('daySummary — entrou/saiu hoje', () => {
  it('soma extras e gastos do dia', () => {
    const d = blank()
    d.expenses = [exp('a', '2026-07-16', 4200), exp('b', '2026-07-15', 999)]
    d.extraIncomes = [{ id: 'x', date: '2026-07-16', description: 't', amount: 5000, receivedIn: null }]
    const s = daySummary(d, '2026-07-16')
    expect(s.inToday).toBe(5000)
    expect(s.outToday).toBe(4200)
  })
})
