import type { Card, Expense, ExtraIncome, SalaryEntry } from '@/data/schema'
import { daysInYm, ymCompare, ymOfDate, type Ym } from './dates'

/**
 * Banco de origem de um gasto (R3 §3.4), ou null se ele não tem origem.
 * Origem-cartão conta para o banco DONO do cartão — é isso que faz o
 * drill-down mostrar "gastos pagos por este banco" incluindo os do cartão.
 * Cartão apagado (id órfão) → null: nunca atribui a um banco errado.
 */
export function expenseBankId(e: Expense, cardsById: ReadonlyMap<string, Card>): string | null {
  if (e.origin === null) return null
  if (e.origin.kind === 'bank') return e.origin.bankId
  return cardsById.get(e.origin.cardId)?.bankId ?? null
}

/** Gastos de um mês pagos por um banco (conta ou qualquer cartão dele). */
export function expensesOfBank(
  expenses: readonly Expense[],
  bankId: string,
  cardsById: ReadonlyMap<string, Card>,
): Expense[] {
  return expenses.filter((e) => expenseBankId(e, cardsById) === bankId)
}

/**
 * Agregações de gastos/ganhos — sempre em PASSADA ÚNICA sobre os dados
 * (mapas mês→soma), nunca N varreduras (§7).
 */

interface Dated {
  date: string
  amount: number
}

/**
 * Agrupa itens por mês em uma passada. Memoizado nas telas para que
 * navegar entre meses seja apenas um lookup — nunca uma nova varredura.
 */
export function groupByMonth<T extends Dated>(items: readonly T[]): Map<Ym, T[]> {
  const map = new Map<Ym, T[]>()
  for (const it of items) {
    const ym = ymOfDate(it.date)
    const list = map.get(ym)
    if (list) list.push(it)
    else map.set(ym, [it])
  }
  return map
}

/** Map mês → soma (centavos), uma passada. */
export function sumByMonth(items: readonly Dated[]): Map<Ym, number> {
  const map = new Map<Ym, number>()
  for (const it of items) {
    const ym = ymOfDate(it.date)
    map.set(ym, (map.get(ym) ?? 0) + it.amount)
  }
  return map
}

/** Salário vigente em um mês: entrada mais recente com startYm ≤ ym. */
export function salaryForYm(history: readonly SalaryEntry[], ym: Ym): number {
  let best: SalaryEntry | null = null
  for (const e of history) {
    if (ymCompare(e.startYm, ym) <= 0 && (best === null || ymCompare(e.startYm, best.startYm) > 0)) {
      best = e
    }
  }
  return best?.amount ?? 0
}

/** Map mês → total de entradas (salário vigente + extras) para uma janela. */
export function incomeByMonth(
  history: readonly SalaryEntry[],
  extras: readonly ExtraIncome[],
  months: readonly Ym[],
): Map<Ym, number> {
  const extrasMap = sumByMonth(extras)
  const map = new Map<Ym, number>()
  for (const ym of months) {
    map.set(ym, salaryForYm(history, ym) + (extrasMap.get(ym) ?? 0))
  }
  return map
}

/** Gastos de um mês somados por categoria — uma passada. */
export function expensesByCategory(expenses: readonly Expense[], ym: Ym): Map<string, number> {
  const map = new Map<string, number>()
  for (const e of expenses) {
    if (ymOfDate(e.date) !== ym) continue
    map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + e.amount)
  }
  return map
}

export interface MonthPace {
  /** Gasto acumulado no mês (centavos). */
  spentSoFar: number
  /** Gasto médio por dia corrido (centavos). */
  avgPerDay: number
  /** Projeção de fechamento no ritmo atual (centavos). */
  projected: number
  daysElapsed: number
  daysInMonth: number
  /** true quando o mês já fechou (projeção = realizado). */
  closed: boolean
}

/**
 * Ritmo do mês (§7 R2): gasto médio diário e projeção de fechamento.
 * Mês passado → fechado (projeção = total). Mês futuro → zeros.
 */
export function monthPace(
  monthExpenses: readonly Dated[],
  ym: Ym,
  todayIsoStr: string,
): MonthPace {
  const total = monthExpenses.reduce((a, e) => a + e.amount, 0)
  const days = daysInYm(ym)
  const todayYm = ymOfDate(todayIsoStr)
  if (ymCompare(ym, todayYm) < 0) {
    return {
      spentSoFar: total,
      avgPerDay: Math.round(total / days),
      projected: total,
      daysElapsed: days,
      daysInMonth: days,
      closed: true,
    }
  }
  if (ymCompare(ym, todayYm) > 0) {
    return { spentSoFar: 0, avgPerDay: 0, projected: 0, daysElapsed: 0, daysInMonth: days, closed: false }
  }
  const elapsed = Math.max(1, Number(todayIsoStr.slice(8, 10)))
  const avg = total / elapsed
  return {
    spentSoFar: total,
    avgPerDay: Math.round(avg),
    projected: Math.round(avg * days),
    daysElapsed: elapsed,
    daysInMonth: days,
    closed: false,
  }
}

export interface EssentialSplit {
  essential: number
  superfluous: number
  total: number
  superfluousRatio: number
}

/** Painel Necessário × Supérfluo de um mês — uma passada. */
export function essentialSplit(expenses: readonly Expense[], ym: Ym): EssentialSplit {
  let essential = 0
  let superfluous = 0
  for (const e of expenses) {
    if (ymOfDate(e.date) !== ym) continue
    if (e.essential) essential += e.amount
    else superfluous += e.amount
  }
  const total = essential + superfluous
  return { essential, superfluous, total, superfluousRatio: total > 0 ? superfluous / total : 0 }
}
