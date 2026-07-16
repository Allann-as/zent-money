import { useMemo, type ReactNode } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  ChartPie,
  Gauge,
  PiggyBank,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { PageHeader } from '@/features/common/PageHeader'
import { MonthNav } from '@/features/common/MonthNav'
import { Card, CardTitle } from '@/design/components/Card'
import { StatCard } from '@/design/components/StatCard'
import { AnimatedMoney } from '@/design/AnimatedMoney'
import { SummaryBalloon } from '@/design/components/SummaryBalloon'
import { EmptyState } from '@/design/components/EmptyState'
import { Donut } from '@/design/charts/Donut'
import { Bars } from '@/design/charts/Bars'
import { LineArea } from '@/design/charts/LineArea'
import { Sparkline } from '@/design/charts/Sparkline'
import { useChartColors } from '@/design/charts/useChartColors'
import { useZentData } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import {
  essentialSplit,
  expensesByCategory,
  groupByMonth,
  incomeByMonth,
  monthPace,
  sumByMonth,
} from '@/engine/aggregations'
import { combineSeries, investmentSeries, investmentSnapshot } from '@/engine/investments'
import { standaloneMonthlyCommitment, totalMonthlyCommitment } from '@/engine/cards'
import { Tooltip } from '@/design/components/Tooltip'
import { formatBRL, formatPercent } from '@/engine/money'
import {
  addMonths,
  currentYm,
  daysInYm,
  formatYmLong,
  formatYmShort,
  formatYmTiny,
  lastMonths,
  todayIso,
} from '@/engine/dates'
import { cn } from '@/lib/cn'
import type { Category } from '@/data/schema'

/** Variação ±% vs mês anterior (extra aprovado da R2). */
function Delta({ now, prev, invert = false }: { now: number; prev: number; invert?: boolean }): ReactNode {
  if (prev <= 0) return <span className="text-ink-faint">— vs mês anterior</span>
  const ratio = (now - prev) / prev
  if (Math.abs(ratio) < 0.0005) return <span className="text-ink-faint">estável vs mês anterior</span>
  const up = ratio > 0
  const good = invert ? !up : up
  return (
    <span className={cn('tnum font-medium', good ? 'text-pos' : 'text-neg')}>
      {up ? '▲' : '▼'} {formatPercent(Math.abs(ratio), 0)} vs mês anterior
    </span>
  )
}

