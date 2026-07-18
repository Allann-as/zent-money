import { describe, expect, it } from 'vitest'
import type { BudgetReallocation, Category } from '@/data/schema'
import { effectiveLimit, monthBudgets, validateReallocation } from '@/engine/budget'

/**
 * Orçamento 2.0 (M1 §c): limite efetivo com realocação mensal.
 * efetivo = base + recebido − cedido, só no mês; a virada volta ao base.
 */

const MONTH = '2026-07'
const NEXT = '2026-08'

const cats: Category[] = [
  { id: 'food', name: 'Mercado', color: '#2fd680', monthlyLimit: 200_00 },
  { id: 'fun', name: 'Lazer', color: '#57b6f2', monthlyLimit: 100_00 },
  { id: 'free', name: 'Livre', color: '#f0655a', monthlyLimit: null }, // sem limite base
]

function realloc(over: Partial<BudgetReallocation> = {}): BudgetReallocation {
  return { id: 'r1', ym: MONTH, fromCategoryId: 'food', toCategoryId: 'fun', amount: 50_00, ...over }
}

describe('limite efetivo (M1 §c)', () => {
  it('sem realocação, o efetivo é o base — o orçamento de antes, intacto', () => {
    const food = cats[0]!
    expect(effectiveLimit(food, [], MONTH)).toBe(200_00)
  })

  it('categoria sem limite base e sem realocação continua sem limite (null)', () => {
    const free = cats[2]!
    expect(effectiveLimit(free, [], MONTH)).toBeNull()
  })

  it('ceder diminui a origem e receber aumenta o destino, no mesmo mês', () => {
    const rs = [realloc()] // Mercado cede R$50 para Lazer
    expect(effectiveLimit(cats[0]!, rs, MONTH)).toBe(150_00)
    expect(effectiveLimit(cats[1]!, rs, MONTH)).toBe(150_00)
  })

  it('vale só no mês: no mês seguinte o efetivo volta ao base', () => {
    const rs = [realloc()]
    expect(effectiveLimit(cats[0]!, rs, NEXT)).toBe(200_00)
    expect(effectiveLimit(cats[1]!, rs, NEXT)).toBe(100_00)
  })

  it('destino sem limite base ganha um efetivo do nada (decisão do usuário)', () => {
    const rs = [realloc({ toCategoryId: 'free', amount: 30_00 })]
    expect(effectiveLimit(cats[2]!, rs, MONTH)).toBe(30_00) // 0 base + 30 recebido
    expect(effectiveLimit(cats[0]!, rs, MONTH)).toBe(170_00)
  })

  it('monthBudgets devolve base, recebido, cedido e efetivo de cada categoria', () => {
    const rs = [realloc()]
    const b = monthBudgets(cats, rs, MONTH)
    expect(b.get('food')).toEqual({ categoryId: 'food', base: 200_00, received: 0, ceded: 50_00, effective: 150_00 })
    expect(b.get('fun')).toEqual({ categoryId: 'fun', base: 100_00, received: 50_00, ceded: 0, effective: 150_00 })
    expect(b.get('free')?.effective).toBeNull()
  })
})

describe('validação da realocação (M1 §c)', () => {
  it('aceita uma realocação normal', () => {
    expect(validateReallocation(cats, [], MONTH, { fromCategoryId: 'food', toCategoryId: 'fun', amount: 50_00 })).toBeNull()
  })

  it('recusa valor não-positivo e origem = destino', () => {
    expect(validateReallocation(cats, [], MONTH, { fromCategoryId: 'food', toCategoryId: 'fun', amount: 0 })).toMatch(/maior que zero/)
    expect(validateReallocation(cats, [], MONTH, { fromCategoryId: 'food', toCategoryId: 'food', amount: 10_00 })).toMatch(/diferentes/)
  })

  it('recusa ceder de categoria sem limite (não se cede o que não se tem)', () => {
    expect(validateReallocation(cats, [], MONTH, { fromCategoryId: 'free', toCategoryId: 'fun', amount: 10_00 })).toMatch(/não tem limite/)
  })

  it('recusa ceder mais do que a origem tem — o efetivo nunca fica negativo', () => {
    expect(validateReallocation(cats, [], MONTH, { fromCategoryId: 'fun', toCategoryId: 'food', amount: 150_00 })).toMatch(/disponível/)
  })

  it('considera as realocações já existentes ao validar a próxima', () => {
    // Mercado já cedeu 150 (efetivo 50); ceder mais 80 estouraria
    const rs = [realloc({ id: 'r0', amount: 150_00 })]
    expect(validateReallocation(cats, rs, MONTH, { fromCategoryId: 'food', toCategoryId: 'fun', amount: 80_00 })).toMatch(/disponível/)
    // mas ceder 50 (o que resta) é aceito
    expect(validateReallocation(cats, rs, MONTH, { fromCategoryId: 'food', toCategoryId: 'fun', amount: 50_00 })).toBeNull()
  })
})
