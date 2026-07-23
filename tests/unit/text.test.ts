import { describe, expect, it } from 'vitest'
import { counted, verbFor } from '@/engine/text'
import { lockInsights } from '@/engine/lockInsight'
import { DATA_VERSION, type ZentData } from '@/data/schema'

/**
 * Concordância por número nas frases geradas por template.
 *
 * O defeito que originou isto: "Você está há 1 mês **seguidos** no azul" — o
 * substantivo pluralizava, o adjetivo não. O erro é fácil de repetir porque a
 * unidade natural do template é a PALAVRA; por isso `counted` recebe a
 * expressão inteira.
 */
describe('counted — número + expressão concordando', () => {
  it('singular no 1, plural no resto — adjetivo junto', () => {
    expect(counted(1, 'mês seguido', 'meses seguidos')).toBe('1 mês seguido')
    expect(counted(2, 'mês seguido', 'meses seguidos')).toBe('2 meses seguidos')
    expect(counted(12, 'mês seguido', 'meses seguidos')).toBe('12 meses seguidos')
  })

  it('zero é plural em português ("0 parcelas")', () => {
    expect(counted(0, 'parcela', 'parcelas')).toBe('0 parcelas')
  })
})

describe('verbFor — o verbo concorda com a contagem', () => {
  it('"Falta 1 parcela" / "Faltam 3 parcelas"', () => {
    expect(`${verbFor(1, 'Falta', 'Faltam')} ${counted(1, 'parcela', 'parcelas')}`).toBe('Falta 1 parcela')
    expect(`${verbFor(3, 'Falta', 'Faltam')} ${counted(3, 'parcela', 'parcelas')}`).toBe('Faltam 3 parcelas')
  })
})

/** Regressão direta do relato: a linha viva com sequência de 1 mês. */
describe('linha viva: concordância da sequência', () => {
  function comStreak(meses: number): ZentData {
    const salaryCredits = []
    const extraIncomes = []
    for (let i = 0; i < meses; i++) {
      const ym = `2026-0${i + 1}`
      salaryCredits.push({ id: `sc${i}`, ym, date: `${ym}-05`, bankId: 'b1', amount: 5_000_00 })
      extraIncomes.push({ id: `x${i}`, date: `${ym}-10`, description: 'sobra', amount: 10_00, receivedIn: null })
    }
    return {
      version: DATA_VERSION,
      profile: { name: 'Alex' },
      rates: { selic: 14.25, cdi: 14.15, ipca: 4.64, updatedAt: '2026-07-16', autoUpdate: true, lastAutoAt: null, overrides: { selic: false, cdi: false, ipca: false } },
      salaryHistory: [{ id: 's1', startYm: '2026-01', amount: 5_000_00 }],
      salaryConfig: { bankId: 'b1', payDay: 5, autoCredit: true },
      salaryCredits,
      extraIncomes,
      categories: [],
      expenses: [],
      banks: [{ id: 'b1', name: 'Nubank', color: '#820AD1', openingBalance: 1_000_00 }],
      cards: [],
      purchases: [],
      investments: [],
      contributions: [],
      boxes: [],
      boxTransfers: [],
      transfers: [],
      adjustments: [],
      invoicePayments: [],
      budgetReallocations: [],
      recurringExpenses: [],
      recurringIncomes: [],
      gamification: { achievements: [], activeChallenge: null, challengeHistory: [] },
      meta: { createdAt: '2026-01-01', lastManualExport: null, categoriesOnboarded: true, lastRecurringYm: null, lastSalaryCreditYm: null, gamificationOnboarded: true },
    } as ZentData
  }

  it('1 mês → "1 mês seguido" (nunca "1 mês seguidos")', () => {
    const linha = lockInsights(comStreak(1), '2026-01')?.find((l) => l.key === 'streak')
    expect(linha?.full).toContain('1 mês seguido')
    expect(linha?.full).not.toContain('seguidos')
  })

  it('2 meses → "2 meses seguidos"', () => {
    const linha = lockInsights(comStreak(2), '2026-02')?.find((l) => l.key === 'streak')
    expect(linha?.full).toContain('2 meses seguidos')
  })
})
