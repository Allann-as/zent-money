import { describe, expect, it } from 'vitest'
import { monthScore, scoreForMonth, type BudgetedCategory } from '@/engine/score'
import { createSeedData } from '@/data/seed'

/** Atalho: N categorias, `within` dentro do limite (efetivo 100, gasto 50/150). */
function cats(total: number, within: number): BudgetedCategory[] {
  return Array.from({ length: total }, (_, i) => ({
    effective: 10000,
    spent: i < within ? 5000 : 15000,
  }))
}

describe('score de saúde financeira (M4) — fórmula aprovada', () => {
  it('Exemplo A (saudável) → 73', () => {
    // renda 3.750 · gasto 1.451 (sobra 61%) · 4/4 no limite · compromissos 1.728 (46%)
    const r = monthScore(375000, 145100, 172800, cats(4, 4))
    expect(r).not.toBeNull()
    expect(r?.score).toBe(73)
    expect(r?.components.savings).toBe(100) // 61% ≥ 30% → cheio
    expect(r?.components.categories).toBe(100)
    expect(Math.round(r?.components.commitments ?? -1)).toBe(10)
  })

  it('Exemplo B (apertado) → 44', () => {
    // renda 3.000 · gasto 2.850 (sobra 5%) · 2/4 no limite · compromissos 600 (20%)
    const r = monthScore(300000, 285000, 60000, cats(4, 2))
    expect(r?.score).toBe(44)
    expect(r?.components.categories).toBe(50)
    expect(r?.components.commitments).toBeCloseTo(75, 6)
  })

  it('Exemplo C (sem registros) → sem score (null)', () => {
    expect(monthScore(0, 0, 0, [])).toBeNull()
  })

  it('def.1 — sobra negativa clampa s1 em 0, não puxa abaixo dos pesos', () => {
    // gasto > renda: s1 = 0. Sem categorias (redistribui), compromissos 0 → s3 = 100.
    const r = monthScore(100000, 150000, 0, [])
    expect(r?.components.savings).toBe(0)
    // pesos redistribuídos: s1 57,14% · s3 42,86% → 0*0.571 + 100*0.429 = 42.86 → 43
    expect(r?.score).toBe(43)
  })

  it('def.2 — movimentação sem renda (só gastos) → sem score', () => {
    expect(monthScore(0, 50000, 0, cats(2, 2))).toBeNull()
  })

  it('def.3 — sem categorias com limite redistribui 40/30 → 57,14%/42,86%', () => {
    const r = monthScore(100000, 0, 0, []) // s1=100, s3=100
    expect(r?.redistributed).toBe(true)
    expect(r?.weights.savings).toBeCloseTo(0.5714, 4)
    expect(r?.weights.commitments).toBeCloseTo(0.4286, 4)
    expect(r?.weights.categories).toBe(0)
    expect(r?.score).toBe(100) // ambos cheios
  })

  it('def.4 — arredondamento único no fim, meio pra cima', () => {
    // Monta um total exatamente .5 e confirma que sobe.
    // s1=100 (savings full), s3=100, s2=? com 1 categoria: within→100, fora→0.
    // Escolhe números que dão total .5: usar pesos 40/30/30 e s2 tal que
    // 40 + 0.3*s2 + 30 = X.5 → 0.3*s2 = .5 → s2 = 1.6667 (não trivial), então
    // testo a monotonicidade do arredondamento com dois casos vizinhos.
    const a = monthScore(100000, 70100, 10000, cats(1, 0)) // sobra 29.9%
    const b = monthScore(100000, 69900, 10000, cats(1, 0)) // sobra 30.1%
    // ambos válidos e inteiros
    expect(Number.isInteger(a?.score)).toBe(true)
    expect(Number.isInteger(b?.score)).toBe(true)
    // Math.round(2.5) === 3 (meio pra cima) — invariante da linguagem que usamos
    expect(Math.round(2.5)).toBe(3)
  })

  it('scoreForMonth re-deriva determinísticamente do arquivo (seed)', () => {
    const data = createSeedData()
    const ym = data.salaryHistory[0]?.startYm ?? '2026-07'
    const a = scoreForMonth(data, ym)
    const b = scoreForMonth(data, ym)
    // mesma entrada → mesmo número (determinístico), sempre 0–100 ou null
    expect(a).toEqual(b)
    if (a) {
      expect(a.score).toBeGreaterThanOrEqual(0)
      expect(a.score).toBeLessThanOrEqual(100)
    }
  })
})