export function OverviewPage(): ReactNode {
  const data = useZentData()
  const ym = useUiStore((s) => s.activeYm)
  const colors = useChartColors()

  // ── Patrimônio (hero + série 12m) ──────────────────────────────────
  const wealth = useMemo(() => {
    const inAccounts = data.banks.reduce((a, b) => a + b.balance, 0)
    const snapshots = data.investments.map((inv) =>
      investmentSnapshot(inv, data.contributions, data.rates),
    )
    const invested = snapshots.reduce((a, s) => a + s.balance, 0)
    const perMonth = snapshots.reduce((a, s) => a + s.yieldPerMonth, 0)
    // Série: evolução do investido nos últimos 12m + saldo em conta atual
    const series = combineSeries(
      data.investments.map((inv) => investmentSeries(inv, data.contributions, data.rates)),
      currentYm(),
      12,
    )
    const values = series.balances.map((b) => b + inAccounts)
    return { inAccounts, invested, perMonth, total: inAccounts + invested, months: series.months, values }
  }, [data.banks, data.investments, data.contributions, data.rates])

  // Mapa mês→total de gastos calculado UMA vez por mudança de dados —
  // navegar entre meses não varre o histórico completo de novo (§10.4)
  const expensesMap = useMemo(() => sumByMonth(data.expenses), [data.expenses])
  // gastos agrupados por mês UMA vez; trocar de mês é só um lookup
  const expensesByYm = useMemo(() => groupByMonth(data.expenses), [data.expenses])
  const monthExpenses = useMemo(() => expensesByYm.get(ym) ?? [], [expensesByYm, ym])

  // ── Mês ativo + variação vs mês anterior ──────────────────────────
  const month = useMemo(() => {
    const prevYm = addMonths(ym, -1)
    const incomeMap = incomeByMonth(data.salaryHistory, data.extraIncomes, [ym, prevYm])
    const income = incomeMap.get(ym) ?? 0
    const prevIncome = incomeMap.get(prevYm) ?? 0
    const spent = expensesMap.get(ym) ?? 0
    const prevSpent = expensesMap.get(prevYm) ?? 0
    const net = income - spent
    const prevNet = prevIncome - prevSpent
    // Compromissos = faturas abertas + parcelas de cartão + parcelas avulsas (R3 §2/§5).
    // A parte "de cartão" é derivada do total menos as avulsas para que as três linhas
    // do tooltip somem exatamente o número exibido.
    const invoices = data.cards.reduce((a, c) => a + c.invoice, 0)
    const standaloneCommit = standaloneMonthlyCommitment(data.purchases)
    const cardCommit = totalMonthlyCommitment(data.purchases) - standaloneCommit
    const commitments = invoices + cardCommit + standaloneCommit
    return {
      income,
      prevIncome,
      spent,
      prevSpent,
      net,
      prevNet,
      commitments,
      invoices,
      cardCommit,
      standaloneCommit,
    }
  }, [data, expensesMap, ym])

  // ── NOVO: ritmo do mês (média diária + projeção) ───────────────────
  const pace = useMemo(() => monthPace(monthExpenses, ym, todayIso()), [monthExpenses, ym])

  // ── NOVO: taxa de poupança (6 meses) ───────────────────────────────
  const savings6m = useMemo(() => {
    const window = lastMonths(ym, 6)
    const income = incomeByMonth(data.salaryHistory, data.extraIncomes, window)
    return window.map((m) => {
      const inc = income.get(m) ?? 0
      const spent = expensesMap.get(m) ?? 0
      return { ym: m, rate: inc > 0 ? (inc - spent) / inc : 0, income: inc }
    })
  }, [data.salaryHistory, data.extraIncomes, expensesMap, ym])

  // ── NOVO: mapa de calor de gastos do mês ───────────────────────────
  const heatmap = useMemo(() => {
    const perDay = new Map<number, number>()
    for (const e of monthExpenses) {
      const d = Number(e.date.slice(8, 10))
      perDay.set(d, (perDay.get(d) ?? 0) + e.amount)
    }
    const days = daysInYm(ym)
    const firstWeekday = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).getDay()
    const max = Math.max(1, ...perDay.values())
    return { perDay, days, firstWeekday, max }
  }, [monthExpenses, ym])

  // ── Rosca por categoria + orçamento ───────────────────────────────
  const categoriesById = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c])),
    [data.categories],
  )
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
  const hasWealthHistory =
    wealth.values.length >= 2 && wealth.values.some((v) => v !== wealth.values[0])

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
            <p className="label-caps flex items-center gap-1.5">
              <Wallet size={13.5} /> Patrimônio total
            </p>
            <p className="font-display text-[40px] font-bold text-ink tnum leading-tight mt-1">
              <AnimatedMoney cents={wealth.total} />
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
          {hasWealthHistory && <Sparkline values={wealth.values} width={220} height={64} />}
        </div>
      </Card>

      {/* Cards do mês com variação vs mês anterior */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <StatCard
          icon={ArrowDownRight}
          value={<AnimatedMoney cents={month.income} />}
          label="Entrou no mês"
          detail={<Delta now={month.income} prev={month.prevIncome} />}
        />
        <StatCard
          icon={ArrowUpRight}
          value={<AnimatedMoney cents={month.spent} />}
          label="Saiu no mês"
          detail={<Delta now={month.spent} prev={month.prevSpent} invert />}
        />
        <StatCard
          icon={Target}
          value={<AnimatedMoney cents={month.net} />}
          label="Sobra"
          tone={month.net >= 0 ? 'pos' : 'neg'}
          detail={
            month.income > 0 ? (
              <>
                {formatPercent(month.net / month.income, 0)} da renda ·{' '}
                <Delta now={month.net} prev={month.prevNet} />
              </>
            ) : (
              '—'
            )
          }
        />
        {/* R3 §5: o tooltip discrimina faturas × parcelas de cartão × avulsas */}
        <Tooltip
          side="top"
          label={
            <span className="flex flex-col gap-1 py-0.5">
              <span className="flex justify-between gap-6">
                <span className="text-ink-soft">Faturas abertas</span>
                <span className="tnum">{formatBRL(month.invoices)}</span>
              </span>
              <span className="flex justify-between gap-6">
                <span className="text-ink-soft">Parcelas de cartão</span>
                <span className="tnum">{formatBRL(month.cardCommit)}</span>
              </span>
              <span className="flex justify-between gap-6">
                <span className="text-ink-soft">Parcelas avulsas</span>
                <span className="tnum">{formatBRL(month.standaloneCommit)}</span>
              </span>
            </span>
          }
        >
          <StatCard
            icon={CalendarClock}
            value={<AnimatedMoney cents={month.commitments} />}
            label="Compromissos"
            detail="faturas + parcelas (passe o mouse)"
          />
        </Tooltip>
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
        {/* Rosca: única área multicolor do app (§3) */}
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
                // disciplina de cor: acento neutro; âmbar/vermelho só ao se
                // aproximar/cruzar o teto (alerta real)
                const barColor = ratio < 0.9 ? colors.primary : ratio < 1 ? colors.warn : colors.neg
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

      {/* NOVOS dashboards: ritmo do mês + taxa de poupança */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Card className="p-5">
          <CardTitle className="mb-3 flex items-center gap-2">
            <Gauge size={15} className="text-ink-soft" /> Ritmo do mês
          </CardTitle>
          {pace.spentSoFar === 0 ? (
            <p className="text-[13px] text-ink-faint py-3 leading-relaxed">
              Sem gastos {pace.closed ? 'neste mês' : 'até agora'} — o ritmo diário e a projeção de
              fechamento aparecem aqui.
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-6">
                <div>
                  <p className="font-display text-[24px] font-bold text-ink tnum leading-tight">
                    <AnimatedMoney cents={pace.avgPerDay} />
                  </p>
                  <p className="label-caps mt-1">Gasto médio por dia</p>
                </div>
                <div>
                  <p className="font-display text-[24px] font-bold tnum leading-tight text-ink">
                    <AnimatedMoney cents={pace.projected} />
                  </p>
                  <p className="label-caps mt-1">{pace.closed ? 'Fechamento' : 'Projeção de fechamento'}</p>
                </div>
              </div>
              <p className="text-[12.5px] text-ink-soft mt-3 pt-3 border-t border-line leading-relaxed tnum">
                {pace.closed
                  ? `Mês fechado em ${formatBRL(pace.spentSoFar)}. `
                  : `No ritmo atual (${pace.daysElapsed} de ${pace.daysInMonth} dias), o mês fecha em ${formatBRL(pace.projected)}. `}
                {month.prevSpent > 0 && (
                  <span
                    className={cn(
                      'font-semibold',
                      (pace.closed ? pace.spentSoFar : pace.projected) <= month.prevSpent
                        ? 'text-pos'
                        : 'text-neg',
                    )}
                  >
                    {formatBRL(Math.abs((pace.closed ? pace.spentSoFar : pace.projected) - month.prevSpent))}{' '}
                    {(pace.closed ? pace.spentSoFar : pace.projected) <= month.prevSpent ? 'abaixo' : 'acima'}{' '}
                    do mês passado.
                  </span>
                )}
              </p>
            </>
          )}
        </Card>

        <Card className="p-5">
          <CardTitle className="mb-3 flex items-center gap-2">
            <PiggyBank size={15} className="text-ink-soft" /> Taxa de poupança
          </CardTitle>
          {savings6m.every((s) => s.income === 0) ? (
            <p className="text-[13px] text-ink-faint py-3 leading-relaxed">
              Registre suas entradas para acompanhar o % da renda que sobra a cada mês.
            </p>
          ) : (
            <div className="flex items-end justify-between gap-2 h-[120px] pt-2">
              {savings6m.map((s) => {
                const clamped = Math.max(0, Math.min(1, s.rate))
                return (
                  <div key={s.ym} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                    <span
                      className={cn(
                        'text-[11px] tnum font-semibold',
                        s.rate >= 0 ? 'text-ink-soft' : 'text-neg',
                      )}
                    >
                      {s.income > 0 ? formatPercent(s.rate, 0) : '—'}
                    </span>
                    <div
                      className="w-full max-w-[34px] rounded-t-[5px] bg-primary transition-[height] duration-300"
                      style={{ height: `${Math.max(3, clamped * 78)}px`, opacity: s.income > 0 ? 1 : 0.25 }}
                      title={`${formatYmShort(s.ym)}: ${s.income > 0 ? formatPercent(s.rate, 0) : 'sem renda registrada'}`}
                    />
                    <span className="text-[10.5px] text-ink-faint">{formatYmTiny(s.ym)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* NOVOS dashboards: mapa de calor + patrimônio 12m */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Card className="p-5">
          <CardTitle className="mb-3 flex items-center gap-2">
            <CalendarDays size={15} className="text-ink-soft" /> Mapa de calor de gastos
          </CardTitle>
          <div className="grid grid-cols-7 gap-1 text-center">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
              <span key={i} className="text-[10px] text-ink-faint font-medium pb-1">
                {d}
              </span>
            ))}
            {Array.from({ length: heatmap.firstWeekday }).map((_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {Array.from({ length: heatmap.days }).map((_, i) => {
              const day = i + 1
              const spent = heatmap.perDay.get(day) ?? 0
              const intensity = spent > 0 ? 0.15 + 0.85 * (spent / heatmap.max) : 0
              return (
                <div
                  key={day}
                  title={spent > 0 ? `Dia ${day}: ${formatBRL(spent)}` : `Dia ${day}: sem gastos`}
                  className="relative h-8 rounded-[6px] bg-surface-2 overflow-hidden"
                >
                  <div
                    className="absolute inset-0"
                    style={{ background: colors.primary, opacity: intensity }}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      'relative text-[10.5px] tnum leading-8',
                      intensity > 0.55 ? 'text-on-primary font-semibold' : 'text-ink-soft',
                    )}
                  >
                    {day}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>

        <Card className="p-5">
          <CardTitle className="mb-3 flex items-center gap-2">
            <TrendingUp size={15} className="text-ink-soft" /> Evolução do patrimônio — 12 meses
          </CardTitle>
          {!hasWealthHistory ? (
            <p className="text-[13px] text-ink-faint py-3 leading-relaxed">
              Registre aportes na Carteira para acompanhar a evolução do seu patrimônio aqui.
            </p>
          ) : (
            <LineArea
              height={150}
              data={wealth.months.map((m, i) => ({
                label: formatYmTiny(m),
                value: wealth.values[i] ?? 0,
                tip: (
                  <>
                    <span className="text-ink-soft first-letter:uppercase">{formatYmShort(m)}</span>
                    <br />
                    <strong className="text-ink tnum">{formatBRL(wealth.values[i] ?? 0)}</strong>
                  </>
                ),
              }))}
            />
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
