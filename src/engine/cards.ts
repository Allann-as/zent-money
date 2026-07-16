import type { Card, Purchase } from '@/data/schema'
import { addMonths, currentYm, ymCompare, type Ym } from './dates'

/**
 * Regra central do limite (§5.4):
 *   disponível = limite total − fatura atual − Σ[(parcelas restantes) × (valor da parcela)]
 * das compras ativas do cartão.
 */

/** Parcelas que ainda faltam pagar de uma compra. */
export function remainingInstallments(p: Purchase): number {
  return Math.max(0, p.totalInstallments - p.paidInstallments)
}

/** Valor que ainda falta pagar de uma compra (centavos). */
export function remainingAmount(p: Purchase): number {
  return remainingInstallments(p) * p.installmentAmount
}

/** Soma comprometida em parcelas futuras de um cartão (centavos). */
export function committedAmount(cardId: string, purchases: readonly Purchase[]): number {
  let total = 0
  for (const p of purchases) {
    if (p.cardId === cardId) total += remainingAmount(p)
  }
  return total
}

/** Limite disponível do cartão segundo a regra central. */
export function availableLimit(card: Card, purchases: readonly Purchase[]): number {
  return card.limit - card.invoice - committedAmount(card.id, purchases)
}

/** Compromisso mensal do cartão: soma das parcelas/mês das compras ativas. */
export function monthlyCommitment(cardId: string, purchases: readonly Purchase[]): number {
  let total = 0
  for (const p of purchases) {
    if (p.cardId === cardId && remainingInstallments(p) > 0) total += p.installmentAmount
  }
  return total
}

/**
 * Mês previsto de quitação de uma compra parcelada.
 * Cronograma original: última parcela em startYm + (total − 1).
 * Se o pagamento está atrasado em relação ao cronograma, projeta as parcelas
 * restantes em meses consecutivos a partir do mês atual.
 * Retorna null se a compra já está quitada.
 */
export function payoffYm(p: Purchase, today: Ym = currentYm()): Ym | null {
  const remaining = remainingInstallments(p)
  if (remaining === 0) return null
  const scheduled = addMonths(p.startYm, p.totalInstallments - 1)
  const projected = addMonths(today, remaining - 1)
  return ymCompare(scheduled, projected) >= 0 ? scheduled : projected
}
