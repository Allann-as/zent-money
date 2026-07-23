import { useMemo, useState, type ReactNode } from 'react'
import { CalendarRange, History, PiggyBank, TrendingUp, Trophy, Wallet } from 'lucide-react'
import { PageHeader } from '@/features/common/PageHeader'
import { Card, CardTitle } from '@/design/components/Card'
import { EmptyState } from '@/design/components/EmptyState'
import { StatCard } from '@/design/components/StatCard'
import { AnimatedMoney } from '@/design/AnimatedMoney'
import { Segmented } from '@/design/components/Segmented'
import { SummaryBalloon, type BalloonSegment } from '@/design/components/SummaryBalloon'
import { Bars } from '@/design/charts/Bars'
import { LineArea } from '@/design/charts/LineArea'
import { SignedArea, type SignedPoint } from '@/design/charts/SignedArea'
import { useChartColors } from '@/design/charts/useChartColors'
import { useZentData } from '@/store/dataStore'
import { savingsRatio } from '@/engine/aggregations'
import { formatPercent } from '@/engine/money'
import { useBRL } from '@/design/money'
import { formatYmShort, formatYmTiny } from '@/engine/dates'
import {
  TIMELINE_WINDOWS,
  timelineStats,
  type TimelineWindow,
  type MonthRow,
} from '@/engine/timeline'

/** Meta de poupança do app (a mesma nota cheia do score, M4). */
const SAVINGS_GOAL = 0.3

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LINHA DO TEMPO — o painel dos anos (R10 §⑥)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Era uma janela FIXA de 12 meses; passou a ter seletor de período
 * (6m · 12m · 24m · ano a ano · tudo), faixa de estatísticas, balão narrativo e
 * o gráfico principal em ÁREA CONTÍNUA com sinal, no lugar das barras com
 * pastilhas soltas abaixo do eixo.
 *
 * Todo número vem de `engine/timeline`, que só LÊ as agregações existentes —
 * nenhuma regra de dinheiro nova mora aqui.
 */
