import type { Expense, ExtraIncome, RecurringExpense, RecurringIncome } from '@/data/schema'
import { addMonths, daysInYm, ymCompare, type Ym } from './dates'

/**
 * Lançamentos recorrentes: cada template gera UM lançamento por mês, do
 * startYm até o endYm (ou para sempre). A materialização roda no boot,
 * cobrindo os meses entre `lastRecurringYm` (exclusivo) e o mês atual
 * (inclusivo). Instâncias são lançamentos normais (editáveis/excluíveis)
 * marcados com `recurringId`.
 */

/** Data ISO do lançamento de um template em um mês (dia 31 → último dia). */
export function recurrenceDate(ym: Ym, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, daysInYm(ym))
  return `${ym}-${String(day).padStart(2, '0')}`
}

function activeIn(t: { startYm: Ym; endYm: Ym | null }, ym: Ym): boolean {
  if (ymCompare(ym, t.startYm) < 0) return false
  if (t.endYm !== null && ymCompare(ym, t.endYm) > 0) return false
  return true
}

export interface MaterializedRecurrences {
  expenses: Omit<Expense, 'id'>[]
  incomes: Omit<ExtraIncome, 'id'>[]
  /** Novo valor para meta.lastRecurringYm. */
  lastYm: Ym
}

/**
 * Calcula os lançamentos a criar entre lastRecurringYm (exclusivo) e
 * currentYm (inclusivo). Pura — o chamador cria os IDs e persiste.
 * Com lastRecurringYm = null (primeira execução), apenas inicializa o
 * marcador no mês atual sem gerar nada retroativo.
 */
export function materializeRecurrences(
  recurringExpenses: readonly RecurringExpense[],
  recurringIncomes: readonly RecurringIncome[],
  lastRecurringYm: Ym | null,
  currentYm: Ym,
): MaterializedRecurrences {
  const expenses: Omit<Expense, 'id'>[] = []
  const incomes: Omit<ExtraIncome, 'id'>[] = []

  if (lastRecurringYm !== null && ymCompare(lastRecurringYm, currentYm) < 0) {
    let ym = addMonths(lastRecurringYm, 1)
    while (ymCompare(ym, currentYm) <= 0) {
      for (const t of recurringExpenses) {
        if (!activeIn(t, ym)) continue
        expenses.push({
          date: recurrenceDate(ym, t.dayOfMonth),
          categoryId: t.categoryId,
          description: t.description,
          amount: t.amount,
          essential: t.essential,
          // templates de recorrência não guardam origem: a instância nasce sem
          // origem e o usuário atribui depois, se quiser
          origin: null,
          recurringId: t.id,
        })
      }
      for (const t of recurringIncomes) {
        if (!activeIn(t, ym)) continue
        incomes.push({
          date: recurrenceDate(ym, t.dayOfMonth),
          description: t.description,
          amount: t.amount,
          // como a origem dos gastos, o template não guarda a conta: a instância
          // nasce sem vínculo e o usuário atribui depois, se quiser (R4 §1.2)
          receivedIn: null,
          recurringId: t.id,
        })
      }
      ym = addMonths(ym, 1)
    }
  }

  return { expenses, incomes, lastYm: currentYm }
}
