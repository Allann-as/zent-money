import type { Purchase, ZentData } from '@/data/schema'
import { salaryForYm } from './aggregations'
import { availableLimit, totalInvoices, totalMonthlyCommitment } from './cards'
import { addMonths, ymOfDate, type Ym } from './dates'
import { scoreForMonth } from './score'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CRÉDITO — prévia de impacto do parcelamento (§7). Puro e determinístico.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * É o "freio consciente" contra o parcelamento impulsivo: antes de confirmar,
 * mostra o que a compra faz com o limite do cartão, com a saúde financeira e com
 * o quanto sobra do salário. Nada aqui grava — recebe a compra hipotética e
 * devolve os números.
 */

export interface InstallmentImpact {
  /** Valor de cada parcela (centavos). */
  perMonth: number
  installments: number
  firstYm: Ym
  lastYm: Ym
  /** Limite disponível do cartão DEPOIS da compra (centavos). */
  limitAfter: number
  /** Saúde financeira (score 0–100) antes e depois; null = sem score. */
  healthBefore: number | null
  healthAfter: number | null
  /** Salário disponível após os compromissos atuais, antes e depois da parcela. */
  salaryAvailableBefore: number
  salaryAvailableAfter: number
}

/**
 * Impacto de uma compra parcelada num cartão (§7).
 *
 * `salário disponível` = salário vigente do mês − compromissos atuais (faturas +
 * parcelas de cartão + avulsas) − nova parcela. É a conta aprovada: um número
 * conservador de "o que ainda sobra por mês" que serve de freio.
 *
 * A saúde DEPOIS é o MESMO `scoreForMonth`, recomputado sobre um estado
 * hipotético com a compra já lançada — sem duplicar a fórmula do score.
 */
export function installmentImpact(
  data: ZentData,
  cardId: string,
  installmentAmount: number,
  installments: number,
  todayIsoStr: string,
): InstallmentImpact | null {
  const card = data.cards.find((c) => c.id === cardId)
  if (!card || installmentAmount <= 0 || installments < 1) return null

  const ym = ymOfDate(todayIsoStr)
  const hypothetical: Purchase = {
    id: '__preview__',
    cardId,
    creditor: null,
    name: '__preview__',
    installmentAmount,
    totalInstallments: installments,
    paidInstallments: 0,
    startYm: ym,
  }

  const limitAfter = availableLimit(card, [...data.purchases, hypothetical])

  const salary = salaryForYm(data.salaryHistory, ym)
  const currentCommitments = totalInvoices(data.cards) + totalMonthlyCommitment(data.purchases)
  const salaryAvailableBefore = salary - currentCommitments
  const salaryAvailableAfter = salaryAvailableBefore - installmentAmount

  const healthBefore = scoreForMonth(data, ym)?.score ?? null
  const withPurchase: ZentData = { ...data, purchases: [...data.purchases, hypothetical] }
  const healthAfter = scoreForMonth(withPurchase, ym)?.score ?? null

  return {
    perMonth: installmentAmount,
    installments,
    firstYm: ym,
    lastYm: addMonths(ym, installments - 1),
    limitAfter,
    healthBefore,
    healthAfter,
    salaryAvailableBefore,
    salaryAvailableAfter,
  }
}

/** Leitura da saúde de crédito para o painel-resumo (§6): faturas × renda. */
export function creditHealthReading(invoicesTotal: number, monthlyIncome: number): string {
  if (monthlyIncome <= 0) return 'Sem renda registrada para comparar.'
  const ratio = invoicesTotal / monthlyIncome
  const pct = Math.round(ratio * 100)
  if (ratio <= 0.3) return `Suas faturas somam ${pct}% da renda — zona confortável.`
  if (ratio <= 0.5) return `Suas faturas somam ${pct}% da renda — atenção à zona amarela.`
  return `Suas faturas somam ${pct}% da renda — zona vermelha, cuidado.`
}
