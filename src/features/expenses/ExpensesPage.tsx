import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BarChart3, Pencil, PieChart, Plus, ReceiptText, Repeat, Scale, Settings2, Tags, Trash2 } from 'lucide-react'
import { PageHeader } from '@/features/common/PageHeader'
import { MonthNav } from '@/features/common/MonthNav'
import { RecurringModal } from '@/features/common/RecurringModal'
import { Card, CardTitle } from '@/design/components/Card'
import { BudgetPanel } from '@/features/budget/BudgetPanel'
import { ReallocateBudgetModal } from '@/features/budget/ReallocateBudgetModal'
import { Donut, type DonutSlice } from '@/design/charts/Donut'
import { Button } from '@/design/components/Button'
import { Select } from '@/design/components/Select'
import { Modal } from '@/design/components/Modal'
import { EmptyState } from '@/design/components/EmptyState'
import { toast } from '@/design/components/toast'
import { confirmDialog } from '@/design/components/confirm'
import { useDataStore, useZentData } from '@/store/dataStore'
import { removeExpense as removeExpenseRecipe } from '@/store/mutations'
import { useUiStore } from '@/store/uiStore'
import { essentialSplit, expensesByCategory, groupByMonth } from '@/engine/aggregations'
import { formatBRL, formatPercent } from '@/engine/money'
import { formatDateShort, formatYmLong } from '@/engine/dates'
import { cn } from '@/lib/cn'
import type { Category, Expense } from '@/data/schema'
import { CategoriesOnboarding } from './CategoriesOnboarding'
import { CategoryDialog, type CategoryDialogState } from './CategoryDialog'
import { ExpenseDialog, type ExpenseDialogState } from './ExpenseDialog'

