import type { Achievement, ZentData } from '@/data/schema'
import type { Ym } from './dates'
import { indexToYm, ymOfDate, ymToIndex } from './dates'
import { expensesByCategory } from './aggregations'
import { monthBudgets } from './budget'
import { remainingInstallments } from './cards'
import { buildScoreCache, scoreForMonth } from './score'
import { currentStreak } from './streak'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CONQUISTAS (M4) — ~12 medalhas sóbrias, idempotentes, retroativas.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Cada conquista é um EVENTO: uma vez desbloqueada (com data), fica — mesmo que
 * o dado que a disparou mude depois (por isso persiste em `data.gamification`).
 * `metAchievementIds` diz o que está SATISFEITO agora; `evaluateAchievements`
 * desbloqueia o que ainda falta, de forma **idempotente** (já desbloqueada é
 * no-op). No 1º boot após o M4 a avaliação roda **em silêncio** (retroativo),
 * sem toasts — quem chama decide (ver store).
 *
 * Score e streak entram como derivados (deterministas), não como estado gravado.
 */

export type MedalIcon =
  | 'piggy'
  | 'sparkle'
  | 'coins'
  | 'trend'
  | 'flame'
  | 'gauge'
  | 'target'
  | 'check'
  | 'download'
  | 'trophy'

export interface AchievementDef {
  id: string
  title: string
  /** Critério — vira a dica da medalha bloqueada. */
  hint: string
  icon: MedalIcon
}

/** Catálogo (ordem = ordem na estante). */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first-box', title: 'Primeira meta batida', hint: 'Complete 100% de uma caixinha', icon: 'piggy' },
  { id: 'first-contribution', title: 'Primeiro aporte', hint: 'Faça seu primeiro aporte', icon: 'sparkle' },
  { id: 'invested-1k', title: 'Mil investidos', hint: 'Some mil reais em aportes', icon: 'coins' },
  { id: 'invested-5k', title: 'Cinco mil investidos', hint: 'Some cinco mil reais em aportes', icon: 'coins' },
  { id: 'invested-10k', title: 'Dez mil investidos', hint: 'Some dez mil reais em aportes', icon: 'trend' },
  { id: 'streak-3', title: 'Trimestre no azul', hint: '3 meses seguidos no azul', icon: 'flame' },
  { id: 'streak-6', title: 'Semestre no azul', hint: '6 meses seguidos no azul', icon: 'flame' },
  { id: 'streak-12', title: 'Ano no azul', hint: '12 meses seguidos no azul', icon: 'flame' },
  { id: 'score-80', title: 'Saúde de ferro', hint: 'Feche um mês com score ≥ 80', icon: 'gauge' },
  { id: 'all-within', title: 'Orçamento no ponto', hint: 'Um mês com todas as categorias no limite', icon: 'target' },
  { id: 'installment-paid', title: 'Dívida quitada', hint: 'Quite uma compra parcelada', icon: 'check' },
  { id: 'first-backup', title: 'Cópia guardada', hint: 'Exporte um backup dos seus dados', icon: 'download' },
  { id: 'challenges-3', title: 'Disciplina', hint: 'Cumpra 3 desafios mensais', icon: 'trophy' },
]

/** Meses com registro (gasto/extra/crédito), da mais antiga até `endYm`. */
function recordMonths(data: ZentData, endYm: Ym): Ym[] {
  let earliest = Number.POSITIVE_INFINITY
  const consider = (ym: Ym): void => {
    const i = ymToIndex(ym)
    if (i < earliest) earliest = i
  }
  for (const e of data.expenses) consider(ymOfDate(e.date))
  for (const x of data.extraIncomes) consider(ymOfDate(x.date))
  for (const c of data.salaryCredits) consider(c.ym)
  if (!Number.isFinite(earliest)) return []
  const out: Ym[] = []
  for (let i = earliest; i <= ymToIndex(endYm); i++) out.push(indexToYm(i))
  return out
}

/** Um mês fechou com TODAS as categorias orçadas dentro do limite efetivo? */
function allWithinInMonth(data: ZentData, ym: Ym): boolean {
  const budgets = monthBudgets(data.categories, data.budgetReallocations, ym)
  const spent = expensesByCategory(data.expenses, ym)
  let budgetedCount = 0
  for (const b of budgets.values()) {
    if (b.effective === null) continue
    budgetedCount += 1
    if ((spent.get(b.categoryId) ?? 0) > b.effective) return false
  }
  return budgetedCount > 0
}

/** Conjunto de conquistas SATISFEITAS agora (não necessariamente desbloqueadas). */
export function metAchievementIds(data: ZentData, currentYm: Ym): Set<string> {
  const met = new Set<string>()

  if (data.boxes.some((b) => b.celebrated)) met.add('first-box')
  if (data.contributions.length > 0) met.add('first-contribution')

  const invested = data.contributions.reduce((a, c) => a + c.amount, 0)
  if (invested >= 100_000) met.add('invested-1k')
  if (invested >= 500_000) met.add('invested-5k')
  if (invested >= 1_000_000) met.add('invested-10k')

  const streak = currentStreak(data, currentYm)
  if (streak >= 3) met.add('streak-3')
  if (streak >= 6) met.add('streak-6')
  if (streak >= 12) met.add('streak-12')

  if (data.purchases.some((p) => remainingInstallments(p) === 0)) met.add('installment-paid')
  if (data.meta.lastManualExport !== null) met.add('first-backup')
  if (data.gamification.challengeHistory.filter((r) => r.met).length >= 3) met.add('challenges-3')

  // Varredura dos meses com registro para os critérios "algum mês…". O cache do
  // score é construído UMA vez e reusado por todos os meses (sem ele, cada mês
  // re-varreria os 50k gastos — regressão de perf pega no teste 50k).
  const cache = buildScoreCache(data)
  for (const ym of recordMonths(data, currentYm)) {
    if (!met.has('score-80')) {
      const s = scoreForMonth(data, ym, cache)
      if (s !== null && s.score >= 80) met.add('score-80')
    }
    if (!met.has('all-within') && allWithinInMonth(data, ym)) met.add('all-within')
    if (met.has('score-80') && met.has('all-within')) break
  }

  return met
}

export interface AchievementEval {
  /** Lista completa de conquistas desbloqueadas após esta avaliação. */
  unlocked: Achievement[]
  /** Ids desbloqueados AGORA (para toast; vazio no retroativo silencioso). */
  newlyUnlocked: string[]
}

/**
 * Avalia e desbloqueia (idempotente). `todayIsoStr` data o desbloqueio. Não
 * muta a entrada — devolve a nova lista; quem chama decide toast × silêncio.
 */
export function evaluateAchievements(data: ZentData, currentYm: Ym, todayIsoStr: string): AchievementEval {
  const met = metAchievementIds(data, currentYm)
  const have = new Set(data.gamification.achievements.map((a) => a.id))
  const unlocked = [...data.gamification.achievements]
  const newlyUnlocked: string[] = []
  // Percorre na ordem do catálogo para desbloqueios estáveis.
  for (const def of ACHIEVEMENTS) {
    if (met.has(def.id) && !have.has(def.id)) {
      unlocked.push({ id: def.id, unlockedAt: todayIsoStr })
      newlyUnlocked.push(def.id)
    }
  }
  return { unlocked, newlyUnlocked }
}
