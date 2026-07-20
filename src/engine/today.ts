import type { ZentData } from '@/data/schema'
import { monthBudgets } from './budget'
import {
  addDaysIso,
  daysInYm,
  mondayOfIso,
  weekdayShort,
  ymOfDate,
  type Ym,
} from './dates'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TELA "HOJE" — o loop diário (v2.1 §2). Tudo DERIVADO, nada gravado.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * As três peças de dado da tela Hoje são funções puras sobre `data` + a data
 * de hoje (injetável, para teste): o limite diário (anel), a fita da semana e
 * o streak diário (ignição). Nenhuma persiste estado — reabrir/virar o dia
 * recomputa da base, como score e streak do M4.
 */

// ── Limite diário (o anel) ──────────────────────────────────────────────────

/** De onde saiu o limite do dia — governa a leitura honesta quando não há teto. */
export type DailyLimitSource = 'budget' | 'cap' | 'none'

export interface DailyConsumption {
  /** Limite do dia em centavos; null quando não há orçamento nem teto definido. */
  limit: number | null
  source: DailyLimitSource
  /** Gasto de HOJE (centavos). */
  spentToday: number
  /** Gasto do mês ANTES de hoje (entra na fórmula do limite). */
  spentBeforeToday: number
  /** Quanto ainda cabe hoje (limit − spentToday); null sem limite. Nunca < 0. */
  remaining: number | null
  /** spentToday / limit (0..∞); 0 quando não há limite. */
  ratio: number
  /** true quando o gasto de hoje passou do limite (anel vira coral). */
  over: boolean
  /** Nº de lançamentos de hoje (para a frase viva). */
  countToday: number
}

/**
 * Consumo do dia (§2). O limite diário se **auto-corrige**:
 *
 *   limite = (Σ limites efetivos das categorias do mês − gasto do mês até ontem)
 *            ÷ dias restantes do mês (hoje incluso)
 *
 * Estourou ontem → o numerador encolhe → hoje aperta; economizou → hoje folga.
 * Reusa o limite EFETIVO do M1c (base + realocações do mês), sem inventar campo.
 * Sem nenhuma categoria com limite → cai no `dailyCap` configurável; sem os dois
 * → `limit = null` e o anel mostra só o gasto, sem denominador (a mesma
 * honestidade do "sem score ainda" do M4 — nunca se inventa um teto).
 */
export function dailyConsumption(
  data: ZentData,
  todayIsoStr: string,
  dailyCap: number | null,
): DailyConsumption {
  const ym = ymOfDate(todayIsoStr)
  const today = Number(todayIsoStr.slice(8, 10))
  const daysLeft = Math.max(1, daysInYm(ym) - today + 1) // hoje incluso

  let spentToday = 0
  let spentThisMonth = 0
  let countToday = 0
  for (const e of data.expenses) {
    if (ymOfDate(e.date) !== ym) continue
    spentThisMonth += e.amount
    if (e.date === todayIsoStr) {
      spentToday += e.amount
      countToday += 1
    }
  }
  const spentBeforeToday = spentThisMonth - spentToday

  // Σ limites efetivos (não-nulos) das categorias no mês
  let sumEffective = 0
  let hasBudget = false
  for (const b of monthBudgets(data.categories, data.budgetReallocations, ym).values()) {
    if (b.effective !== null) {
      sumEffective += b.effective
      hasBudget = true
    }
  }

  let limit: number | null
  let source: DailyLimitSource
  if (hasBudget) {
    limit = Math.max(0, Math.round((sumEffective - spentBeforeToday) / daysLeft))
    source = 'budget'
  } else if (dailyCap !== null && dailyCap > 0) {
    limit = dailyCap
    source = 'cap'
  } else {
    limit = null
    source = 'none'
  }

  const remaining = limit === null ? null : Math.max(0, limit - spentToday)
  const over = limit !== null && spentToday > limit
  const ratio = limit && limit > 0 ? spentToday / limit : 0
  return { limit, source, spentToday, spentBeforeToday, remaining, ratio, over, countToday }
}

// ── Resumo do dia (entrou / saiu / cabe) ────────────────────────────────────

export interface DaySummary {
  /** Entradas de hoje: extras recebidos hoje (centavos). */
  inToday: number
  /** Saídas de hoje (gastos, centavos). */
  outToday: number
}

/** Entrou/saiu HOJE — para o bloco "resumo do dia". */
export function daySummary(data: ZentData, todayIsoStr: string): DaySummary {
  let inToday = 0
  let outToday = 0
  for (const e of data.expenses) if (e.date === todayIsoStr) outToday += e.amount
  for (const x of data.extraIncomes) if (x.date === todayIsoStr) inToday += x.amount
  return { inToday, outToday }
}

// ── Fita da semana ──────────────────────────────────────────────────────────

export type WeekDayState = 'done' | 'today' | 'past-empty' | 'future'

export interface WeekDay {
  iso: string
  /** Dia do mês (número exibido). */
  day: number
  /** Rótulo curto: "Seg", "Ter"… */
  label: string
  state: WeekDayState
  /** true quando houve ao menos um gasto nesse dia. */
  registered: boolean
}

/**
 * Fita da semana (§2): 7 blocos Seg→Dom da semana ATUAL. Dias com registro
 * acendem; hoje ganha o anel âmbar; futuros esmaecem. Deriva de um Set de datas
 * com gasto — uma passada pelos gastos.
 */
export function weekRibbon(data: ZentData, todayIsoStr: string): WeekDay[] {
  const registered = new Set<string>()
  for (const e of data.expenses) registered.add(e.date)
  const monday = mondayOfIso(todayIsoStr)
  const out: WeekDay[] = []
  for (let i = 0; i < 7; i++) {
    const iso = addDaysIso(monday, i)
    const has = registered.has(iso)
    let state: WeekDayState
    if (iso === todayIsoStr) state = 'today'
    else if (iso > todayIsoStr) state = 'future'
    else state = has ? 'done' : 'past-empty'
    out.push({ iso, day: Number(iso.slice(8, 10)), label: weekdayShort(iso), state, registered: has })
  }
  return out
}

// ── Streak diário (ignição) ─────────────────────────────────────────────────

/**
 * Streak diário (§2, "sequência de ignição"): dias CONSECUTIVOS com ao menos um
 * gasto, terminando em hoje. Se hoje ainda não teve registro, a contagem termina
 * em ONTEM — o dia corrente só "quebra" quando passa sem nada, não no instante
 * em que amanhece (senão o streak zeraria toda manhã antes do 1º lançamento).
 */
export function dailyStreak(data: ZentData, todayIsoStr: string): number {
  const registered = new Set<string>()
  for (const e of data.expenses) registered.add(e.date)
  let cursor = registered.has(todayIsoStr) ? todayIsoStr : addDaysIso(todayIsoStr, -1)
  let count = 0
  while (registered.has(cursor)) {
    count += 1
    cursor = addDaysIso(cursor, -1)
  }
  return count
}

/** Marcos do streak diário (espelha o mensal do M4: 3/7/14/30). */
export function dailyStreakMilestone(streak: number): 3 | 7 | 14 | 30 | null {
  if (streak >= 30) return 30
  if (streak >= 14) return 14
  if (streak >= 7) return 7
  if (streak >= 3) return 3
  return null
}

/** Ym de hoje — reexport de conveniência para as telas do loop diário. */
export function todayYm(todayIsoStr: string): Ym {
  return ymOfDate(todayIsoStr)
}
