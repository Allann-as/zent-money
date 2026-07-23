import type { Category, ZentData } from '@/data/schema'
import { incomeByMonth, savingsRatio, sumByMonth } from './aggregations'
import { addMonths, currentYm, lastMonths, ymCompare, ymOfDate } from './dates'
import type { Ym } from './dates'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LINHA DO TEMPO — o painel dos anos (R10 §⑥)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Tudo aqui é LEITURA das agregações que já existem (`incomeByMonth`,
 * `sumByMonth`, `savingsRatio`). **Nenhuma regra de dinheiro nova**: se um
 * número desta página discordasse do resto do app, o defeito seria uma segunda
 * fórmula — o erro que a R4 passou uma release inteira caçando.
 *
 * A página deixou de ser uma janela fixa de 12 meses e passou a ter seletor de
 * período; a janela vira um parâmetro, e o resto do motor não sabe disso.
 */

export type TimelineWindow = '6m' | '12m' | '24m' | 'year' | 'all'

export const TIMELINE_WINDOWS: ReadonlyArray<{ id: TimelineWindow; label: string }> = [
  { id: '6m', label: '6m' },
  { id: '12m', label: '12m' },
  { id: '24m', label: '24m' },
  { id: 'year', label: 'ano a ano' },
  { id: 'all', label: 'tudo' },
]

export interface MonthRow {
  ym: Ym
  income: number
  expenses: number
  /** entradas − saídas do mês (pode ser negativo). */
  net: number
  /** aportes do mês. */
  contributed: number
}

export interface YearRow {
  year: string
  income: number
  expenses: number
  net: number
  contributed: number
}

export interface TimelineStats {
  /** Meses da janela, do mais antigo ao mais recente. */
  months: MonthRow[]
  /** Agrupamento por ano — a base do comparativo ano vs. ano. */
  years: YearRow[]
  /** Guardado no período (entradas − saídas somadas). */
  saved: number
  /** Média mensal do guardado, sobre os meses da janela. */
  savedPerMonth: number
  /** Taxa de poupança do período; `null` sem renda (nunca 0 — R4). */
  rate: number | null
  /** Taxa do período ANTERIOR de mesmo tamanho; `null` sem base. */
  ratePrev: number | null
  /** Meses com sobra ≥ 0 **e** movimentação. */
  bluesMonths: number
  /** Quantos meses da janela tiveram movimentação (o denominador honesto). */
  activeMonths: number
  /** Maior gasto individual do período. */
  biggestExpense: { description: string; amount: number; ym: Ym } | null
  /** Patrimônio acumulado mês a mês (soma corrida de sobra + aportes). */
  cumulative: { ym: Ym; value: number }[]
  /** Maiores categorias do período. */
  topCategories: { category: Category; total: number }[]
  totalExpenses: number
  invested: number
  records: {
    bestNet: MonthRow | null
    worstNet: MonthRow | null
    bestIncome: MonthRow | null
    bestContribution: MonthRow | null
    leanestMonth: MonthRow | null
  }
  anyActivity: boolean
}

/** Primeiro mês com QUALQUER registro; `null` num arquivo vazio. */
export function firstActiveYm(data: ZentData): Ym | null {
  let first: Ym | null = null
  const consider = (ym: Ym): void => {
    if (first === null || ymCompare(ym, first) < 0) first = ym
  }
  for (const e of data.expenses) consider(ymOfDate(e.date))
  for (const x of data.extraIncomes) consider(ymOfDate(x.date))
  for (const c of data.contributions) consider(ymOfDate(c.date))
  for (const s of data.salaryHistory) consider(s.startYm)
  return first
}

/**
 * Meses da janela pedida, do mais antigo ao mais recente.
 *
 * `'year'` e `'all'` são a MESMA série mensal — o que muda é como a página a
 * apresenta (agrupada por ano). Manter uma série só evita que o comparativo
 * anual e o gráfico mensal possam divergir sobre o mesmo período.
 */
export function windowMonths(data: ZentData, w: TimelineWindow, today: Ym = currentYm()): Ym[] {
  if (w === '6m') return lastMonths(today, 6)
  if (w === '12m') return lastMonths(today, 12)
  if (w === '24m') return lastMonths(today, 24)
  const first = firstActiveYm(data)
  if (first === null) return lastMonths(today, 12)
  // `'year'` começa em janeiro do primeiro ano com registro: um comparativo
  // ano-a-ano que começasse em maio compararia meia laranja com uma laranja.
  const start = w === 'year' ? `${first.slice(0, 4)}-01` : first
  const out: Ym[] = []
  let cursor = ymCompare(start, today) > 0 ? today : start
  while (ymCompare(cursor, today) <= 0) {
    out.push(cursor)
    cursor = addMonths(cursor, 1)
  }
  return out
}

/** Soma de `sumByMonth` sobre uma lista de meses. */
function sumOver(map: ReadonlyMap<Ym, number>, months: readonly Ym[]): number {
  let total = 0
  for (const ym of months) total += map.get(ym) ?? 0
  return total
}

