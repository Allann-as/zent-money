import type { BudgetReallocation, Category } from '@/data/schema'
import type { Ym } from './dates'

/**
 * Orçamento por categoria com realocação mensal (M1 §c).
 *
 * O limite BASE (`category.monthlyLimit`) vale sempre; o limite EFETIVO de um mês
 * pode diferir por **realocações** — mover parte do orçamento de uma categoria
 * para outra, só naquele mês:
 *
 *     efetivo(cat, mês) = base + Σ recebido(mês) − Σ cedido(mês)
 *
 * Como só entram na conta as realocações DAQUELE mês, a virada volta ao base
 * sozinha — não há estado a "resetar". É um conceito de ORÇAMENTO: não move
 * dinheiro, não toca o ledger nem o saldo de conta alguma. Uma categoria sem
 * limite base pode receber orçamento e ganhar um efetivo só no mês (decisão do
 * usuário); mas só cede quem tem limite (não se cede o que não se tem).
 */

export interface CategoryBudget {
  categoryId: string
  /** Limite base (`monthlyLimit`); null = sem limite base. */
  base: number | null
  /** Recebido de outras categorias neste mês. */
  received: number
  /** Cedido a outras categorias neste mês. */
  ceded: number
  /** Limite efetivo do mês; null = sem limite (base null e nenhuma realocação). */
  effective: number | null
}

interface Flow {
  received: number
  ceded: number
}

/** Recebido/cedido por categoria num mês — uma passada pelas realocações. */
function flowsByCategory(reallocations: readonly BudgetReallocation[], ym: Ym): Map<string, Flow> {
  const map = new Map<string, Flow>()
  const bump = (id: string, key: keyof Flow, amount: number): void => {
    const f = map.get(id) ?? { received: 0, ceded: 0 }
    f[key] += amount
    map.set(id, f)
  }
  for (const r of reallocations) {
    if (r.ym !== ym) continue
    bump(r.toCategoryId, 'received', r.amount)
    bump(r.fromCategoryId, 'ceded', r.amount)
  }
  return map
}

/** Combina base + fluxo num efetivo. `null` só quando não há base nem fluxo algum. */
function toEffective(base: number | null, flow: Flow): number | null {
  const net = flow.received - flow.ceded
  if (base === null && net === 0) return null
  return (base ?? 0) + net
}

/** Limite efetivo de UMA categoria no mês (null = sem limite). */
export function effectiveLimit(
  category: Category,
  reallocations: readonly BudgetReallocation[],
  ym: Ym,
): number | null {
  const flow = flowsByCategory(reallocations, ym).get(category.id) ?? { received: 0, ceded: 0 }
  return toEffective(category.monthlyLimit, flow)
}

/** Mapa categoryId → orçamento do mês (base, recebido, cedido, efetivo). */
export function monthBudgets(
  categories: readonly Category[],
  reallocations: readonly BudgetReallocation[],
  ym: Ym,
): Map<string, CategoryBudget> {
  const flows = flowsByCategory(reallocations, ym)
  const out = new Map<string, CategoryBudget>()
  for (const c of categories) {
    const flow = flows.get(c.id) ?? { received: 0, ceded: 0 }
    out.set(c.id, {
      categoryId: c.id,
      base: c.monthlyLimit,
      received: flow.received,
      ceded: flow.ceded,
      effective: toEffective(c.monthlyLimit, flow),
    })
  }
  return out
}

export interface ReallocationInput {
  fromCategoryId: string
  toCategoryId: string
  amount: number
}

/**
 * Valida uma nova realocação contra as que já existem no mês. Retorna a mensagem
 * de erro (para a UI mostrar) ou `null` quando é válida.
 *
 * Regras: valor positivo · categorias diferentes · a ORIGEM precisa ter limite
 * (efetivo não-nulo) e não pode ceder mais do que tem (o efetivo dela nunca fica
 * negativo). O DESTINO pode ser qualquer categoria, mesmo sem limite base.
 */
export function validateReallocation(
  categories: readonly Category[],
  reallocations: readonly BudgetReallocation[],
  ym: Ym,
  input: ReallocationInput,
): string | null {
  const { fromCategoryId, toCategoryId, amount } = input
  if (amount <= 0) return 'Informe um valor maior que zero.'
  if (fromCategoryId === toCategoryId) return 'Escolha duas categorias diferentes.'
  const from = categories.find((c) => c.id === fromCategoryId)
  const to = categories.find((c) => c.id === toCategoryId)
  if (from === undefined || to === undefined) return 'Categoria não encontrada.'
  const fromEffective = effectiveLimit(from, reallocations, ym)
  if (fromEffective === null) {
    return `${from.name} não tem limite definido — só é possível ceder de uma categoria com orçamento.`
  }
  if (amount > fromEffective) {
    return `${from.name} tem só o orçamento disponível para ceder; escolha um valor menor.`
  }
  return null
}
