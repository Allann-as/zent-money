import { describe, expect, it } from 'vitest'
import { createSeedData } from '@/data/seed'
import type { Challenge, ZentData } from '@/data/schema'
import { ACHIEVEMENTS, evaluateAchievements, metAchievementIds } from '@/engine/achievements'
import { challengeIsOver, challengeTarget, evaluateChallenge } from '@/engine/challenge'

function withExpenses(rows: { ym: string; cat: string; amount: number }[]): ZentData {
  const d = createSeedData()
  d.salaryHistory = []
  d.expenses = rows.map((r, i) => ({
    id: `e${i}`,
    date: `${r.ym}-10`,
    categoryId: r.cat,
    description: 't',
    amount: r.amount,
    essential: true,
    origin: null,
  }))
  return d
}

describe('conquistas (M4)', () => {
  it('catálogo tem ~12 medalhas, ids únicos', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(12)
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id))
    expect(ids.size).toBe(ACHIEVEMENTS.length)
  })

  it('retroativo: desbloqueia o que já está satisfeito, com data', () => {
    const d = createSeedData()
    d.contributions = [{ id: 'c1', investmentId: 'i1', date: '2026-07-05', amount: 200_000 }] // 2k
    d.meta.lastManualExport = '2026-07-01'
    const met = metAchievementIds(d, '2026-07')
    expect(met.has('first-contribution')).toBe(true)
    expect(met.has('invested-1k')).toBe(true)
    expect(met.has('invested-5k')).toBe(false)
    expect(met.has('first-backup')).toBe(true)

    const e = evaluateAchievements(d, '2026-07', '2026-07-18')
    expect(e.newlyUnlocked).toContain('first-contribution')
    expect(e.newlyUnlocked).toContain('invested-1k')
    expect(e.newlyUnlocked).toContain('first-backup')
    expect(e.unlocked.every((a) => a.unlockedAt === '2026-07-18')).toBe(true)
  })

  it('idempotente: reavaliar não desbloqueia de novo', () => {
    const d = createSeedData()
    d.contributions = [{ id: 'c1', investmentId: 'i1', date: '2026-07-05', amount: 50_000 }]
    const first = evaluateAchievements(d, '2026-07', '2026-07-18')
    d.gamification.achievements = first.unlocked
    const second = evaluateAchievements(d, '2026-07', '2026-07-19')
    expect(second.newlyUnlocked).toEqual([])
    expect(second.unlocked.length).toBe(first.unlocked.length)
  })

  it('3 desafios cumpridos desbloqueia "Disciplina"', () => {
    const d = createSeedData()
    const rec = (met: boolean): ZentData['gamification']['challengeHistory'][number] => ({
      challenge: { id: 'x', kind: 'cap', ym: '2026-06', categoryId: 'c1', capAmount: 100 },
      met,
      actual: 0,
      target: 100,
    })
    d.gamification.challengeHistory = [rec(true), rec(true), rec(false)]
    expect(metAchievementIds(d, '2026-07').has('challenges-3')).toBe(false)
    d.gamification.challengeHistory.push(rec(true))
    expect(metAchievementIds(d, '2026-07').has('challenges-3')).toBe(true)
  })
})

describe('desafio mensal (M4)', () => {
  it('cap: met quando o gasto ≤ limite', () => {
    const d = withExpenses([{ ym: '2026-07', cat: 'c1', amount: 9_000 }])
    const ch: Challenge = { id: 'ch', kind: 'cap', ym: '2026-07', categoryId: 'c1', capAmount: 10_000 }
    const r = evaluateChallenge(ch, d)
    expect(r.target).toBe(10_000)
    expect(r.actual).toBe(9_000)
    expect(r.met).toBe(true)
  })

  it('reduce: alvo = mês anterior × (1 − Y%)', () => {
    const d = withExpenses([
      { ym: '2026-06', cat: 'c1', amount: 20_000 },
      { ym: '2026-07', cat: 'c1', amount: 17_000 },
    ])
    const ch: Challenge = { id: 'ch', kind: 'reduce', ym: '2026-07', categoryId: 'c1', reducePercent: 10 }
    expect(challengeTarget(ch, d)).toBe(18_000) // 20.000 × 0,9
    expect(evaluateChallenge(ch, d).met).toBe(true) // 17.000 ≤ 18.000
  })

  it('reduce: não cumprido quando gastou mais que o alvo', () => {
    const d = withExpenses([
      { ym: '2026-06', cat: 'c1', amount: 20_000 },
      { ym: '2026-07', cat: 'c1', amount: 19_000 },
    ])
    const ch: Challenge = { id: 'ch', kind: 'reduce', ym: '2026-07', categoryId: 'c1', reducePercent: 10 }
    expect(evaluateChallenge(ch, d).met).toBe(false) // 19.000 > 18.000
  })

  it('challengeIsOver: só depois da virada', () => {
    const ch: Challenge = { id: 'ch', kind: 'cap', ym: '2026-07', categoryId: 'c1', capAmount: 100 }
    expect(challengeIsOver(ch, '2026-07')).toBe(false)
    expect(challengeIsOver(ch, '2026-08')).toBe(true)
  })
})
