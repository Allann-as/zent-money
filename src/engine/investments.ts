import type { Contribution, Investment, Rates, ValueUpdate } from '@/data/schema'
import { annualRate, monthlyRate } from './rates'
import { currentYm, lastMonths, ymCompare, ymOfDate, ymToIndex, indexToYm, type Ym } from './dates'

/**
 * Série mensal de uma aplicação — algoritmo incremental obrigatório (§7):
 *   saldo[m] = saldo[m−1] × (1 + im) + aportes[m]        O(meses + aportes)
 *   rend[m]  = saldo[m] − saldo[m−1] − aportes[m]
 * A série SEMPRE termina no mês atual — nunca projeta futuro.
 * Internamente calcula em float (centavos) e arredonda na saída.
 */

export interface MonthlySeries {
  months: Ym[]
  /** Saldo ao fim de cada mês (centavos, arredondado). */
  balances: number[]
  /** Aportes somados em cada mês (centavos). */
  contributions: number[]
  /** Juros puros do mês (centavos, arredondado): rend[m]. */
  yields: number[]
  /** Rentabilidade % do mês: rend[m] / saldo[m−1] (fração; 0 no 1º mês). */
  yieldRatios: number[]
}

const EMPTY_SERIES: MonthlySeries = {
  months: [],
  balances: [],
  contributions: [],
  yields: [],
  yieldRatios: [],
}

/** Agrupa aportes por mês em passada única. */
export function contributionsByMonth(contributions: readonly Contribution[]): Map<Ym, number> {
  const map = new Map<Ym, number>()
  for (const c of contributions) {
    const ym = ymOfDate(c.date)
    map.set(ym, (map.get(ym) ?? 0) + c.amount)
  }
  return map
}

/**
 * Constrói a série mensal do primeiro aporte até `endYm` (padrão: mês atual).
 * `im` é a taxa mensal (fração). Aporte do mês entra sem juros no próprio mês
 * e compõe a partir do mês seguinte.
 */
export function buildSeries(
  contributions: readonly Contribution[],
  im: number,
  endYm: Ym = currentYm(),
): MonthlySeries {
  if (contributions.length === 0) return EMPTY_SERIES
  const byMonth = contributionsByMonth(contributions)
  let firstYm: Ym | null = null
  for (const ym of byMonth.keys()) {
    if (firstYm === null || ymCompare(ym, firstYm) < 0) firstYm = ym
  }
  if (firstYm === null || ymCompare(firstYm, endYm) > 0) return EMPTY_SERIES

  const startIdx = ymToIndex(firstYm)
  const endIdx = ymToIndex(endYm)
  const months: Ym[] = []
  const balances: number[] = []
  const monthContribs: number[] = []
  const yields: number[] = []
  const yieldRatios: number[] = []

  let balanceFloat = 0
  for (let i = startIdx; i <= endIdx; i++) {
    const ym = indexToYm(i)
    const aporte = byMonth.get(ym) ?? 0
    const prev = balanceFloat
    const juros = prev * im
    balanceFloat = prev + juros + aporte

    months.push(ym)
    monthContribs.push(aporte)
    balances.push(Math.round(balanceFloat))
    yields.push(Math.round(juros))
    yieldRatios.push(prev > 0 ? juros / prev : 0)
  }

  return { months, balances, contributions: monthContribs, yields, yieldRatios }
}

/**
 * Série de um ativo de VALOR MANUAL ("Outros ativos"): o saldo de cada mês é
 * a última atualização de valor de mercado até o fim do mês (carry-forward);
 * antes da primeira atualização, usa o acumulado de aportes como melhor
 * estimativa. O rendimento segue a fórmula da spec:
 *   rend[m] = saldo[m] − saldo[m−1] − aportes[m]
 */
export function manualSeries(
  valueUpdates: readonly ValueUpdate[],
  contributions: readonly Contribution[],
  endYm: Ym = currentYm(),
): MonthlySeries {
  if (valueUpdates.length === 0 && contributions.length === 0) return EMPTY_SERIES

  const contribByMonth = contributionsByMonth(contributions)
  const updates = [...valueUpdates].sort((a, b) => a.date.localeCompare(b.date))

  let firstYm: Ym | null = updates.length > 0 ? ymOfDate(updates[0]?.date ?? '') : null
  for (const ym of contribByMonth.keys()) {
    if (firstYm === null || ymCompare(ym, firstYm) < 0) firstYm = ym
  }
  if (firstYm === null || ymCompare(firstYm, endYm) > 0) return EMPTY_SERIES

  const startIdx = ymToIndex(firstYm)
  const endIdx = ymToIndex(endYm)
  const months: Ym[] = []
  const balances: number[] = []
  const monthContribs: number[] = []
  const yields: number[] = []
  const yieldRatios: number[] = []

  let ui = 0
  let lastUpdate: number | null = null
  let cumContrib = 0
  let prevBalance = 0
  for (let i = startIdx; i <= endIdx; i++) {
    const ym = indexToYm(i)
    const aporte = contribByMonth.get(ym) ?? 0
    cumContrib += aporte
    // consome todas as atualizações até o fim deste mês
    while (ui < updates.length && ymCompare(ymOfDate(updates[ui]?.date ?? ''), ym) <= 0) {
      lastUpdate = updates[ui]?.value ?? lastUpdate
      ui++
    }
    const balance = lastUpdate ?? cumContrib
    const rend = balance - prevBalance - aporte

    months.push(ym)
    monthContribs.push(aporte)
    balances.push(balance)
    yields.push(rend)
    yieldRatios.push(prevBalance > 0 ? rend / prevBalance : 0)
    prevBalance = balance
  }

  return { months, balances, contributions: monthContribs, yields, yieldRatios }
}