export function TimelinePage(): ReactNode {
  const data = useZentData()
  const colors = useChartColors()
  const brl = useBRL()
  // `period`, não `window`: um estado com o nome do global do browser é uma
  // armadilha esperando alguém precisar de `window.matchMedia` neste arquivo.
  const [period, setPeriod] = useState<TimelineWindow>('12m')

  const stats = useMemo(() => timelineStats(data, period), [data, period])

  const first = stats.months[0]
  const last = stats.months[stats.months.length - 1]

  if (!stats.anyActivity) {
    return (
      <>
        <PageHeader title="Linha do tempo" subtitle="A evolução da sua vida financeira" />
        <Card>
          <EmptyState
            icon={History}
            title="Sua história começa agora"
            description="Conforme você registra ganhos, gastos e aportes, esta página conta a evolução do período que você escolher — de seis meses a tudo o que existe."
            className="py-16"
          />
        </Card>
      </>
    )
  }

  const maxCategory = stats.topCategories[0]?.total ?? 0
  const rateDelta =
    stats.rate !== null && stats.ratePrev !== null ? stats.rate - stats.ratePrev : null

  return (
    <>
      <PageHeader
        title="Linha do tempo"
        subtitle={
          first && last
            ? `${formatYmShort(first.ym)} até ${formatYmShort(last.ym)} · ${stats.months.length} ${stats.months.length === 1 ? 'mês' : 'meses'}`
            : 'A evolução da sua vida financeira'
        }
        actions={
          <Segmented<TimelineWindow>
            value={period}
            onChange={setPeriod}
            ariaLabel="Período da linha do tempo"
            options={TIMELINE_WINDOWS.map((w) => ({ value: w.id, label: w.label }))}
          />
        }
      />

      {/* ── Faixa de estatísticas ───────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <StatCard
          icon={PiggyBank}
          value={<AnimatedMoney cents={stats.saved} />}
          label="Guardado no período"
          // O valor vai em `.tnum` (o número é mono, a frase não — §12): "R$
          // 300,00/mês em média" numa string só cairia toda em Nunito e o
          // audit-mono, com razão, reprovaria.
          detail={
            <>
              <span className="tnum">{brl(stats.savedPerMonth)}</span>/mês em média
            </>
          }
          tone={stats.saved >= 0 ? 'pos' : 'neg'}
        />
        <StatCard
          icon={TrendingUp}
          value={stats.rate === null ? '—' : formatPercent(stats.rate, 0)}
          label="Taxa de poupança"
          {...(rateDelta === null
            ? { detail: 'sem período anterior para comparar' }
            : {
                detail: `${rateDelta >= 0 ? '+' : ''}${formatPercent(rateDelta, 0)} vs. período anterior`,
              })}
          tone={stats.rate !== null && stats.rate >= SAVINGS_GOAL ? 'pos' : 'default'}
        />
        <StatCard
          icon={CalendarRange}
          value={`${stats.bluesMonths}`}
          label="Meses no azul"
          detail={`de ${stats.activeMonths} com movimentação`}
          tone={stats.bluesMonths >= stats.activeMonths - stats.bluesMonths ? 'pos' : 'default'}
        />
        <StatCard
          icon={Wallet}
          value={
            stats.biggestExpense ? <AnimatedMoney cents={stats.biggestExpense.amount} /> : '—'
          }
          label="Maior gasto"
          {...(stats.biggestExpense
            ? {
                detail: `${stats.biggestExpense.description || 'sem descrição'} · ${formatYmShort(stats.biggestExpense.ym)}`,
              }
            : {})}
          tone="neg"
        />
      </div>

      <SummaryBalloon title="A história do período" segments={narrative(stats, brl)} className="mb-4" />

      {/* ── Gráfico principal: sobra mês a mês em área contínua ─────────── */}
      <Card className="p-5 mb-4">
        <CardTitle className="mb-1">Sobra mês a mês</CardTitle>
        <p className="text-[12px] text-ink-faint mb-4">
          Entradas menos saídas. Acima da linha do zero você guardou; abaixo, gastou mais do que
          entrou.
        </p>
        <SignedArea data={netSeries(stats, brl)} height={260} />
      </Card>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Patrimônio acumulado */}
        <Card className="p-5">
          <CardTitle className="mb-1">Patrimônio acumulado</CardTitle>
          <p className="text-[12px] text-ink-faint mb-4">
            Soma corrida das sobras e dos aportes do período.
          </p>
          <LineArea
            data={stats.cumulative.map((c) => ({
              label: formatYmTiny(c.ym),
              value: Math.max(0, c.value),
              tip: (
                <>
                  <span className="text-ink-soft first-letter:uppercase">{formatYmShort(c.ym)}</span>
                  <br />
                  <strong className="text-ink tnum">{brl(c.value)}</strong>
                  <br />
                  <span className="text-ink-faint">acumulado desde o início do período</span>
                </>
              ),
            }))}
            height={210}
          />
        </Card>

        {/* Taxa de poupança com a meta de 30% */}
        <Card className="p-5">
          <CardTitle className="mb-1">Taxa de poupança</CardTitle>
          <p className="text-[12px] text-ink-faint mb-4">
            Quanto de cada real que entrou ficou. A linha tracejada é a meta de 30%.
          </p>
          <SignedArea
            data={rateSeries(stats.months)}
            height={210}
            formatValue={(v) => formatPercent(v, 0)}
            goal={{ value: SAVINGS_GOAL, label: 'meta 30%' }}
          />
        </Card>
      </div>

      {/* ── Comparativo ano vs. ano ─────────────────────────────────────── */}
      {stats.years.length >= 2 && (
        <Card className="p-5 mb-4">
          <CardTitle className="mb-4">Ano a ano</CardTitle>
          <Bars
            data={stats.years.map((y) => ({
              label: y.year,
              values: [y.income, y.expenses, y.contributed],
              tip: (
                <>
                  <span className="text-ink-soft">{y.year}</span>
                  <br />
                  <strong className="text-ink tnum">
                    {y.net >= 0 ? 'sobrou ' : 'faltou '}
                    {brl(Math.abs(y.net))}
                  </strong>
                  <br />
                  <span className="text-ink-faint tnum">
                    entrou {brl(y.income)} · saiu {brl(y.expenses)} · aportou {brl(y.contributed)}
                  </span>
                </>
              ),
            }))}
            colors={[colors.pos, colors.neg, colors.primary]}
            height={230}
          />
          <div className="flex items-center gap-4 mt-3 text-[11.5px] text-ink-soft">
            <Legend color={colors.pos}>entrou</Legend>
            <Legend color={colors.neg}>saiu</Legend>
            <Legend color={colors.primary}>aportado</Legend>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Maiores categorias — barras horizontais */}
        <Card className="p-5">
          <CardTitle className="mb-4">Maiores categorias do período</CardTitle>
          {stats.topCategories.length === 0 ? (
            <p className="text-[13px] text-ink-faint py-4">Nenhum gasto no período.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {stats.topCategories.map(({ category, total }) => (
                <li key={category.id}>
                  <div className="flex items-center gap-2 text-[13px] mb-1 min-w-0">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: category.color }}
                    />
                    <span className="font-medium text-ink truncate">{category.name}</span>
                    <span className="ml-auto tnum text-ink font-semibold whitespace-nowrap">
                      {brl(total)}
                    </span>
                    <span className="tnum text-ink-faint min-w-11 text-right whitespace-nowrap">
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

        {/* Quadro de recordes */}
        <Card className="p-5">
          <CardTitle className="mb-3 flex items-center gap-2">
            <Trophy size={15} className="text-warn" /> Recordes do período
          </CardTitle>
          <ul className="flex flex-col gap-2.5 text-[13px]">
            <Record label="Melhor mês de sobra" row={stats.records.bestNet} pick={(r) => r.net} brl={brl} />
            <Record label="Pior mês de sobra" row={stats.records.worstNet} pick={(r) => r.net} brl={brl} />
            <Record label="Maior entrada mensal" row={stats.records.bestIncome} pick={(r) => r.income} brl={brl} />
            <Record label="Mês mais econômico" row={stats.records.leanestMonth} pick={(r) => r.expenses} brl={brl} />
            <Record
              label="Maior aporte mensal"
              row={stats.records.bestContribution}
              pick={(r) => r.contributed}
              brl={brl}
            />
            <li className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-ink-soft shrink-0">Aportado no período</span>
              <span className="text-primary font-semibold tnum ml-auto whitespace-nowrap">
                {brl(stats.invested)}
              </span>
            </li>
          </ul>
        </Card>
      </div>
    </>
  )
}

function Legend({ color, children }: { color: string; children: ReactNode }): ReactNode {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      {children}
    </span>
  )
}

/**
 * Linha de recorde. `flex-wrap` + `ml-auto`: com um valor de nove dígitos o
 * número desce para a própria linha em vez de ser cortado (regra permanente de
 * magnitude — largura fixa é o antipadrão).
 */
function Record({
  label,
  row,
  pick,
  brl,
}: {
  label: string
  row: MonthRow | null
  pick(r: MonthRow): number
  brl(cents: number): string
}): ReactNode {
  return (
    <li className="flex items-center justify-between gap-3 flex-wrap">
      <span className="text-ink-soft shrink-0">{label}</span>
      <span className="text-ink font-semibold tnum ml-auto whitespace-nowrap">
        {row === null ? '—' : `${formatYmShort(row.ym)} — ${brl(pick(row))}`}
      </span>
    </li>
  )
}

/** Série do gráfico principal, com os recordes já marcados. */
function netSeries(
  stats: ReturnType<typeof timelineStats>,
  brl: (cents: number) => string,
): SignedPoint[] {
  const bestYm = stats.records.bestNet?.ym
  const worstYm = stats.records.worstNet?.ym
  return stats.months.map((m) => ({
    label: formatYmTiny(m.ym),
    value: m.net,
    // Só marca o recorde quando ele diz alguma coisa: um "melhor mês" que empata
    // com o pior (série de um mês só) seria ruído.
    ...(m.ym === bestYm && bestYm !== worstYm
      ? { record: 'melhor' }
      : m.ym === worstYm && bestYm !== worstYm
        ? { record: 'pior' }
        : {}),
    tip: (
      <>
        <span className="text-ink-soft first-letter:uppercase">{formatYmShort(m.ym)}</span>
        <br />
        <strong className="text-ink tnum">
          {m.net >= 0 ? 'sobrou ' : 'faltou '}
          {brl(Math.abs(m.net))}
        </strong>
        <br />
        <span className="text-ink-faint tnum">
          entrou {brl(m.income)} · saiu {brl(m.expenses)}
        </span>
      </>
    ),
  }))
}

/**
 * Taxa de poupança mês a mês. Mês sem renda não tem taxa (`savingsRatio`
 * devolve `null`, e "não há fração" ≠ "não sobrou nada" — R4 §3): ele entra
 * como 0 no traço, mas o tooltip diz que não houve renda, em vez de mentir um
 * "0%" que pareceria um mês ruim.
 */
function rateSeries(months: readonly MonthRow[]): SignedPoint[] {
  return months.map((m) => {
    const r = savingsRatio(m.income, m.expenses)
    return {
      label: formatYmTiny(m.ym),
      value: r ?? 0,
      tip: (
        <>
          <span className="text-ink-soft first-letter:uppercase">{formatYmShort(m.ym)}</span>
          <br />
          {r === null ? (
            <span className="text-ink-faint">sem renda registrada neste mês</span>
          ) : (
            <strong className="text-ink tnum">{formatPercent(r, 0)} da renda ficou</strong>
          )}
        </>
      ),
    }
  })
}

/** Balão narrativo do período, em português simples e com os valores em destaque. */
function narrative(
  stats: ReturnType<typeof timelineStats>,
  brl: (cents: number) => string,
): BalloonSegment[] {
  const segs: BalloonSegment[] = []
  const meses = stats.months.length

  segs.push(
    `Em ${meses} ${meses === 1 ? 'mês' : 'meses'}, você `,
    stats.saved >= 0
      ? { value: `guardou ${brl(stats.saved)}`, tone: 'pos' }
      : { value: `gastou ${brl(-stats.saved)} a mais do que entrou`, tone: 'neg' },
  )

  if (stats.rate !== null) {
    segs.push(
      ', o equivalente a ',
      { value: formatPercent(stats.rate, 0), tone: stats.rate >= SAVINGS_GOAL ? 'pos' : 'warn' },
      ' de tudo que recebeu',
    )
  }
  segs.push('. ')

  if (stats.activeMonths > 0) {
    segs.push(
      'Foram ',
      { value: `${stats.bluesMonths} de ${stats.activeMonths} meses no azul`, tone: 'primary' },
      '. ',
    )
  }

  const best = stats.records.bestNet
  const worst = stats.records.worstNet
  if (best && worst && best.ym !== worst.ym) {
    segs.push(
      'O melhor mês foi ',
      { value: formatYmShort(best.ym), tone: 'ink' },
      ' (',
      { value: brl(best.net), tone: 'pos' },
      ') e o mais apertado, ',
      { value: formatYmShort(worst.ym), tone: 'ink' },
      ' (',
      { value: brl(worst.net), tone: worst.net < 0 ? 'neg' : 'ink' },
      '). ',
    )
  }

  if (stats.invested > 0) {
    segs.push('Nos aportes foram ', { value: brl(stats.invested), tone: 'primary' }, ' no período.')
  } else {
    segs.push('Nenhum aporte foi lançado no período.')
  }

  return segs
}
