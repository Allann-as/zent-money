import { useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, Scale, Target, Undo2 } from 'lucide-react'
import { EmptyState } from '@/design/components/EmptyState'
import { Button } from '@/design/components/Button'
import { Tooltip } from '@/design/components/Tooltip'
import { toast } from '@/design/components/toast'
import { useDataStore, useZentData } from '@/store/dataStore'
import { removeBudgetReallocation } from '@/store/mutations'
import { monthBudgets, type CategoryBudget } from '@/engine/budget'
import { formatPercent } from '@/engine/money'
import { useBRL } from '@/design/money'
import { formatYmLong, type Ym } from '@/engine/dates'
import { cn } from '@/lib/cn'
import type { Category } from '@/data/schema'
import { ReallocateBudgetModal } from './ReallocateBudgetModal'

type Status = 'ok' | 'near' | 'over'

/** ≥100% vermelho · ≥80% âmbar · abaixo, normal (M1 §c). */
function statusOf(spent: number, limit: number): Status {
  if (limit <= 0) return spent > 0 ? 'over' : 'ok'
  const ratio = spent / limit
  if (ratio >= 1) return 'over'
  if (ratio >= 0.8) return 'near'
  return 'ok'
}

/**
 * Painel de orçamento por categoria (M1 §c) — o MESMO em Visão geral e Gastos.
 * Mostra o disponível sobre o limite EFETIVO do mês (base ± realocações), pinta
 * âmbar/vermelho ao se aproximar/estourar, e traz a realocação: indicador
 * base→efetivo por categoria, lista do mês com desfazer, e o botão que abre o
 * modal. O gasto por categoria chega pronto de quem renderiza (uma passada só).
 */
export function BudgetPanel({
  spentByCategory,
  ym,
}: {
  spentByCategory: ReadonlyMap<string, number>
  ym: Ym
}): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const brl = useBRL()
  const [reallocateOpen, setReallocateOpen] = useState(false)

  const budgets = useMemo(
    () => monthBudgets(data.categories, data.budgetReallocations, ym),
    [data.categories, data.budgetReallocations, ym],
  )
  const categoriesById = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c])),
    [data.categories],
  )

  // Só as categorias com limite efetivo no mês entram no painel.
  const rows = useMemo(() => {
    const out: { category: Category; budget: CategoryBudget }[] = []
    for (const c of data.categories) {
      const budget = budgets.get(c.id)
      if (budget !== undefined && budget.effective !== null) out.push({ category: c, budget })
    }
    return out
  }, [data.categories, budgets])

  const monthReallocations = useMemo(
    () => data.budgetReallocations.filter((r) => r.ym === ym),
    [data.budgetReallocations, ym],
  )

  const hasLimits = rows.length > 0
  const canReallocate = rows.some((r) => (r.budget.effective ?? 0) > 0) || monthReallocations.length > 0

  function undoReallocation(id: string): void {
    mutate((d) => removeBudgetReallocation(d, id))
    toast.success('Realocação desfeita', 'O orçamento das categorias voltou ao valor anterior.')
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <span className="font-display text-[14px] font-semibold text-ink">Orçamento do mês</span>
        {canReallocate && (
          <Button variant="soft" size="sm" onClick={() => setReallocateOpen(true)}>
            <Scale size={13.5} /> Realocar
          </Button>
        )}
      </div>

      {!hasLimits ? (
        <EmptyState
          icon={Target}
          title="Nenhum limite definido"
          description="Defina limites mensais nas suas categorias (Gastos → Categorias) para acompanhar o orçamento — e realocar entre elas quando precisar."
          className="py-6"
        />
      ) : (
        <ul className="flex flex-col gap-3.5">
          {rows.map(({ category, budget }) => {
            const limit = budget.effective ?? 0
            const spent = spentByCategory.get(category.id) ?? 0
            const status = statusOf(spent, limit)
            const available = limit - spent
            const ratio = limit > 0 ? spent / limit : spent > 0 ? 1 : 0
            const reallocated = budget.base !== budget.effective
            const barColor =
              status === 'over' ? 'bg-neg' : status === 'near' ? 'bg-warn' : 'bg-primary'

            return (
              <li key={category.id}>
                <div className="flex items-center gap-2 text-[13px] mb-1">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: category.color }} />
                  <span className="font-medium text-ink truncate">{category.name}</span>
                  {reallocated && (
                    <Tooltip
                      side="top"
                      label={
                        <span className="tnum">
                          Base {brl(budget.base ?? 0)}
                          {budget.received > 0 ? ` · recebeu ${brl(budget.received)}` : ''}
                          {budget.ceded > 0 ? ` · cedeu ${brl(budget.ceded)}` : ''}
                        </span>
                      }
                    >
                      <span className="text-[11px] text-primary tnum bg-primary-soft rounded-full px-1.5 py-0.5 cursor-help">
                        {brl(budget.base ?? 0)} → {brl(limit)}
                      </span>
                    </Tooltip>
                  )}
                  <span className="ml-auto tnum text-ink-soft">
                    <strong className={cn('font-semibold', status === 'over' ? 'text-neg' : 'text-ink')}>
                      {brl(spent)}
                    </strong>{' '}
                    / {brl(limit)}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full bg-surface-2 overflow-hidden"
                  role="img"
                  aria-label={`${category.name}: ${formatPercent(ratio, 0)} do limite`}
                >
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-300', barColor)}
                    style={{ width: `${Math.min(1, ratio) * 100}%` }}
                  />
                </div>
                <p
                  className={cn(
                    'text-[11.5px] mt-1 tnum',
                    status === 'over' ? 'text-neg' : status === 'near' ? 'text-warn' : 'text-ink-faint',
                  )}
                >
                  {status === 'over'
                    ? `Limite atingido — ${brl(spent - limit)} acima do planejado`
                    : status === 'near'
                      ? `Restam ${brl(available)}`
                      : `Disponível: ${brl(available)} de ${brl(limit)}`}
                </p>
              </li>
            )
          })}
        </ul>
      )}

      {monthReallocations.length > 0 && (
        <div className="mt-4 pt-3 border-t border-line">
          <p className="label-caps mb-2">Realocações de {formatYmLong(ym)}</p>
          <ul className="flex flex-col gap-1.5">
            {monthReallocations.map((r) => {
              const fromName = categoriesById.get(r.fromCategoryId)?.name ?? 'categoria removida'
              const toName = categoriesById.get(r.toCategoryId)?.name ?? 'categoria removida'
              return (
                <li key={r.id} className="group flex items-center gap-2 text-[12.5px] text-ink-soft">
                  <span className="truncate">{fromName}</span>
                  <ArrowRight size={12} className="text-ink-faint shrink-0" />
                  <span className="truncate">{toName}</span>
                  <span className="ml-auto tnum text-ink font-medium shrink-0">{brl(r.amount)}</span>
                  <button
                    type="button"
                    aria-label={`Desfazer realocação de ${fromName} para ${toName}`}
                    title="Desfazer esta realocação"
                    onClick={() => undoReallocation(r.id)}
                    className="h-6 w-6 rounded-[7px] inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-3 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <Undo2 size={12} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <ReallocateBudgetModal open={reallocateOpen} onClose={() => setReallocateOpen(false)} />
    </>
  )
}
