import { useMemo, type ReactNode } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  ChartPie,
  Target,
  Wallet,
} from 'lucide-react'
import { PageHeader } from '@/features/common/PageHeader'
import { MonthNav } from '@/features/common/MonthNav'
import { Card, CardTitle } from '@/design/components/Card'
import { StatCard } from '@/design/components/StatCard'
import { SummaryBalloon } from '@/design/components/SummaryBalloon'
import { EmptyState } from '@/design/components/EmptyState'
import { Donut } from '@/design/charts/Donut'
import { Bars } from '@/design/charts/Bars'
import { Sparkline } from '@/design/charts/Sparkline'
import { useChartColors } from '@/design/charts/useChartColors'
import { useZentData } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import {
  essentialSplit,
  expensesByCategory,
  groupByMonth,
  incomeByMonth,
  sumByMonth,
} from '@/engine/aggregations'
import { combineSeries, investmentSeries, investmentSnapshot } from '@/engine/investments'
import { monthlyCommitment } from '@/engine/cards'
import { formatBRL, formatPercent } from '@/engine/money'
import { currentYm, formatYmLong, formatYmShort, formatYmTiny, lastMonths } from '@/engine/dates'
import { cn } from '@/lib/cn'
import type { Category } from '@/data/schema'

export function OverviewPage(): ReactNode {
  const data = useZentData()
  const ym = useUiStore((s) => s.activeYm)
  const colors = useChartColors()

  // ── Patrimônio (hero) ──────────────────────────────────────────────
  const wealth = useMemo(() => {
    const inAccounts = data.banks.reduce((a, b) => a + b.balance, 0)
    const snapshots = data.investments.map((inv) =>
      investmentSnapshot(inv, data.contributions, data.rates),
    )
    const invested = snapshots.reduce((a, s) => a + s.balance, 0)
    const perMonth = snapshots.reduce((a, s) => a + s.yieldPerMonth, 0)
    // Sparkline: evolução do investido nos últimos 12m + saldo em conta atual
    const series = combineSeries(
      data.investments.map((inv) => investmentSeries(inv, data.contributions, data.rates)),
      currentYm(),
      12,
    )
    const sparkValues = series.balances.map((b) => b + inAccounts)
    return { inAccounts, invested, perMonth, total: inAccounts + invested, sparkValues }
  }, [data.banks, data.investments, data.contributions, data.rates])

  // Mapa mês→total de gastos calculado UMA vez por mudança de dados —
  // navegar entre meses não varre o histórico completo de novo (§10.4)
  const expensesMap = useMemo(() => sumByMonth(data.expenses), [data.expenses])

  // ── Mês ativo ──────────────────────────────────────────────────────
  const month = useMemo(() => {
    const income = incomeByMonth(data.salaryHistory, data.extraIncomes, [ym]).get(ym) ?? 0
    const spent = expensesMap.get(ym) ?? 0
    const net = income - spent
    const commitments =
      data.cards.reduce((a, c) => a + monthlyCommitment(c.id, data.purchases), 0) +
      data.cards.reduce((a, c) => a + c.invoice, 0)
    return { income, spent, net, commitments }
  }, [data, expensesMap, ym])

  // ── Rosca por categoria + orçamento ───────────────────────────────
  const categoriesById = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c])),
    [data.categories],
  )
  // gastos agrupados por mês UMA vez; trocar de mês é só um lookup
  const expensesByYm = useMemo(() => groupByMonth(data.expenses), [data.expenses])
  const monthExpenses = useMemo(() => expensesByYm.get(ym) ?? [], [expensesByYm, ym])
  const byCategory = useMemo(() => expensesByCategory(monthExpenses, ym), [monthExpenses, ym])
  const donutSlices = useMemo(
    () =>
      Array.from(byCategory.entries())
        .map(([id, value]) => ({ category: categoriesById.get(id), value }))
        .filter((r): r is { category: Category; value: number } => r.category !== undefined)
        .sort((a, b) => b.value - a.value)
        .map((r) => ({ id: r.category.id, label: r.category.name, value: r.value, color: r.category.color })),
    [byCategory, categoriesById],
  )
  const budget = useMemo(
    () =>
      data.categories
        .filter((c) => c.monthlyLimit !== null && c.monthlyLimit > 0)
        .map((c) => ({
          category: c,
          limit: c.monthlyLimit ?? 0,
          spent: byCategory.get(c.id) ?? 0,
        })),
    [data.categories, byCategory],
  )
  const split = useMemo(() => essentialSplit(monthExpenses, ym), [monthExpenses, ym])

  // ── Entradas × Saídas 12m (janela termina no mês ativo) ───────────
  const flow12 = useMemo(() => {
    const window = lastMonths(ym, 12)
    const income = incomeByMonth(data.salaryHistory, data.extraIncomes, window)
    return window.map((m) => ({
      ym: m,
      income: income.get(m) ?? 0,
      expenses: expensesMap.get(m) ?? 0,
    }))
  }, [data.salaryHistory, data.extraIncomes, expensesMap, ym])

  const hasFlow = flow12.some((f) => f.income > 0 || f.expenses > 0)

  return (
    <>
      <PageHeader title="Visão geral" subtitle="Seu patrimônio e o mês em um relance" actions={<MonthNav />} />

      {/* HERO patrimônio */}
      <Card className="relative p-6 mb-4 overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute -top-24 -right-16 h-64 w-96 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ background: colors.primary }}
        />
        <div className="flex items-end justify-between gap-6 relative">
          <div>
            <p className="text-[12.5px] font-medium text-ink-soft flex items-center gap-1.5">
              <Wallet size={13.5} /> Patrimônio total
            </p>
            <p className="font-display text-[38px] font-bold text-ink tnum leading-tight mt-1">
              {formatBRL(wealth.total)}
            </p>
            <div className="flex items-center gap-5 mt-3 text-[12.5px] tnum">
              <span className="text-ink-soft">
                em conta <strong className="text-ink font-semibold">{formatBRL(wealth.inAccounts)}</strong>
              </span>
              <span className="text-ink-soft">
                investido <strong className="text-ink font-semibold">{formatBRL(wealth.invested)}</strong>
              </span>
              <span className="text-ink-soft">
                rende/mês <strong className="text-pos font-semibold">{formatBRL(wealth.perMonth)}</strong>
              </span>
            </div>
          </div>
          {wealth.sparkValues.length >= 2 && wealth.sparkValues.some((v) => v !== wealth.sparkValues[0]) && (
            <Sparkline values={wealth.sparkValues} width={220} height={64} />
          )}
        </div>
      </Card>

      {/* Cards do mês (padrão StatCard) */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <StatCard icon={ArrowDownRight} value={formatBRL(month.income)} label="Entrou no mês" />
        <StatCard icon={ArrowUpRight} value={formatBRL(month.spent)} label="Saiu no mês" />
        <StatCard
          icon={Target}
          value={formatBRL(month.net)}
          label="Sobra"
          tone={month.net >= 0 ? 'pos' : 'neg'}
          detail={month.income > 0 ? `${formatPercent(month.net / month.income, 0)} da renda` : '—'}
        />
        <StatCard
          icon={CalendarClock}
          value={formatBRL(month.commitments)}
          label="Compromissos"
          detail="parcelas ativas + faturas abertas"
        />
      </div>

      {/* Balão de resumo inteligente do mês (§5.1) */}
      <SummaryBalloon
        title={`Resumo de ${formatYmLong(ym)}`}
        className="mb-4"
        segments={
          month.income === 0 && month.spent === 0
            ? [
                'Nenhuma movimentação registrada neste mês ainda. Registre entradas em ',
                { value: 'Ganhos', tone: 'primary', goTo: 'income' },
                ' e saídas em ',
                { value: 'Gastos', tone: 'primary', goTo: 'expenses' },
                ' para acompanhar a sobra.',
              ]
            : [
                'O mês acumula ',
                { value: formatBRL(month.income), tone: 'pos', goTo: 'income' },
                ' recebidos e ',
                { value: formatBRL(month.spent), tone: 'neg', goTo: 'expenses' },
                ' gastos, com ',
                { value: formatBRL(month.commitments), tone: 'warn', goTo: 'installments' },
                ' comprometidos entre faturas e parcelas. ',
                month.net >= 0 ? 'Sobra de ' : 'Falta de ',
                { value: formatBRL(Math.abs(month.net)), tone: month.net >= 0 ? 'pos' : 'neg' },
                month.income > 0 ? ` (${formatPercent(month.net / month.income, 0)} da renda).` : '.',
              ]
        }
      />

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Rosca: para onde foi o dinheiro */}
        <Card className="p-5">
          <CardTitle className="mb-4">Para onde foi o dinheiro</CardTitle>
          {donutSlices.length === 0 ? (
            <EmptyState
              icon={ChartPie}
              title="Sem gastos neste mês"
              description={`Nada lançado em ${formatYmLong(ym)} — registre gastos para ver a distribuição.`}
              className="py-6"
            />
          ) : (
            <>
              <Donut
                slices={donutSlices}
                centerTitle="Gasto no mês"
                centerValue={formatBRL(month.spent)}
                size={175}
              />
              {split.total > 0 && split.superfluous > 0 && (
                <p className="text-[12.5px] text-ink-soft mt-4 pt-3 border-t border-line tnum">
                  <strong className="text-warn">{formatBRL(split.superfluous)}</strong> supérfluos —{' '}
                  {formatPercent(split.superfluousRatio, 0)} do mês
                </p>
              )}
            </>
          )}
        </Card>

        {/* Orçamento do mês */}
        <Card className="p-5">
          <CardTitle className="mb-4">Orçamento do mês</CardTitle>
          {budget.length === 0 ? (
            <EmptyState
              icon={Target}
              title="Nenhum limite definido"
              description="Defina limites mensais nas suas categorias (Gastos → Categorias) para acompanhar o orçamento aqui."
              className="py-6"
            />
          ) : (
            <ul className="flex flex-col gap-3.5">
              {budget.map(({ category, limit, spent }) => {
                const ratio = limit > 0 ? spent / limit : 0
                const barColor = ratio < 0.7 ? colors.pos : ratio < 1 ? colors.warn : colors.neg
                return (
                  <li key={category.id}>
                    <div className="flex items-center gap-2 text-[13px] mb-1">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: category.color }} />
                      <span className="font-medium text-ink truncate">{category.name}</span>
                      <span className="ml-auto tnum text-ink-soft">
                        <strong
                          className={cn('font-semibold', ratio >= 1 ? 'text-neg' : 'text-ink')}
                        >
                          {formatBRL(spent)}
                        </strong>{' '}
                        / {formatBRL(limit)}
                      </span>
                    </div>
                    <div
                      className="h-2 rounded-full bg-surface-2 overflow-hidden"
                      role="img"
                      aria-label={`${category.name}: ${formatPercent(ratio, 0)} do limite`}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{ width: `${Math.min(1, ratio) * 100}%`, background: barColor }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Entradas × Saídas 12m */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-4">
          <CardTitle>Entradas × Saídas — últimos 12 meses</CardTitle>
          <span className="flex items-center gap-4 text-[11.5px] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: colors.pos }} /> entradas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: colors.neg }} /> saídas
            </span>
          </span>
        </div>
        {!hasFlow ? (
          <EmptyState
            icon={ChartPie}
            title="Sem movimentações na janela"
            description="Registre ganhos e gastos para comparar entradas e saídas mês a mês."
            className="py-6"
          />
        ) : (
          <Bars
            data={flow12.map((f) => ({
              label: formatYmTiny(f.ym),
              values: [f.income, f.expenses],
              tip: (
                <>
                  <span className="text-ink-soft first-letter:uppercase">{formatYmShort(f.ym)}</span>
                  <br />
                  <strong className="text-ink tnum">entrou {formatBRL(f.income)}</strong>
                  <br />
                  <strong className="text-ink tnum">saiu {formatBRL(f.expenses)}</strong>
                  <br />
                  <span className={f.income - f.expenses >= 0 ? 'text-pos' : 'text-neg'}>
                    {f.income - f.expenses >= 0 ? 'sobrou' : 'faltou'}{' '}
                    <span className="tnum">{formatBRL(Math.abs(f.income - f.expenses))}</span>
                  </span>
                </>
              ),
            }))}
            colors={[colors.pos, colors.neg]}
            height={230}
          />
        )}
      </Card>
    </>
  )
}
