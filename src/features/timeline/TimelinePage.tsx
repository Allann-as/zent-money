import { useMemo, type ReactNode } from 'react'
import { History, PiggyBank, Trophy } from 'lucide-react'
import { PageHeader } from '@/features/common/PageHeader'
import { Card, CardTitle } from '@/design/components/Card'
import { EmptyState } from '@/design/components/EmptyState'
import { Bars } from '@/design/charts/Bars'
import { useChartColors } from '@/design/charts/useChartColors'
import { useZentData } from '@/store/dataStore'
import { incomeByMonth, sumByMonth } from '@/engine/aggregations'
import { formatPercent } from '@/engine/money'
import { useBRL } from '@/design/money'
import { currentYm, formatYmShort, formatYmTiny, lastMonths, ymOfDate } from '@/engine/dates'
import type { Category } from '@/data/schema'

export function TimelinePage(): ReactNode {
  const data = useZentData()
  const colors = useChartColors()
  const brl = useBRL()

  // Janela móvel FIXA: os últimos 12 meses até hoje — sem navegação.
  const window12 = useMemo(() => lastMonths(currentYm(), 12), [])
  const windowSet = useMemo(() => new Set(window12), [window12])

  const stats = useMemo(() => {
    const income = incomeByMonth(data.salaryHistory, data.extraIncomes, window12)
    const expensesMap = sumByMonth(data.expenses)
    const contributionsMap = sumByMonth(data.contributions)

    const net = window12.map((ym) => ({
      ym,
      income: income.get(ym) ?? 0,
      expenses: expensesMap.get(ym) ?? 0,
      net: (income.get(ym) ?? 0) - (expensesMap.get(ym) ?? 0),
    }))

    // categorias do período em passada única
    const byCategory = new Map<string, number>()
    for (const e of data.expenses) {
      if (!windowSet.has(ymOfDate(e.date))) continue
      byCategory.set(e.categoryId, (byCategory.get(e.categoryId) ?? 0) + e.amount)
    }
    const categoriesById = new Map(data.categories.map((c) => [c.id, c]))
    const topCategories = Array.from(byCategory.entries())
      .map(([id, total]) => ({ category: categoriesById.get(id), total }))
      .filter((r): r is { category: Category; total: number } => r.category !== undefined)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
    const totalExpenses = Array.from(byCategory.values()).reduce((a, b) => a + b, 0)

    let invested = 0
    for (const ym of window12) invested += contributionsMap.get(ym) ?? 0

    const anyActivity = net.some((n) => n.income > 0 || n.expenses > 0) || invested > 0

    // recordes
    const bestNet = net.reduce((best, n) => (n.net > best.net ? n : best), net[0] ?? { ym: '', net: 0, income: 0, expenses: 0 })
    const bestIncome = net.reduce((best, n) => (n.income > best.income ? n : best), net[0] ?? { ym: '', net: 0, income: 0, expenses: 0 })
    let bestContribution: { ym: string; total: number } | null = null
    for (const ym of window12) {
      const t = contributionsMap.get(ym) ?? 0
      if (t > 0 && (bestContribution === null || t > bestContribution.total)) {
        bestContribution = { ym, total: t }
      }
    }

    return { net, topCategories, totalExpenses, invested, anyActivity, bestNet, bestIncome, bestContribution }
  }, [data, window12, windowSet])

  if (!stats.anyActivity) {
    return (
      <>
        <PageHeader title="Linha do tempo" subtitle="Os últimos 12 meses da sua vida financeira" />
        <Card>
          <EmptyState
            icon={History}
            title="Sua história começa agora"
            description="Conforme você registra ganhos, gastos e aportes, esta página conta a evolução dos seus últimos 12 meses — sempre uma janela móvel."
            className="py-16"
          />
        </Card>
      </>
    )
  }

  const maxCategory = stats.topCategories[0]?.total ?? 0

  return (
    <>
      <PageHeader
        title="Linha do tempo"
        subtitle={`Janela móvel: ${formatYmShort(window12[0] ?? '')} até ${formatYmShort(window12[11] ?? '')}`}
      />

      {/* Sobra mês a mês */}
      <Card className="p-5 mb-4">
        <CardTitle className="mb-4">Sobra mês a mês (entradas − saídas)</CardTitle>
        <Bars
          data={stats.net.map((n) => ({
            label: formatYmTiny(n.ym),
            values: [n.net],
            tip: (
              <>
                <span className="text-ink-soft first-letter:uppercase">{formatYmShort(n.ym)}</span>
                <br />
                <strong className="text-ink tnum">
                  {n.net >= 0 ? 'sobrou ' : 'faltou '}
                  {brl(Math.abs(n.net))}
                </strong>
                <br />
                <span className="text-ink-faint tnum">
                  entrou {brl(n.income)} · saiu {brl(n.expenses)}
                </span>
              </>
            ),
          }))}
          colorFor={(_, v) => (v >= 0 ? colors.pos : colors.neg)}
          height={230}
        />
      </Card>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Maiores categorias */}
        <Card className="p-5">
          <CardTitle className="mb-4">Maiores categorias do período</CardTitle>
          {stats.topCategories.length === 0 ? (
            <p className="text-[13px] text-ink-faint py-4">Nenhum gasto no período.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {stats.topCategories.map(({ category, total }) => (
                <li key={category.id}>
                  <div className="flex items-center gap-2 text-[13px] mb-1">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: category.color }} />
                    <span className="font-medium text-ink truncate">{category.name}</span>
                    <span className="ml-auto tnum text-ink font-semibold">{brl(total)}</span>
                    <span className="tnum text-ink-faint w-11 text-right">
                      {formatPercent(stats.totalExpenses > 0 ? total / stats.totalExpenses : 0, 0)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${maxCategory > 0 ? (total / maxCategory) * 100 : 0}%`,
                        background: category.color,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          {/* Total aportado */}
          <Card className="p-5">
            <CardTitle className="mb-2 flex items-center gap-2">
              <PiggyBank size={15} className="text-ink-soft" /> Aportado no período
            </CardTitle>
            <p className="font-display text-[26px] font-bold text-primary tnum">
              {brl(stats.invested)}
            </p>
            <p className="text-[12.5px] text-ink-soft mt-1">
              somando todos os aportes em aplicações nos últimos 12 meses
            </p>
          </Card>

          {/* Recordes */}
          <Card className="p-5 flex-1">
            <CardTitle className="mb-3 flex items-center gap-2">
              <Trophy size={15} className="text-warn" /> Recordes do período
            </CardTitle>
            <ul className="flex flex-col gap-2.5 text-[13px]">
              <li className="flex items-center justify-between gap-3">
                <span className="text-ink-soft">Melhor mês de sobra</span>
                <span className="text-ink font-semibold tnum shrink-0">
                  {stats.bestNet.net > 0
                    ? `${formatYmShort(stats.bestNet.ym)} — ${brl(stats.bestNet.net)}`
                    : '—'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-ink-soft">Maior entrada mensal</span>
                <span className="text-ink font-semibold tnum shrink-0">
                  {stats.bestIncome.income > 0
                    ? `${formatYmShort(stats.bestIncome.ym)} — ${brl(stats.bestIncome.income)}`
                    : '—'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-ink-soft">Maior aporte mensal</span>
                <span className="text-ink font-semibold tnum shrink-0">
                  {stats.bestContribution
                    ? `${formatYmShort(stats.bestContribution.ym)} — ${brl(stats.bestContribution.total)}`
                    : '—'}
                </span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
