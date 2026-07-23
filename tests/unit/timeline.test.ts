import { describe, expect, it } from 'vitest'
import { DATA_VERSION, type ZentData } from '@/data/schema'
import { firstActiveYm, groupYears, timelineStats, windowMonths } from '@/engine/timeline'

/**
 * Linha do tempo — o painel dos anos (R10 §⑥).
 *
 * O motor só LÊ as agregações que já existem, então o que estes testes provam
 * não é aritmética de dinheiro (isso é do `aggregations`): é o recorte do
 * PERÍODO, a honestidade do denominador (mês sem registro não conta) e o
 * "sem base de comparação → null" que a R4 estabeleceu.
 */

const HOJE = '2026-07'

function base(over: Partial<ZentData> = {}): ZentData {
  return {
    version: DATA_VERSION,
    profile: { name: 'Allan' },
    rates: {
      selic: 14.25,
      cdi: 14.15,
      ipca: 4.64,
      updatedAt: '2026-07-16',
      autoUpdate: true,
      lastAutoAt: null,
      overrides: { selic: false, cdi: false, ipca: false },
    },
    salaryHistory: [],
    salaryConfig: { bankId: null, payDay: 5, autoCredit: true },
    salaryCredits: [],
    extraIncomes: [],
    categories: [
      { id: 'c1', name: 'Mercado', color: '#2fd680', monthlyLimit: null },
      { id: 'c2', name: 'Lazer', color: '#f0bc5e', monthlyLimit: null },
    ],
    expenses: [],
    banks: [],
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

function expense(id: string, date: string, amount: number, categoryId = 'c1'): ZentData['expenses'][number] {
  return { id, date, categoryId, description: `gasto ${id}`, amount, essential: true, origin: null }
}

function extra(id: string, date: string, amount: number): ZentData['extraIncomes'][number] {
  return { id, date, description: `extra ${id}`, amount, receivedIn: null }
}

describe('janela do período (R10 §⑥)', () => {
  it('6m/12m/24m devolvem exatamente o número de meses pedido, terminando em hoje', () => {
    const d = base()
    expect(windowMonths(d, '6m', HOJE)).toHaveLength(6)
    expect(windowMonths(d, '12m', HOJE)).toHaveLength(12)
    expect(windowMonths(d, '24m', HOJE)).toHaveLength(24)
    expect(windowMonths(d, '12m', HOJE).at(-1)).toBe(HOJE)
  })

  it('"tudo" começa no primeiro mês com registro', () => {
    const d = base({ expenses: [expense('e1', '2025-11-10', 100_00)] })
    const months = windowMonths(d, 'all', HOJE)
    expect(months[0]).toBe('2025-11')
    expect(months.at(-1)).toBe(HOJE)
    expect(months).toHaveLength(9) // nov/25 … jul/26
  })

  it('"ano a ano" começa em JANEIRO do primeiro ano com registro', () => {
    const d = base({ expenses: [expense('e1', '2025-11-10', 100_00)] })
    // sem isto, o comparativo anual mediria 2 meses de 2025 contra 7 de 2026
    expect(windowMonths(d, 'year', HOJE)[0]).toBe('2025-01')
  })

  it('arquivo sem registro nenhum cai em 12 meses, não numa lista vazia', () => {
    expect(windowMonths(base(), 'all', HOJE)).toHaveLength(12)
    expect(firstActiveYm(base())).toBeNull()
  })

  it('o primeiro mês ativo considera salário, extra, gasto e aporte', () => {
    const d = base({
      expenses: [expense('e1', '2026-05-01', 10_00)],
      salaryHistory: [{ id: 's1', startYm: '2026-02', amount: 300_000 }],
    })
    expect(firstActiveYm(d)).toBe('2026-02')
  })
})

describe('estatísticas do período (R10 §⑥)', () => {
  it('guardado, média mensal e taxa saem das agregações existentes', () => {
    const d = base({
      extraIncomes: [extra('x1', '2026-07-02', 1_000_00), extra('x2', '2026-06-02', 1_000_00)],
      expenses: [expense('e1', '2026-07-03', 400_00), expense('e2', '2026-06-03', 600_00)],
    })
    const s = timelineStats(d, '6m', HOJE)
    expect(s.saved).toBe(1_000_00) // 2.000 − 1.000
    expect(s.savedPerMonth).toBe(Math.round(1_000_00 / 6))
    expect(s.rate).toBeCloseTo(0.5, 5)
  })

  it('mês SEM movimentação não conta no denominador de "meses no azul"', () => {
    const d = base({
      extraIncomes: [extra('x1', '2026-07-02', 1_000_00)],
      expenses: [expense('e1', '2026-07-03', 400_00)],
    })
    const s = timelineStats(d, '12m', HOJE)
    // 12 meses na janela, mas só 1 com registro — zero em mês vazio é ausência,
    // não disciplina (mesmo critério do streak, M4)
    expect(s.activeMonths).toBe(1)
    expect(s.bluesMonths).toBe(1)
  })

  it('sem renda no período, a taxa é null — nunca 0 ("não há fração" ≠ "não sobrou")', () => {
    const d = base({ expenses: [expense('e1', '2026-07-03', 400_00)] })
    expect(timelineStats(d, '6m', HOJE).rate).toBeNull()
  })

  it('a janela "tudo" não tem período anterior para comparar', () => {
    const d = base({
      extraIncomes: [extra('x1', '2026-07-02', 1_000_00)],
      expenses: [expense('e1', '2026-07-03', 400_00)],
    })
    expect(timelineStats(d, 'all', HOJE).ratePrev).toBeNull()
  })

  it('o período anterior tem o MESMO tamanho e é medido de fato', () => {
    const d = base({
      // jan/26 e fev/26 → período anterior de 2 meses quando a janela é 6m? não:
      // com janela de 6m (fev…jul), o anterior é ago/25…jan/26.
      extraIncomes: [extra('x1', '2026-07-02', 1_000_00), extra('x0', '2025-10-02', 1_000_00)],
      expenses: [expense('e1', '2026-07-03', 500_00), expense('e0', '2025-10-03', 900_00)],
    })
    const s = timelineStats(d, '6m', HOJE)
    expect(s.rate).toBeCloseTo(0.5, 5) // período atual
    expect(s.ratePrev).toBeCloseTo(0.1, 5) // (1000 − 900) / 1000
  })

  it('o maior gasto do período é o maior individual, com mês e descrição', () => {
    const d = base({
      expenses: [
        expense('e1', '2026-07-03', 400_00),
        expense('e2', '2026-06-03', 1_200_00),
        expense('e3', '2020-01-03', 9_999_00), // fora da janela de 6m
      ],
    })
    const s = timelineStats(d, '6m', HOJE)
    expect(s.biggestExpense?.amount).toBe(1_200_00)
    expect(s.biggestExpense?.ym).toBe('2026-06')
  })

  it('o acumulado é a soma CORRIDA de sobra + aportes, mês a mês', () => {
    const d = base({
      extraIncomes: [extra('x1', '2026-06-02', 500_00), extra('x2', '2026-07-02', 300_00)],
      contributions: [{ id: 'a1', investmentId: 'i1', date: '2026-07-05', amount: 100_00, fromBankId: null }],
    })
    const s = timelineStats(d, '6m', HOJE)
    const jun = s.cumulative.find((c) => c.ym === '2026-06')
    const jul = s.cumulative.find((c) => c.ym === '2026-07')
    expect(jun?.value).toBe(500_00)
    expect(jul?.value).toBe(500_00 + 300_00 + 100_00)
  })

  it('recordes ignoram meses sem movimentação (não existe "melhor mês" que foi vazio)', () => {
    const d = base({
      extraIncomes: [extra('x1', '2026-07-02', 100_00)],
      expenses: [expense('e1', '2026-07-03', 900_00)],
    })
    const s = timelineStats(d, '12m', HOJE)
    // um único mês ativo, e ele é negativo: é o melhor E o pior
    expect(s.records.bestNet?.ym).toBe('2026-07')
    expect(s.records.worstNet?.ym).toBe('2026-07')
    expect(s.records.bestNet?.net).toBe(-800_00)
    // nenhum aporte → sem recorde de aporte (nunca um "R$ 0,00" como recorde)
    expect(s.records.bestContribution).toBeNull()
  })

  it('as maiores categorias somam exatamente o total de gastos do período', () => {
    const d = base({
      expenses: [
        expense('e1', '2026-07-03', 400_00, 'c1'),
        expense('e2', '2026-07-04', 250_00, 'c2'),
        expense('e3', '2026-06-04', 350_00, 'c1'),
      ],
    })
    const s = timelineStats(d, '6m', HOJE)
    expect(s.totalExpenses).toBe(1_000_00)
    expect(s.topCategories.reduce((a, c) => a + c.total, 0)).toBe(1_000_00)
    expect(s.topCategories[0]?.category.name).toBe('Mercado') // 750 > 250
  })
})

describe('agrupamento por ano', () => {
  it('soma os meses de cada ano e devolve em ordem cronológica', () => {
    const years = groupYears([
      { ym: '2025-11', income: 100, expenses: 40, net: 60, contributed: 10 },
      { ym: '2025-12', income: 200, expenses: 50, net: 150, contributed: 0 },
      { ym: '2026-01', income: 300, expenses: 100, net: 200, contributed: 5 },
    ])
    expect(years.map((y) => y.year)).toEqual(['2025', '2026'])
    expect(years[0]).toEqual({ year: '2025', income: 300, expenses: 90, net: 210, contributed: 10 })
    expect(years[1]?.net).toBe(200)
  })
})
