import { describe, expect, it } from 'vitest'
import { DATA_VERSION, type ZentData } from '@/data/schema'
import { lockInsights } from '@/engine/lockInsight'

/**
 * Linha viva da tela de bloqueio (R10 §⑦).
 *
 * O teste central é de PRIVACIDADE: a tela aparece antes da autenticação, então
 * a variante `masked` de TODA linha tem de estar limpa de número — senão a
 * privacidade que o M2 garante no resto do app teria um furo bem no primeiro
 * contato. `/R\$\s*\d/` é o mesmo regex do E2E de privacidade.
 */

const MONEY = /R\$\s*\d/
const ANY_DIGIT = /\d/
const HOJE = '2026-07'

function base(over: Partial<ZentData> = {}): ZentData {
  return {
    version: DATA_VERSION,
    profile: { name: 'Alex' },
    rates: {
      selic: 14.25,
      cdi: 14.15,
      ipca: 4.64,
      updatedAt: '2026-07-16',
      autoUpdate: true,
      lastAutoAt: null,
      overrides: { selic: false, cdi: false, ipca: false },
    },
    salaryHistory: [{ id: 's1', startYm: '2026-01', amount: 5_000_00 }],
    salaryConfig: { bankId: 'b1', payDay: 5, autoCredit: true },
    salaryCredits: [],
    extraIncomes: [],
    categories: [{ id: 'c1', name: 'Mercado', color: '#2fd680', monthlyLimit: 100_00 }],
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
    meta: {
      createdAt: '2026-01-01',
      lastManualExport: null,
      categoriesOnboarded: true,
      lastRecurringYm: null,
      lastSalaryCreditYm: null,
      gamificationOnboarded: true,
    },
    ...over,
  } as ZentData
}

describe('linha viva do bloqueio (R10 §⑦)', () => {
  it('a variante mascarada NUNCA contém R$ <dígito> — nem dígito algum', () => {
    // um arquivo rico: streak, meta quase batida, score e guardado, todos ativos
    const d = base({
      salaryCredits: Array.from({ length: 6 }, (_, i) => ({
        id: `sc${i}`,
        ym: `2026-0${i + 1}`,
        date: `2026-0${i + 1}-05`,
        bankId: 'b1',
        amount: 5_000_00,
      })),
      extraIncomes: Array.from({ length: 6 }, (_, i) => ({
        id: `x${i}`,
        date: `2026-0${i + 1}-10`,
        description: 'bônus',
        amount: 200_00,
        receivedIn: null,
      })),
      boxes: [
        { id: 'bx1', icon: 'target', name: 'Viagem', target: 1_000_00, investmentId: null, manualAmount: 900_00, celebrated: false },
      ],
    })
    const lines = lockInsights(d, HOJE)
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) {
      expect(l.masked).not.toMatch(MONEY)
      expect(l.masked).not.toMatch(ANY_DIGIT)
    }
  })

  it('a variante cheia mostra o dado real (meta próxima, com %)', () => {
    const d = base({
      boxes: [
        { id: 'bx1', icon: 'target', name: 'Viagem', target: 1_000_00, investmentId: null, manualAmount: 900_00, celebrated: false },
      ],
    })
    const goal = lockInsights(d, HOJE).find((l) => l.key === 'goal')
    expect(goal?.full).toContain('Viagem')
    expect(goal?.full).toContain('90%')
    expect(goal?.masked).toContain('Viagem') // o nome fica; o número não
    expect(goal?.masked).not.toMatch(ANY_DIGIT)
  })

  it('sempre devolve ao menos uma linha, mesmo num arquivo recém-criado', () => {
    const d = base({ salaryHistory: [], boxes: [] })
    const lines = lockInsights(d, HOJE)
    expect(lines.length).toBeGreaterThanOrEqual(1)
    // a acolhida serve aos dois modos sem número
    expect(lines[0]?.masked).not.toMatch(ANY_DIGIT)
  })

  it('o marco de sequência tem precedência sobre a sequência comum', () => {
    const d = base({
      salaryCredits: Array.from({ length: 4 }, (_, i) => ({
        id: `sc${i}`,
        ym: `2026-0${i + 4}`,
        date: `2026-0${i + 4}-05`,
        bankId: 'b1',
        amount: 5_000_00,
      })),
      extraIncomes: Array.from({ length: 4 }, (_, i) => ({
        id: `x${i}`,
        date: `2026-0${i + 4}-10`,
        description: 'sobra',
        amount: 10_00,
        receivedIn: null,
      })),
    })
    const keys = lockInsights(d, HOJE).map((l) => l.key)
    expect(keys).toContain('milestone')
    expect(keys).not.toContain('streak') // um OU outro, nunca os dois
  })
})
