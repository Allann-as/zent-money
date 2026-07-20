import type { ZentData } from '@/data/schema'
import { salaryForYm, sumByMonth } from './aggregations'
import { monthBudgets } from './budget'
import { indexToYm, ymOfDate, ymToIndex, type Ym } from './dates'
import { monthState } from './streak'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * COMBUSTÍVEL (XP) — v2.1 §2. DERIVADO, nunca gravado (disciplina do M4).
 * ═══════════════════════════════════════════════════════════════════════
 *
 * O M4 NÃO entregou XP — é peça nova. Mantém a disciplina do score/streak:
 * recomputa da base toda vez, determinístico, nada persistido. Assim virada de
 * mês e correções retroativas ficam corretas por construção.
 *
 * ── XP vem de HÁBITO e DISCIPLINA, nunca de VOLUME DE MOVIMENTO ──────────
 * A regra que blinda o incentivo (decisão do usuário): a barra tem de encher
 * por SAÚDE FINANCEIRA, não por quantidade de lançamentos. Dois cuidados:
 *
 *  1. **Hábito é por DIA ÚNICO com atividade, no máximo uma vez por dia** —
 *     nunca por lançamento. Registrar 1 ou 20 gastos num dia rende o MESMO +15.
 *     Assim, spammar cadastros não move a barra: o ato saudável é o hábito de
 *     registrar diariamente, não ter muitos gastos.
 *  2. **Os componentes de disciplina pesam mais que o de hábito no acumulado do
 *     mês.** Cada evento de disciplina (mês no azul +150, limite respeitado +40,
 *     caixinha batida +200) vale, sozinho, mais que um dia de hábito (+15); e o
 *     hábito é LIMITADO por mês (`HABIT_MONTH_CAP`), de modo que um mês
 *     genuinamente disciplinado (azul + alguns limites, ou azul + uma caixinha)
 *     supera o teto do hábito. Nenhuma release futura deve inverter esses pesos
 *     sem intenção — ver DECISOES.
 */

export const XP = {
  /** Por DIA ÚNICO com ao menos um gasto (máx. uma vez/dia). */
  HABIT_PER_DAY: 15,
  /** Teto do hábito por mês — garante que a disciplina possa dominar. */
  HABIT_MONTH_CAP: 250,
  /** Mês fechado "no azul" (sobra ≥ 0 com registro). */
  BLUE_MONTH: 150,
  /** Cada categoria que fechou o mês dentro do limite efetivo. */
  LIMIT_RESPECTED: 40,
  /** Cada caixinha que bateu a meta (100%). */
  BOX_HIT: 200,
  /** Tamanho de cada nível. */
  LEVEL_SIZE: 500,
} as const

export interface XpBreakdown {
  habit: number
  blueMonths: number
  limitsRespected: number
  boxes: number
  /** Total = habit + disciplina. */
  total: number
  /** Soma dos componentes de disciplina (para a leitura "disciplina > hábito"). */
  discipline: number
  /** Nível atual (1-based). */
  level: number
  /** XP acumulado DENTRO do nível atual. */
  intoLevel: number
  /** XP que falta para o próximo nível. */
  toNext: number
}

/**
 * XP total (derivado de todo o histórico). Uma passada pelos gastos monta os
 * agregados por mês (dias únicos e gasto por categoria) para não re-varrer os
 * 50k a cada mês — mesma disciplina do `ScoreCache` (perf 50k). O restante é
 * O(meses).
 */
export function xpBreakdown(data: ZentData, todayIsoStr: string): XpBreakdown {
  // Passada única: dias únicos por mês + gasto por (mês, categoria).
  const uniqueDaysByMonth = new Map<Ym, Set<string>>()
  const spentByMonthCat = new Map<Ym, Map<string, number>>()
  let earliestIdx = Number.POSITIVE_INFINITY
  for (const e of data.expenses) {
    const ym = ymOfDate(e.date)
    const days = uniqueDaysByMonth.get(ym) ?? new Set<string>()
    days.add(e.date)
    uniqueDaysByMonth.set(ym, days)
    const byCat = spentByMonthCat.get(ym) ?? new Map<string, number>()
    byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + e.amount)
    spentByMonthCat.set(ym, byCat)
    const i = ymToIndex(ym)
    if (i < earliestIdx) earliestIdx = i
  }

  const spentByMonth = sumByMonth(data.expenses)
  const extrasByMonth = sumByMonth(data.extraIncomes)
  const creditedMonths = new Set(data.salaryCredits.map((c) => c.ym))

  // Também consideramos meses com extra/crédito como "registro" (igual ao streak).
  for (const x of data.extraIncomes) earliestIdx = Math.min(earliestIdx, ymToIndex(ymOfDate(x.date)))
  for (const c of data.salaryCredits) earliestIdx = Math.min(earliestIdx, ymToIndex(c.ym))

  let habit = 0
  let blueMonths = 0
  let limitsRespected = 0

  if (Number.isFinite(earliestIdx)) {
    const endIdx = ymToIndex(ymOfDate(todayIsoStr))
    for (let idx = earliestIdx; idx <= endIdx; idx++) {
      const ym = indexToYm(idx)
      const spent = spentByMonth.get(ym) ?? 0
      const extras = extrasByMonth.get(ym) ?? 0
      const hasRecord = spent > 0 || extras > 0 || creditedMonths.has(ym)
      if (!hasRecord) continue // mês ocioso não gera XP (nem hábito, nem disciplina)

      // Hábito — dias únicos com gasto, limitado por mês.
      const days = uniqueDaysByMonth.get(ym)?.size ?? 0
      habit += Math.min(days * XP.HABIT_PER_DAY, XP.HABIT_MONTH_CAP)

      // Mês no azul.
      const income = salaryForYm(data.salaryHistory, ym) + extras
      if (monthState(income, spent, hasRecord) === 'blue') blueMonths += XP.BLUE_MONTH

      // Limites respeitados — só categorias COM limite efetivo naquele mês.
      const byCat = spentByMonthCat.get(ym)
      for (const b of monthBudgets(data.categories, data.budgetReallocations, ym).values()) {
        if (b.effective === null) continue
        const catSpent = byCat?.get(b.categoryId) ?? 0
        if (catSpent <= b.effective) limitsRespected += XP.LIMIT_RESPECTED
      }
    }
  }

  // Caixinhas batidas — `celebrated` marca que a meta foi alcançada (uma fonte
  // única; não recomputa o valor da caixinha aqui).
  const boxes = data.boxes.filter((b) => b.celebrated).length * XP.BOX_HIT

  const discipline = blueMonths + limitsRespected + boxes
  const total = habit + discipline
  const level = Math.floor(total / XP.LEVEL_SIZE) + 1
  const intoLevel = total % XP.LEVEL_SIZE
  const toNext = XP.LEVEL_SIZE - intoLevel
  return { habit, blueMonths, limitsRespected, boxes, total, discipline, level, intoLevel, toNext }
}
