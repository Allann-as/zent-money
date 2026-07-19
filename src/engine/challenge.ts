import type { Challenge, ChallengeRecord, ZentData } from '@/data/schema'
import { addMonths, ymCompare, type Ym } from './dates'
import { expensesByCategory } from './aggregations'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * DESAFIO MENSAL (M4) — um ativo por vez, criado pelo usuário.
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  · **cap**    → "máx R$ X em [categoria]" naquele mês (met = gasto ≤ X).
 *  · **reduce** → "Y% menos que o mês passado" (alvo = mês anterior×(1−Y/100)).
 *
 * Avaliado na VIRADA (quando o mês do desafio já passou): o resultado vai para o
 * histórico e o ativo é limpo. Tudo derivado do gasto real da categoria — nada
 * de placar paralelo. `met` usa `≤` (bater o alvo exatamente conta).
 */

/** Gasto na categoria do desafio no mês `ym` (centavos). */
function spendIn(data: ZentData, categoryId: string, ym: Ym): number {
  return expensesByCategory(data.expenses, ym).get(categoryId) ?? 0
}

/** Alvo efetivo do desafio em centavos (o cap, ou mês-anterior×(1−redução)). */
export function challengeTarget(challenge: Challenge, data: ZentData): number {
  if (challenge.kind === 'cap') return challenge.capAmount
  const prev = spendIn(data, challenge.categoryId, addMonths(challenge.ym, -1))
  return Math.round(prev * (1 - challenge.reducePercent / 100))
}

/** Gasto real na categoria no mês do desafio (centavos). */
export function challengeActual(challenge: Challenge, data: ZentData): number {
  return spendIn(data, challenge.categoryId, challenge.ym)
}

/** Fração 0–1 do alvo já consumida (para a barra do widget). */
export function challengeProgress(challenge: Challenge, data: ZentData): number {
  const target = challengeTarget(challenge, data)
  if (target <= 0) return challengeActual(challenge, data) > 0 ? 1 : 0
  return Math.min(1, challengeActual(challenge, data) / target)
}

/** Resultado de um desafio (usado na virada e para a prévia do widget). */
export function evaluateChallenge(challenge: Challenge, data: ZentData): ChallengeRecord {
  const target = challengeTarget(challenge, data)
  const actual = challengeActual(challenge, data)
  return { challenge, target, actual, met: actual <= target }
}

/** O mês do desafio já passou em relação a `currentYm`? (hora de avaliar) */
export function challengeIsOver(challenge: Challenge, currentYm: Ym): boolean {
  return ymCompare(challenge.ym, currentYm) < 0
}
