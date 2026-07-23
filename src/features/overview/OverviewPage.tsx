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
import { BudgetPanel } from '@/features/budget/BudgetPanel'
import { HealthCard } from '@/features/gamification/HealthCard'
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
  savingsRatio,
  sumByMonth,
} from '@/engine/aggregations'
import { combineSeries, investmentSeries, investmentSnapshot } from '@/engine/investments'
import { standaloneMonthlyCommitment, totalInvoices, totalMonthlyCommitment } from '@/engine/cards'
import { accountBalanceSeries, isLedgerLinked, totalInAccounts } from '@/engine/ledger'
import { Tooltip } from '@/design/components/Tooltip'
import { formatPercent } from '@/engine/money'
import { useBRL } from '@/design/money'
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

/**
 * Variação ±% vs mês anterior (extra aprovado da R2).
 *
 * **Devolve `null` quando não há base de comparação** (R4 §3): antes, um mês sem
 * anterior comparável mostrava "— vs mês anterior", um travessão solto que
 * ocupava espaço sem dizer nada. Sem base, a linha inteira some — quem chama
 * trata o null.
 */
function Delta({ now, prev, invert = false }: { now: number; prev: number; invert?: boolean }): ReactNode {
  if (prev <= 0) return null
  const ratio = (now - prev) / prev
  if (Math.abs(ratio) < 0.0005) return <span className="text-ink-faint">estável vs mês anterior</span>
  const up = ratio > 0
  const good = invert ? !up : up
  return (
    <span className={cn('font-medium', good ? 'text-pos' : 'text-neg')}>
      {up ? '▲' : '▼'} <span className="tnum">{formatPercent(Math.abs(ratio), 0)}</span> vs mês anterior
    </span>
  )
}

/**
 * `detail` do StatCard é opcional e o projeto roda com `exactOptionalPropertyTypes`:
 * passar `undefined` não é o mesmo que não passar. Este helper transforma "não
 * há detalhe" na ausência da prop, que é o que faz a linha sumir (R4 §3).
 */
function detailProp(node: ReactNode): { detail?: ReactNode } {
  return node === null || node === false ? {} : { detail: node }
}

