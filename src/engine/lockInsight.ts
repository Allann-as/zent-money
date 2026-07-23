import type { ZentData } from '@/data/schema'
import { currentStreak, streakMilestone } from './streak'
import { scoreForMonth } from './score'
import { boxStoredAmount } from './ledger'
import { investmentSnapshot } from './investments'
import { currentYm } from './dates'
import { formatBRL } from './money'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LINHA VIVA DA TELA DE BLOQUEIO (R10 §⑦)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * A frase rotativa sob a saudação de desbloqueio, montada com DADO REAL:
 * sequência no azul, meta mais próxima, score de saúde e marcos. Tudo derivado
 * dos mesmos motores do app (`currentStreak`, `scoreForMonth`, o guardado das
 * caixinhas) — nenhuma conta nova.
 *
 * ── A VARIANTE DE PRIVACIDADE NÃO É COSMÉTICA ───────────────────────────
 * Cada linha tem `full` (com o número) e `masked` (SEM número nenhum). A tela de
 * bloqueio aparece ANTES da autenticação e é uma captura fácil; com a
 * privacidade ligada, um valor ali seria o mesmo vazamento que a máscara do M2
 * fecha no resto do app. Por isso `masked` não carrega dígito algum — e um teste
 * assere que, sob privacidade, nenhum `R$ <dígito>` chega ao DOM da tela.
 */

export interface LockInsight {
  /** Chave estável, para o teste apontar a linha sem depender do texto. */
  key: string
  /** Texto com número (privacidade desligada). */
  full: string
  /** Texto SEM número algum (privacidade ligada). */
  masked: string
}

/** Guardado real de uma caixinha (manual → transfers; vinculada → snapshot). */
function boxCurrent(data: ZentData, box: ZentData['boxes'][number]): number {
  if (box.investmentId) {
    const inv = data.investments.find((i) => i.id === box.investmentId)
    if (inv) return investmentSnapshot(inv, data.contributions, data.rates).balance
  }
  return boxStoredAmount(box.id, box.manualAmount, data.boxTransfers)
}

/**
 * As linhas disponíveis AGORA, em ordem de prioridade. A UI rotaciona entre
 * elas; se nada houver (arquivo recém-criado), devolve uma linha de acolhida
 * sem número, que serve aos dois modos.
 */
export function lockInsights(data: ZentData, today = currentYm()): LockInsight[] {
  const out: LockInsight[] = []

  // 1) Marco de sequência (tem precedência: é a novidade mais forte)
  const streak = currentStreak(data, today)
  const milestone = streakMilestone(streak)
  if (milestone !== null) {
    out.push({
      key: 'milestone',
      full: `Marco de ${milestone} meses no azul — sua maior constância até aqui.`,
      masked: 'Você bateu um novo marco de constância no azul.',
    })
  } else if (streak >= 1) {
    out.push({
      key: 'streak',
      full: `Você está há ${streak} ${streak === 1 ? 'mês' : 'meses'} seguidos no azul.`,
      masked: 'Sua sequência de meses no azul segue firme.',
    })
  }

  // 2) Meta mais próxima de ser batida (maior progresso ainda incompleto)
  let nearest: { name: string; ratio: number } | null = null
  for (const box of data.boxes) {
    if (box.target <= 0) continue
    const ratio = boxCurrent(data, box) / box.target
    if (ratio >= 1) continue
    if (nearest === null || ratio > nearest.ratio) nearest = { name: box.name, ratio }
  }
  if (nearest !== null && nearest.ratio >= 0.5) {
    const pct = Math.round(nearest.ratio * 100)
    out.push({
      key: 'goal',
      full: `A meta "${nearest.name}" já está em ${pct}% do alvo.`,
      masked: `A meta "${nearest.name}" está quase batida.`,
    })
  }

  // 3) Score de saúde do mês corrente
  const score = scoreForMonth(data, today)
  if (score !== null) {
    out.push({
      key: 'score',
      full: `Seu score de saúde financeira está em ${score.score} de 100.`,
      masked: 'Seu score de saúde financeira está calculado e à sua espera.',
    })
  }

  // 4) Total guardado — só como último recurso, e sempre com máscara à mão
  const totalStored = data.boxes.reduce((a, b) => a + boxCurrent(data, b), 0)
  if (out.length === 0 && totalStored > 0) {
    out.push({
      key: 'stored',
      full: `Você já guardou ${formatBRL(totalStored)} nas suas metas.`,
      masked: 'Suas metas já têm um bom tanto guardado.',
    })
  }

  if (out.length === 0) {
    out.push({
      key: 'welcome',
      full: 'Que bom te ver de volta. Seus dados seguem só seus, neste computador.',
      masked: 'Que bom te ver de volta. Seus dados seguem só seus, neste computador.',
    })
  }

  return out
}