/** Série de uma aplicação cadastrada, com a taxa derivada do seu tipo. */
export function investmentSeries(
  investment: Investment,
  allContributions: readonly Contribution[],
  rates: Rates,
  endYm: Ym = currentYm(),
): MonthlySeries {
  const own = allContributions.filter((c) => c.investmentId === investment.id)
  if (investment.rateType === 'manual') {
    return manualSeries(investment.valueUpdates, own, endYm)
  }
  const im = monthlyRate(annualRate(investment.rateType, investment.rateParam, rates))
  return buildSeries(own, im, endYm)
}

export interface InvestmentSnapshot {
  /** Saldo estimado hoje (centavos). */
  balance: number
  /** Total aportado (centavos). */
  invested: number
  /** Rendimento acumulado (centavos). */
  totalYield: number
  /** Rentabilidade acumulada sobre o aportado (fração). */
  totalYieldRatio: number
  /** Taxa anual % a.a. */
  annualPercent: number
  /** Taxa mensal (fração). */
  monthly: number
  /** Rende/mês estimado com o saldo atual (centavos). */
  yieldPerMonth: number
  /** Rende/ano estimado com o saldo atual (centavos). */
  yieldPerYear: number
  /** false para ativos de valor manual (sem taxa automática). */
  hasRate: boolean
}

/** Números consolidados de uma aplicação (cartão individual e painel). */
export function investmentSnapshot(
  investment: Investment,
  allContributions: readonly Contribution[],
  rates: Rates,
  endYm: Ym = currentYm(),
): InvestmentSnapshot {
  const series = investmentSeries(investment, allContributions, rates, endYm)
  const balance = series.balances.length > 0 ? (series.balances[series.balances.length - 1] ?? 0) : 0
  const invested = series.contributions.reduce((a, b) => a + b, 0)
  const totalYield = balance - invested
  const hasRate = investment.rateType !== 'manual'
  const annualPercent = annualRate(investment.rateType, investment.rateParam, rates)
  const monthly = hasRate ? monthlyRate(annualPercent) : 0
  return {
    balance,
    invested,
    totalYield,
    totalYieldRatio: invested > 0 ? totalYield / invested : 0,
    annualPercent,
    monthly,
    yieldPerMonth: Math.round(balance * monthly),
    yieldPerYear: Math.round(balance * (annualPercent / 100)),
    hasRate,
  }
}

/**
 * Soma várias séries alinhando meses — janela dos últimos `n` meses até `endYm`.
 * Meses anteriores ao início de uma série contam como saldo 0 dela.
 */
export function combineSeries(seriesList: readonly MonthlySeries[], endYm: Ym, n: number): MonthlySeries {
  const window = lastMonths(endYm, n)
  const balances = new Array<number>(window.length).fill(0)
  const contribs = new Array<number>(window.length).fill(0)
  const yields = new Array<number>(window.length).fill(0)

  for (const s of seriesList) {
    if (s.months.length === 0) continue
    const firstIdx = ymToIndex(s.months[0] ?? '')
    const lastIdx = ymToIndex(s.months[s.months.length - 1] ?? '')
    window.forEach((ym, wi) => {
      const idx = ymToIndex(ym)
      if (idx < firstIdx) return
      // após o fim da série (não deve ocorrer se endYm = mês atual), usa o último saldo
      const si = Math.min(idx, lastIdx) - firstIdx
      balances[wi] = (balances[wi] ?? 0) + (s.balances[si] ?? 0)
      if (idx <= lastIdx) {
        contribs[wi] = (contribs[wi] ?? 0) + (s.contributions[si] ?? 0)
        yields[wi] = (yields[wi] ?? 0) + (s.yields[si] ?? 0)
      }
    })
  }

  const ratios = window.map((_, i) => {
    if (i === 0) return 0
    const prev = balances[i - 1] ?? 0
    return prev > 0 ? (yields[i] ?? 0) / prev : 0
  })

  return { months: window, balances, contributions: contribs, yields, yieldRatios: ratios }
}