export function timelineStats(
  data: ZentData,
  w: TimelineWindow,
  today: Ym = currentYm(),
): TimelineStats {
  const months = windowMonths(data, w, today)
  const monthSet = new Set(months)

  const incomeMap = incomeByMonth(data.salaryHistory, data.extraIncomes, months)
  const expenseMap = sumByMonth(data.expenses)
  const contribMap = sumByMonth(data.contributions)

  const rows: MonthRow[] = months.map((ym) => {
    const income = incomeMap.get(ym) ?? 0
    const expenses = expenseMap.get(ym) ?? 0
    return { ym, income, expenses, net: income - expenses, contributed: contribMap.get(ym) ?? 0 }
  })

  const saved = rows.reduce((a, r) => a + r.net, 0)
  const income = rows.reduce((a, r) => a + r.income, 0)
  const spent = rows.reduce((a, r) => a + r.expenses, 0)
  const invested = rows.reduce((a, r) => a + r.contributed, 0)

  /**
   * Período anterior de MESMO tamanho, para o "vs. anterior" da taxa.
   * Com a janela `'all'` não existe anterior — e dizer "vs." sobre um período
   * que não existe seria inventar comparação (a mesma disciplina do `Delta`
   * que devolve `null` sem base, R4 §3).
   */
  const prevMonths =
    w === 'all' || months.length === 0
      ? []
      : months.map((ym) => addMonths(ym, -months.length))
  const prevIncomeMap = incomeByMonth(data.salaryHistory, data.extraIncomes, prevMonths)
  const prevIncome = sumOver(prevIncomeMap, prevMonths)
  const prevSpent = sumOver(expenseMap, prevMonths)

  // Um mês "conta" quando teve movimentação: zero em mês sem registro não é
  // disciplina, é ausência. Mesmo critério do streak (M4).
  const activeRows = rows.filter((r) => r.income > 0 || r.expenses > 0)
  const bluesMonths = activeRows.filter((r) => r.net >= 0).length

  let biggest: TimelineStats['biggestExpense'] = null
  for (const e of data.expenses) {
    const ym = ymOfDate(e.date)
    if (!monthSet.has(ym)) continue
    if (biggest === null || e.amount > biggest.amount) {
      biggest = { description: e.description, amount: e.amount, ym }
    }
  }

  // Patrimônio acumulado: soma CORRIDA de sobra + aportes. É a curva de "o que
  // se construiu no período", não o saldo atual do ledger — que não tem
  // histórico (ver o marcador "· hoje" do hero, R4 §3).
  const cumulative: { ym: Ym; value: number }[] = []
  let running = 0
  for (const r of rows) {
    running += r.net + r.contributed
    cumulative.push({ ym: r.ym, value: running })
  }

  const byCategory = new Map<string, number>()
  for (const e of data.expenses) {
    if (!monthSet.has(ymOfDate(e.date))) continue
    byCategory.set(e.categoryId, (byCategory.get(e.categoryId) ?? 0) + e.amount)
  }
  const categoriesById = new Map(data.categories.map((c) => [c.id, c]))
  const topCategories = Array.from(byCategory.entries())
    .map(([id, total]) => ({ category: categoriesById.get(id), total }))
    .filter((r): r is { category: Category; total: number } => r.category !== undefined)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  const best = (pick: (r: MonthRow) => number, min = -Infinity): MonthRow | null => {
    let out: MonthRow | null = null
    for (const r of activeRows) {
      if (pick(r) <= min) continue
      if (out === null || pick(r) > pick(out)) out = r
    }
    return out
  }

  const years = groupYears(rows)

  return {
    months: rows,
    years,
    saved,
    savedPerMonth: months.length > 0 ? Math.round(saved / months.length) : 0,
    rate: savingsRatio(income, spent),
    ratePrev: w === 'all' ? null : savingsRatio(prevIncome, prevSpent),
    bluesMonths,
    activeMonths: activeRows.length,
    biggestExpense: biggest,
    cumulative,
    topCategories,
    totalExpenses: spent,
    invested,
    records: {
      bestNet: best((r) => r.net),
      worstNet: (() => {
        let out: MonthRow | null = null
        for (const r of activeRows) if (out === null || r.net < out.net) out = r
        return out
      })(),
      bestIncome: best((r) => r.income, 0),
      bestContribution: best((r) => r.contributed, 0),
      leanestMonth: (() => {
        let out: MonthRow | null = null
        for (const r of activeRows) {
          if (r.expenses <= 0) continue
          if (out === null || r.expenses < out.expenses) out = r
        }
        return out
      })(),
    },
    anyActivity: activeRows.length > 0 || invested > 0,
  }
}

/** Agrupa a série mensal por ano (base do comparativo ano vs. ano). */
export function groupYears(rows: readonly MonthRow[]): YearRow[] {
  const map = new Map<string, YearRow>()
  for (const r of rows) {
    const year = r.ym.slice(0, 4)
    const cur = map.get(year) ?? { year, income: 0, expenses: 0, net: 0, contributed: 0 }
    cur.income += r.income
    cur.expenses += r.expenses
    cur.net += r.net
    cur.contributed += r.contributed
    map.set(year, cur)
  }
  return Array.from(map.values()).sort((a, b) => a.year.localeCompare(b.year))
}
