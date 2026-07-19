import type { ZentData } from '@/data/schema'
import { salaryForYm, sumByMonth } from './aggregations'
import { indexToYm, ymOfDate, ymToIndex, type Ym } from './dates'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * STREAK — meses consecutivos "no azul" (M4). DERIVADO, não gravado.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Regras (§ do roadmap):
 *  · **azul** = o mês tem REGISTRO (gasto, extra ou crédito de salário) E a sobra
 *    (renda declarada − gasto) ≥ 0;
 *  · **vermelho** = tem registro mas a sobra < 0 → **zera** o streak;
 *  · **vazio** = mês SEM registro → **pausa** (não conta e não quebra).
 *
 * Uma vigência de salário que só persiste (sem gasto/extra/crédito naquele mês)
 * NÃO é um "registro": senão todo mês futuro ocioso contaria como azul. O que
 * conta é atividade real — por isso movimento = gasto>0 ∨ extra>0 ∨ crédito no mês.
 *
 * O streak é re-derivado dos dados (walk para trás a partir de `endYm`); nada é
 * persistido — assim a virada de ano e correções retroativas ficam corretas por
 * construção.
 */

export type MonthState = 'blue' | 'red' | 'empty'

/** Estado de um mês a partir da renda declarada, do gasto e de haver registro. */
export function monthState(income: number, spent: number, hasRecord: boolean): MonthState {
  if (!hasRecord) return 'empty'
  return income - spent >= 0 ? 'blue' : 'red'
}

/** Marcos do streak (§): o maior 3/6/12 alcançado, ou null. */
export function streakMilestone(streak: number): 3 | 6 | 12 | null {
  if (streak >= 12) return 12
  if (streak >= 6) return 6
  if (streak >= 3) return 3
  return null
}

/**
 * Streak atual: conta meses azuis consecutivos andando para trás a partir de
 * `endYm`, **pausando** nos vazios e **parando** no primeiro vermelho.
 */
export function currentStreak(data: ZentData, endYm: Ym): number {
  const spentMap = sumByMonth(data.expenses)
  const extrasMap = sumByMonth(data.extraIncomes)
  const creditedMonths = new Set(data.salaryCredits.map((c) => c.ym))

  // Limite inferior do walk: o mês de registro mais antigo. Sem registros → 0.
  let earliestIdx = Number.POSITIVE_INFINITY
  const consider = (ym: Ym): void => {
    const i = ymToIndex(ym)
    if (i < earliestIdx) earliestIdx = i
  }
  for (const e of data.expenses) consider(ymOfDate(e.date))
  for (const x of data.extraIncomes) consider(ymOfDate(x.date))
  for (const c of data.salaryCredits) consider(c.ym)
  if (!Number.isFinite(earliestIdx)) return 0

  let count = 0
  for (let idx = ymToIndex(endYm); idx >= earliestIdx; idx--) {
    const ym = indexToYm(idx)
    const spent = spentMap.get(ym) ?? 0
    const extras = extrasMap.get(ym) ?? 0
    const hasRecord = spent > 0 || extras > 0 || creditedMonths.has(ym)
    const income = salaryForYm(data.salaryHistory, ym) + extras
    const state = monthState(income, spent, hasRecord)
    if (state === 'red') break
    if (state === 'blue') count += 1
    // 'empty' → pausa: não conta, não quebra
  }
  return count
}