export function ExpensesPage(): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const ym = useUiStore((s) => s.activeYm)
  const chartMode = useUiStore((s) => s.categoryChartMode)
  const setChartMode = useUiStore((s) => s.setCategoryChartMode)

  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState>('closed')
  const [expenseDialog, setExpenseDialog] = useState<ExpenseDialogState>('closed')
  const [manageOpen, setManageOpen] = useState(false)
  const [recurringOpen, setRecurringOpen] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [originFilter, setOriginFilter] = useState<string>('all')
  /** Categoria a receber orçamento quando o aviso de estouro pede realocação. */
  const [reallocateTo, setReallocateTo] = useState<string | null>(null)

  // Ação rápida vinda da paleta de comandos (Ctrl+K)
  const pendingAction = useUiStore((s) => s.pendingAction)
  const setPendingAction = useUiStore((s) => s.setPendingAction)
  useEffect(() => {
    if (pendingAction === 'new-expense') {
      setPendingAction(null)
      if (data.categories.length > 0) setExpenseDialog('new')
    }
  }, [pendingAction, setPendingAction, data.categories.length])

  const categoriesById = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c])),
    [data.categories],
  )

  // agrupamento por mês memoizado — trocar de mês não varre o histórico (§10.4)
  const expensesByYm = useMemo(() => groupByMonth(data.expenses), [data.expenses])
  const monthExpenses = useMemo(
    () => [...(expensesByYm.get(ym) ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [expensesByYm, ym],
  )

  const byCategory = useMemo(() => expensesByCategory(monthExpenses, ym), [monthExpenses, ym])
  const monthTotal = useMemo(
    () => Array.from(byCategory.values()).reduce((a, b) => a + b, 0),
    [byCategory],
  )
  const split = useMemo(() => essentialSplit(monthExpenses, ym), [monthExpenses, ym])

  /** Filtro por origem (R3 §5): 'all' · 'none' · 'bank:<id>' · 'card:<id>'. */
  function matchesOrigin(e: Expense): boolean {
    if (originFilter === 'all') return true
    if (originFilter === 'none') return e.origin === null
    if (e.origin === null) return false
    const key = e.origin.kind === 'bank' ? `bank:${e.origin.bankId}` : `card:${e.origin.cardId}`
    return key === originFilter
  }

  const byCategoryFilter =
    filter === 'all' ? monthExpenses : monthExpenses.filter((e) => e.categoryId === filter)
  const filtered = originFilter === 'all' ? byCategoryFilter : byCategoryFilter.filter(matchesOrigin)
  const filteredTotal =
    originFilter === 'all'
      ? filter === 'all'
        ? monthTotal
        : (byCategory.get(filter) ?? 0)
      : filtered.reduce((a, e) => a + e.amount, 0)
  const filterCategory = filter === 'all' ? null : categoriesById.get(filter)

  const summary = useMemo(() => {
    const rows = Array.from(byCategory.entries())
      .map(([id, total]) => ({ category: categoriesById.get(id), total }))
      .filter((r): r is { category: Category; total: number } => r.category !== undefined)
      .sort((a, b) => b.total - a.total)
    const max = rows[0]?.total ?? 0
    // Fatias da rosca: a MESMA fonte das barras, cor da categoria (M1 §b).
    const slices: DonutSlice[] = rows.map((r) => ({
      id: r.category.id,
      label: r.category.name,
      value: r.total,
      color: r.category.color,
    }))
    return { rows, max, slices }
  }, [byCategory, categoriesById])

  async function removeExpense(e: Expense): Promise<void> {
    const cat = categoriesById.get(e.categoryId)
    const ok = await confirmDialog({
      title: 'Excluir gasto',
      message: `Excluir ${formatBRL(e.amount)} em "${cat?.name ?? 'categoria'}"${
        e.description ? ` (${e.description})` : ''
      }? Essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    mutate((d) => removeExpenseRecipe(d, e.id))
    toast.success('Gasto excluído')
  }

  function toggleEssential(e: Expense): void {
    mutate((d) => {
      const x = d.expenses.find((y) => y.id === e.id)
      if (x) x.essential = !x.essential
    })
  }

  if (data.categories.length === 0) {
    return (
      <>
        <PageHeader title="Gastos" subtitle="Para onde o dinheiro está indo" />
        <CategoriesOnboarding onCreateCustom={() => setCategoryDialog('new')} />
        <CategoryDialog state={categoryDialog} onClose={() => setCategoryDialog('closed')} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Gastos"
        subtitle="Para onde o dinheiro está indo"
        actions={
          <>
            <Button variant="outline" size="md" onClick={() => setRecurringOpen(true)}>
              <Repeat size={14} /> Recorrentes
            </Button>
            <Button variant="outline" size="md" onClick={() => setManageOpen(true)}>
              <Tags size={14} /> Categorias
            </Button>
            <Button onClick={() => setExpenseDialog('new')}>
              <Plus size={15} /> Novo gasto
            </Button>
            <MonthNav />
          </>
        }
      />

      <div className="grid grid-cols-5 gap-4 mb-4">
        {/* Resumo por categoria */}
        <Card className="col-span-3 p-5">
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Resumo por categoria</CardTitle>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-ink-soft tnum">
                Total: <strong className="text-ink font-semibold">{formatBRL(monthTotal)}</strong>
              </span>
              {/* Toggle barras/rosca (M1 §b) — preferência persistida no uiStore */}
              <div
                className="inline-flex rounded-control border border-line p-0.5"
                role="radiogroup"
                aria-label="Visualização do resumo por categoria"
              >
                {(
                  [
                    { mode: 'bars', Icon: BarChart3, label: 'Barras' },
                    { mode: 'donut', Icon: PieChart, label: 'Rosca' },
                  ] as const
                ).map(({ mode, Icon, label }) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={chartMode === mode}
                    aria-label={label}
                    title={label}
                    onClick={() => setChartMode(mode)}
                    className={cn(
                      'h-7 w-7 rounded-[7px] inline-flex items-center justify-center transition-colors cursor-pointer',
                      chartMode === mode
                        ? 'bg-primary-soft text-primary'
                        : 'text-ink-faint hover:text-ink hover:bg-surface-2',
                    )}
                  >
                    <Icon size={14} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          {summary.rows.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="Nenhum gasto neste mês"
              description="Registre o primeiro gasto para ver o resumo por categoria."
              className="py-6"
            />
          ) : chartMode === 'donut' ? (
            <div className="py-2">
              <Donut
                slices={summary.slices}
                centerTitle="Total do mês"
                centerValue={formatBRL(monthTotal)}
              />
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {summary.rows.map(({ category, total }) => {
                const pct = monthTotal > 0 ? total / monthTotal : 0
                return (
                  <li key={category.id}>
                    <button
                      type="button"
                      onClick={() => setFilter(filter === category.id ? 'all' : category.id)}
                      className="w-full text-left cursor-pointer group"
                      title={`Filtrar por ${category.name}`}
                    >
                      <div className="flex items-center gap-2 text-[13px] mb-1">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: category.color }}
                        />
                        <span
                          className={cn(
                            'font-medium truncate group-hover:text-primary transition-colors',
                            filter === category.id ? 'text-primary' : 'text-ink',
                          )}
                        >
                          {category.name}
                        </span>
                        <span className="ml-auto tnum text-ink font-semibold">{formatBRL(total)}</span>
                        <span className="tnum text-ink-faint w-12 text-right">
                          {formatPercent(pct, 0)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-[width] duration-300"
                          style={{
                            width: `${summary.max > 0 ? (total / summary.max) * 100 : 0}%`,
                            background: category.color,
                          }}
                        />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Necessário × Supérfluo */}
        <Card className="col-span-2 p-5">
          <CardTitle className="mb-4 flex items-center gap-2">
            <Scale size={15} className="text-ink-soft" /> Necessário × Supérfluo
          </CardTitle>
          {split.total === 0 ? (
            <p className="text-[13px] text-ink-faint leading-relaxed py-4">
              Classifique seus gastos ao lançar — aqui você descobre quanto do mês foi essencial e
              quanto dava para poupar.
            </p>
          ) : (
            <>
              <div
                className="h-3 rounded-full overflow-hidden flex bg-surface-2"
                role="img"
                aria-label={`Necessário ${formatPercent(1 - split.superfluousRatio, 0)}, supérfluo ${formatPercent(split.superfluousRatio, 0)}`}
              >
                <div
                  className="h-full bg-pos transition-[width] duration-300"
                  style={{ width: `${(1 - split.superfluousRatio) * 100}%` }}
                />
                <div
                  className="h-full bg-warn transition-[width] duration-300"
                  style={{ width: `${split.superfluousRatio * 100}%` }}
                />
              </div>
              <div className="flex justify-between mt-3 text-[12.5px]">
                <span className="text-ink-soft">
                  <span className="inline-block h-2 w-2 rounded-full bg-pos mr-1.5" />
                  Necessário{' '}
                  <strong className="text-ink tnum font-semibold">{formatBRL(split.essential)}</strong>
                </span>
                <span className="text-ink-soft">
                  <span className="inline-block h-2 w-2 rounded-full bg-warn mr-1.5" />
                  Supérfluo{' '}
                  <strong className="text-ink tnum font-semibold">{formatBRL(split.superfluous)}</strong>
                </span>
              </div>
              <p className="text-[13px] text-ink-soft mt-4 pt-3 border-t border-line leading-relaxed">
                {split.superfluous > 0 ? (
                  <>
                    <strong className="text-warn tnum">{formatBRL(split.superfluous)}</strong> supérfluos —{' '}
                    <strong className="text-warn tnum">{formatPercent(split.superfluousRatio, 0)}</strong>{' '}
                    do mês; é aqui que dá pra poupar.
                  </>
                ) : (
                  <>Mês 100% necessário — nada de supérfluo até agora.</>
                )}
              </p>
            </>
          )}
        </Card>
      </div>

      {/* Orçamento do mês (M1 §c): disponível/âmbar/vermelho + realocação */}
      <Card className="p-5 mb-4">
        <BudgetPanel spentByCategory={byCategory} ym={ym} />
      </Card>

      {/* Lista de lançamentos */}
      <Card>
        <div className="flex items-center gap-3 px-5 pt-4 pb-3">
          <CardTitle>Lançamentos de {formatYmLong(ym)}</CardTitle>
          <div className="ml-auto flex items-center gap-2.5">
            {filterCategory && (
              <span className="text-[12.5px] text-ink-soft tnum">
                <strong className="text-ink font-semibold">{formatBRL(filteredTotal)}</strong> em{' '}
                {filterCategory.name} ·{' '}
                {formatPercent(monthTotal > 0 ? filteredTotal / monthTotal : 0, 0)} do total
              </span>
            )}
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8.5 w-44 text-[13px]"
              aria-label="Filtrar por categoria"
            >
              <option value="all">Todas as categorias</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {/* R3 §5 — filtro por origem, consequência do "Pago com" (§3.4) */}
            <Select
              value={originFilter}
              onChange={(e) => setOriginFilter(e.target.value)}
              className="h-8.5 w-44 text-[13px]"
              aria-label="Filtrar por origem"
            >
              <option value="all">Todas as origens</option>
              <option value="none">Sem origem</option>
              {data.banks.length > 0 && (
                <optgroup label="Contas">
                  {data.banks.map((b) => (
                    <option key={b.id} value={`bank:${b.id}`}>
                      {b.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {data.cards.length > 0 && (
                <optgroup label="Cartões">
                  {data.cards.map((c) => (
                    <option key={c.id} value={`card:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={filter === 'all' ? 'Nenhum gasto neste mês' : 'Nenhum gasto nesta categoria'}
            description="Tudo que você lançar aparece aqui, com edição e reclassificação em um clique."
            action={
              <Button variant="soft" size="sm" onClick={() => setExpenseDialog('new')}>
                <Plus size={14} /> Lançar gasto
              </Button>
            }
          />
        ) : (
          <ul className="px-2 pb-2">
            {filtered.map((e) => {
              const cat = categoriesById.get(e.categoryId)
              return (
                <li
                  key={e.id}
                  className="group flex items-center gap-3 px-3 h-12 rounded-[10px] hover:bg-surface-2 transition-colors"
                >
                  <span className="text-[12px] text-ink-faint tnum w-14 shrink-0">
                    {formatDateShort(e.date)}
                  </span>
                  <span
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: `${cat?.color}22`, color: cat?.color }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: cat?.color }} />
                    {cat?.name ?? '—'}
                  </span>
                  <span className="flex-1 text-[13.5px] text-ink truncate">
                    {e.description || <span className="text-ink-faint">sem descrição</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleEssential(e)}
                    title="Clique para reclassificar"
                    className={cn(
                      'text-[11px] font-semibold px-2 py-0.5 rounded-full cursor-pointer transition-colors shrink-0',
                      e.essential
                        ? 'bg-pos-soft text-pos hover:bg-pos/25'
                        : 'bg-warn-soft text-warn hover:bg-warn/25',
                    )}
                  >
                    {e.essential ? 'Necessário' : 'Supérfluo'}
                  </button>
                  <span className="text-[13.5px] font-semibold text-ink tnum w-24 text-right">
                    {formatBRL(e.amount)}
                  </span>
                  <span className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      aria-label="Editar gasto"
                      onClick={() => setExpenseDialog(e)}
                      className="h-7 w-7 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-3 cursor-pointer"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="Excluir gasto"
                      onClick={() => void removeExpense(e)}
                      className="h-7 w-7 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-neg hover:bg-neg-soft cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <CategoryDialog state={categoryDialog} onClose={() => setCategoryDialog('closed')} />
      <ExpenseDialog
        state={expenseDialog}
        onClose={() => setExpenseDialog('closed')}
        onReallocate={(categoryId) => setReallocateTo(categoryId)}
      />
      <ReallocateBudgetModal
        open={reallocateTo !== null}
        onClose={() => setReallocateTo(null)}
        {...(reallocateTo !== null ? { defaultToCategoryId: reallocateTo } : {})}
      />
      <RecurringModal kind="expense" open={recurringOpen} onClose={() => setRecurringOpen(false)} />
      <ManageCategoriesModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        onEdit={(c) => {
          setManageOpen(false)
          setCategoryDialog(c)
        }}
        onNew={() => {
          setManageOpen(false)
          setCategoryDialog('new')
        }}
      />
    </>
  )
}

function ManageCategoriesModal({
  open,
  onClose,
  onEdit,
  onNew,
}: {
  open: boolean
  onClose(): void
  onEdit(c: Category): void
  onNew(): void
}): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)

  async function remove(c: Category): Promise<void> {
    const count = data.expenses.filter((e) => e.categoryId === c.id).length
    const ok = await confirmDialog({
      title: `Excluir "${c.name}"`,
      message:
        count > 0
          ? `Esta categoria tem ${count} ${count === 1 ? 'lançamento' : 'lançamentos'}, que serão excluídos junto. Essa ação não pode ser desfeita.`
          : 'Essa ação não pode ser desfeita.',
      confirmLabel: 'Excluir tudo',
      danger: true,
    })
    if (!ok) return
    mutate((d) => {
      d.categories = d.categories.filter((x) => x.id !== c.id)
      d.expenses = d.expenses.filter((e) => e.categoryId !== c.id)
    })
    toast.success(`Categoria "${c.name}" excluída`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Categorias"
      width={480}
      footer={
        <Button onClick={onNew}>
          <Plus size={14} /> Nova categoria
        </Button>
      }
    >
      {data.categories.length === 0 ? (
        <p className="text-[13px] text-ink-soft py-4">Nenhuma categoria ainda.</p>
      ) : (
        <ul className="flex flex-col -mx-1">
          {data.categories.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 px-3 h-11 rounded-[10px] hover:bg-surface-2 transition-colors"
            >
              <span className="h-3 w-3 rounded-full shrink-0" style={{ background: c.color }} />
              <span className="flex-1 text-[13.5px] text-ink truncate">{c.name}</span>
              <span className="text-[12px] text-ink-faint tnum">
                {c.monthlyLimit !== null ? `limite ${formatBRL(c.monthlyLimit)}` : 'sem limite'}
              </span>
              <button
                type="button"
                aria-label={`Editar categoria ${c.name}`}
                onClick={() => onEdit(c)}
                className="h-7 w-7 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-3 cursor-pointer"
              >
                <Settings2 size={13.5} />
              </button>
              <button
                type="button"
                aria-label={`Excluir categoria ${c.name}`}
                onClick={() => void remove(c)}
                className="h-7 w-7 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-neg hover:bg-neg-soft cursor-pointer"
              >
                <Trash2 size={13.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