export function OverviewPage(): ReactNode {
  const data = useZentData()
  const ym = useUiStore((s) => s.activeYm)
  const colors = useChartColors()
  const brl = useBRL()

  // ── Patrimônio (hero + série 12m) ──────────────────────────────────
  const wealth = useMemo(() => {
    // Saldo derivado do ledger (v7) — a MESMA função que alimenta Bancos e o
    // drill-down. Um `reduce` local aqui foi por anos a chance de esta tela
    // discordar daquelas.
    const inAccounts = totalInAccounts(data)
    const snapshots = data.investments.map((inv) =>
      investmentSnapshot(inv, data.contributions, data.rates),
    )
    const invested = snapshots.reduce((a, s) => a + s.balance, 0)
    const perMonth = snapshots.reduce((a, s) => a + s.yieldPerMonth, 0)
    // Série do patrimônio: investido + saldo em conta, os DOIS com histórico
    // real (R4). Até a R3 o saldo em conta não tinha passado e o app repetia o
    // de hoje em todos os meses — o gráfico superestimava janeiro e a variação
    // do hero era cega ao salário, porque `total` e `prevTotal` carregavam o
    // mesmo saldo. Com o ledger, cada movimento é datado e o passado é
    // derivável de verdade.
    const series = combineSeries(
      data.investments.map((inv) => investmentSeries(inv, data.contributions, data.rates)),
      currentYm(),
      12,
    )
    const accounts = accountBalanceSeries(data, series.months)
    const values = series.balances.map((b, i) => b + (accounts[i] ?? inAccounts))
    const prevTotal = values[values.length - 2] ?? inAccounts + invested
    return {
      inAccounts,
      invested,
      perMonth,
      total: inAccounts + invested,
      prevTotal,
      months: series.months,
      values,
    }
  }, [data])

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
    const invoices = totalInvoices(data.cards)
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
      /**
       * Sobra como fração da renda — UM cálculo só, consumido pelo card e pelo
       * balão (R4 §3). Antes cada um dividia por conta própria: mesmos inputs
       * hoje, dois lugares para divergir amanhã.
       * `null` = não há renda no mês, então a fração não existe (e não é 0).
       */
      savingsRatio: savingsRatio(income, spent),
      /** Mês sem nenhuma movimentação: nem entrada, nem saída. */
      empty: income === 0 && spent === 0,
    }
  }, [data, expensesMap, ym])

  // Ledger ligado? Decide o texto do tooltip de "em conta" (§1.6).
  const ledgerLinked = useMemo(() => isLedgerLinked(data), [data])

  /**
   * Detalhe da Sobra (R4 §3). Um mês sem gasto algum mostrava "100% da renda":
   * tecnicamente verdade, mas lido como se o mês tivesse sido analisado quando
   * nada foi lançado. Agora a linha diz o que de fato aconteceu.
   */
  const sobraDelta = <Delta now={month.net} prev={month.prevNet} />
  const sobraDetail: ReactNode = month.empty ? null : month.spent === 0 ? (
    <span className="text-ink-faint">nenhum gasto lançado</span>
  ) : month.savingsRatio === null ? null : (
    <>
      <span className="tnum">{formatPercent(month.savingsRatio, 0)}</span> da renda
      {sobraDelta !== null && <> · {sobraDelta}</>}
    </>
  )

  // ── NOVO: ritmo do mês (média diária + projeção) ───────────────────
  const pace = useMemo(() => monthPace(monthExpenses, ym, todayIso()), [monthExpenses, ym])

  // ── NOVO: taxa de poupança (6 meses) ───────────────────────────────
  const savings6m = useMemo(() => {
    const window = lastMonths(ym, 6)
    const income = incomeByMonth(data.salaryHistory, data.extraIncomes, window)
    return window.map((m) => {
      const inc = income.get(m) ?? 0
      const spent = expensesMap.get(m) ?? 0
      // mesmo helper do card da Sobra e do balão (§3); null = mês sem renda
      return { ym: m, rate: savingsRatio(inc, spent) ?? 0, income: inc }
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
  const viewingCurrentMonth = ym === currentYm()
  const hasWealthHistory =
    wealth.values.length >= 2 && wealth.values.some((v) => v !== wealth.values[0])

  return (
    <>
      <PageHeader title="Visão geral" subtitle="Seu patrimônio e o mês em um relance" actions={<MonthNav />} />

      {/* ── HERO patrimônio: o protagonista da página (§4) ────────────── */}
      <Card className="card-topline relative p-7 mb-5 overflow-hidden">
        {/* glow interno: dois focos suaves, sem animação */}
        <div
          aria-hidden="true"
          className="absolute -top-28 -right-12 h-72 w-[420px] rounded-full blur-3xl opacity-25 pointer-events-none"
          style={{ background: colors.primary }}
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -left-20 h-56 w-80 rounded-full blur-3xl opacity-[0.07] pointer-events-none"
          style={{ background: colors.primary }}
        />
        <div className="flex items-end justify-between gap-8 relative">
          <div className="min-w-0">
            {/* R4 §3: o hero é sempre o patrimônio de HOJE (saldo em conta não
                tem histórico), enquanto os cards abaixo são do mês navegado.
                Fora do mês corrente, os dois ficariam lado a lado sem dizer que
                falam de tempos diferentes — o marcador "hoje" resolve. */}
            <p className="label-caps flex items-center gap-1.5">
              <Wallet size={13.5} /> Patrimônio total
              {!viewingCurrentMonth && <span className="text-ink-faint normal-case">· hoje</span>}
            </p>
            <div className="flex items-baseline gap-3 mt-1.5 flex-wrap">
              {/* número do hero +15% (52→60px) com glow ancorado (M3 §Cards) */}
              <p className="hero-num font-display text-[60px] font-bold text-ink tnum leading-none">
                <AnimatedMoney cents={wealth.total} />
              </p>
              {/* variação vs mês anterior em destaque (§4) — o Delta já
                  escreve o "vs mês anterior", não repetir aqui */}
              {hasWealthHistory && (
                <span className="text-[13px]">
                  <Delta now={wealth.total} prev={wealth.prevTotal} />
                </span>
              )}
            </div>
            <div className="flex items-center gap-6 mt-4 text-[12.5px] tnum">
              {/* Tooltip honesto (R4 §1.6): sem nada vinculado, "em conta" é a
                  soma do que o usuário declarou — a tela diz isso em vez de
                  sugerir que o número acompanha os lançamentos sozinho. */}
              <Tooltip
                side="top"
                label={
                  ledgerLinked
                    ? 'Soma dos saldos das contas — recebimentos, gastos, transferências e ajustes já estão embutidos.'
                    : 'Soma dos saldos declarados nos bancos. Vincule recebimentos e pagamentos às contas para este número se atualizar sozinho.'
                }
              >
                <span className="text-ink-soft cursor-help">
                  em conta <strong className="text-ink font-semibold">{brl(wealth.inAccounts)}</strong>
                </span>
              </Tooltip>
              <span className="text-ink-soft">
                investido <strong className="text-ink font-semibold">{brl(wealth.invested)}</strong>
              </span>
              <span className="text-ink-soft">
                rende/mês <strong className="text-pos font-semibold">{brl(wealth.perMonth)}</strong>
              </span>
            </div>
          </div>
          {hasWealthHistory && <Sparkline values={wealth.values} width={300} height={88} />}
        </div>
      </Card>

      {/* ── Saúde financeira (M4): score + streak + desafio ─────────────── */}
      <HealthCard />

      {/* ── O mês ─────────────────────────────────────────────────────── */}
      <p className="label-caps mb-2.5">O mês</p>

      {/* Cards do mês com variação vs mês anterior */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {/* R4 §3: `detail` só existe quando tem o que dizer — sem mês anterior
            comparável a linha some, em vez de exibir um travessão solto. */}
        <StatCard
          icon={ArrowDownRight}
          value={<AnimatedMoney cents={month.income} />}
          label="Entrou no mês"
          {...detailProp(<Delta now={month.income} prev={month.prevIncome} />)}
        />
        <StatCard
          icon={ArrowUpRight}
          value={<AnimatedMoney cents={month.spent} />}
          label="Saiu no mês"
          {...detailProp(<Delta now={month.spent} prev={month.prevSpent} invert />)}
        />
        <StatCard
          icon={Target}
          value={<AnimatedMoney cents={month.net} />}
          label="Sobra"
          tone={month.net >= 0 ? 'pos' : 'neg'}
          {...detailProp(sobraDetail)}
        />
        {/* R3 §5: o tooltip discrimina faturas × parcelas de cartão × avulsas */}
        <Tooltip
          side="top"
          label={
            <span className="flex flex-col gap-1 py-0.5">
              <span className="flex justify-between gap-6">
                <span className="text-ink-soft">Faturas abertas</span>
                <span className="tnum">{brl(month.invoices)}</span>
              </span>
              <span className="flex justify-between gap-6">
                <span className="text-ink-soft">Parcelas de cartão</span>
                <span className="tnum">{brl(month.cardCommit)}</span>
              </span>
              <span className="flex justify-between gap-6">
                <span className="text-ink-soft">Parcelas avulsas</span>
                <span className="tnum">{brl(month.standaloneCommit)}</span>
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
          month.empty
            ? [
                'Nenhuma movimentação registrada neste mês ainda. Registre entradas em ',
                { value: 'Ganhos', tone: 'primary', goTo: 'income' },
                ' e saídas em ',
                { value: 'Gastos', tone: 'primary', goTo: 'expenses' },
                ' para acompanhar a sobra.',
              ]
            : [
                'O mês acumula ',
                { value: brl(month.income), tone: 'pos', goTo: 'income' },
                ' recebidos e ',
                { value: brl(month.spent), tone: 'neg', goTo: 'expenses' },
                ' gastos, com ',
                { value: brl(month.commitments), tone: 'warn', goTo: 'installments' },
                ' comprometidos entre faturas e parcelas. ',
                month.net >= 0 ? 'Sobra de ' : 'Falta de ',
                { value: brl(Math.abs(month.net)), tone: month.net >= 0 ? 'pos' : 'neg' },
                // mesma fração do card da Sobra, do mesmo memo (§3)
                month.savingsRatio !== null ? ` (${formatPercent(month.savingsRatio, 0)} da renda).` : '.',
              ]
        }
      />

      {/* ── Análise do mês: grid assimétrico — a rosca (a pergunta principal)
             ocupa mais que o orçamento (§4) ──────────────────────────── */}
      <p className="label-caps mb-2.5 mt-5">Para onde foi</p>
      <div className="grid grid-cols-5 gap-4 mb-4">
        {/* Rosca: única área multicolor do app (§3) */}
        <Card className="card-lit p-5 col-span-3">
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
                centerCents={month.spent}
                size={175}
              />
              {split.total > 0 && split.superfluous > 0 && (
                <p className="text-[12.5px] text-ink-soft mt-4 pt-3 border-t border-line tnum">
                  <strong className="text-warn">{brl(split.superfluous)}</strong> supérfluos —{' '}
                  {formatPercent(split.superfluousRatio, 0)} do mês
                </p>
              )}
            </>
          )}
        </Card>

        {/* Orçamento do mês (M1 §c): disponível/âmbar/vermelho + realocação */}
        <Card className="p-5 col-span-2">
          <BudgetPanel spentByCategory={byCategory} ym={ym} />
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
              {/* Ritmo de queima (v2.1 §3): a média diária vira número-herói
                  âmbar com "/dia"; a projeção de fechamento fica ao lado. */}
              <div className="flex items-baseline gap-6">
                <div>
                  <p className="font-display text-[30px] font-extrabold text-primary tnum leading-none hero-num">
                    <AnimatedMoney cents={pace.avgPerDay} />
                    <span className="text-[15px] font-bold text-ink-soft">/dia</span>
                  </p>
                  <p className="label-caps mt-1.5">Ritmo de queima</p>
                </div>
                <div>
                  <p className="font-display text-[22px] font-bold tnum leading-tight text-ink">
                    <AnimatedMoney cents={pace.projected} />
                  </p>
                  <p className="label-caps mt-1">{pace.closed ? 'Fechamento' : 'Projeção de fechamento'}</p>
                </div>
              </div>
              <p className="text-[12.5px] text-ink-soft mt-3 pt-3 border-t border-line leading-relaxed tnum">
                {pace.closed
                  ? `Mês fechado em ${brl(pace.spentSoFar)}. `
                  : `No ritmo atual (${pace.daysElapsed} de ${pace.daysInMonth} dias), o mês fecha em ${brl(pace.projected)}. `}
                {month.prevSpent > 0 && (
                  <span
                    className={cn(
                      'font-semibold',
                      (pace.closed ? pace.spentSoFar : pace.projected) <= month.prevSpent
                        ? 'text-pos'
                        : 'text-neg',
                    )}
                  >
                    {brl(Math.abs((pace.closed ? pace.spentSoFar : pace.projected) - month.prevSpent))}{' '}
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
                  title={spent > 0 ? `Dia ${day}: ${brl(spent)}` : `Dia ${day}: sem gastos`}
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
                    <strong className="text-ink tnum">{brl(wealth.values[i] ?? 0)}</strong>
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
                  <strong className="text-ink tnum">entrou {brl(f.income)}</strong>
                  <br />
                  <strong className="text-ink tnum">saiu {brl(f.expenses)}</strong>
                  <br />
                  <span className={f.income - f.expenses >= 0 ? 'text-pos' : 'text-neg'}>
                    {f.income - f.expenses >= 0 ? 'sobrou' : 'faltou'}{' '}
                    <span className="tnum">{brl(Math.abs(f.income - f.expenses))}</span>
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
