import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BadgeDollarSign,
  CalendarRange,
  ChartLine,
  ChevronDown,
  Info,
  PiggyBank,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  TrendingUp,
  Trophy,
  Wallet,
} from 'lucide-react'
import { PageHeader } from '@/features/common/PageHeader'
import { Card, CardTitle } from '@/design/components/Card'
import { Button } from '@/design/components/Button'
import { Segmented } from '@/design/components/Segmented'
import { StatCard } from '@/design/components/StatCard'
import { AnimatedMoney } from '@/design/AnimatedMoney'
import { SummaryBalloon, type BalloonSegment } from '@/design/components/SummaryBalloon'
import { EmptyState } from '@/design/components/EmptyState'
import { toast } from '@/design/components/toast'
import { confirmDialog } from '@/design/components/confirm'
import { LineArea } from '@/design/charts/LineArea'
import { Bars } from '@/design/charts/Bars'
import { Donut } from '@/design/charts/Donut'
import { Sparkline } from '@/design/charts/Sparkline'
import { useChartColors } from '@/design/charts/useChartColors'
import { useDataStore, useZentData } from '@/store/dataStore'
import { removeContribution as removeContributionRecipe } from '@/store/mutations'
import { useUiStore } from '@/store/uiStore'
import {
  combineSeries,
  investmentSeries,
  investmentSnapshot,
  type MonthlySeries,
} from '@/engine/investments'
import { ASSET_CLASS_LABELS, assetClass, rateLabel, type AssetClass } from '@/engine/rates'
import { formatPercent } from '@/engine/money'
import { useBRL } from '@/design/money'
import { currentYm, diffMonths, formatDateBR, formatYmShort, formatYmTiny, ymOfDate } from '@/engine/dates'
import { cn } from '@/lib/cn'
import type { Contribution, Investment } from '@/data/schema'
import { BankLogo } from '@/features/banks/BankLogo'
import {
  ContributionDialog,
  InvestmentDialog,
  ValueUpdateDialog,
  type ContributionDialogState,
  type InvestmentDialogState,
  type ValueUpdateDialogState,
} from './dialogs'

type ChartMode = 'evolution' | 'composition' | 'yield'

const CLASS_ORDER: AssetClass[] = ['pos', 'ipca', 'pre', 'outros']

export function InvestmentsPage(): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const colors = useChartColors()
  const brl = useBRL()

  const [bankFilter, setBankFilter] = useState<string>('all')
  const [classFilter, setClassFilter] = useState<AssetClass | 'all'>('all')
  const [mode, setMode] = useState<ChartMode>('evolution')
  const [invDialog, setInvDialog] = useState<InvestmentDialogState>('closed')
  const [contribDialog, setContribDialog] = useState<ContributionDialogState>('closed')
  const [valueDialog, setValueDialog] = useState<ValueUpdateDialogState>('closed')

  // Ação rápida vinda da paleta de comandos (Ctrl+K)
  const pendingAction = useUiStore((s) => s.pendingAction)
  const setPendingAction = useUiStore((s) => s.setPendingAction)
  useEffect(() => {
    if (pendingAction === 'new-asset') {
      setPendingAction(null)
      setInvDialog('new')
    }
  }, [pendingAction, setPendingAction])

  const banksById = useMemo(() => new Map(data.banks.map((b) => [b.id, b])), [data.banks])

  // Snapshots/séries de TODOS os ativos (para as roscas de composição)
  const allPerInvestment = useMemo(
    () =>
      data.investments.map((inv) => ({
        inv,
        cls: assetClass(inv.rateType),
        snapshot: investmentSnapshot(inv, data.contributions, data.rates),
        series: investmentSeries(inv, data.contributions, data.rates),
      })),
    [data.investments, data.contributions, data.rates],
  )

  // Filtros combináveis: banco × classe
  const perInvestment = useMemo(
    () =>
      allPerInvestment.filter(
        (x) =>
          (bankFilter === 'all' || x.inv.bankId === bankFilter) &&
          (classFilter === 'all' || x.cls === classFilter),
      ),
    [allPerInvestment, bankFilter, classFilter],
  )

  const consolidated = useMemo(() => {
    const balance = perInvestment.reduce((a, x) => a + x.snapshot.balance, 0)
    const invested = perInvestment.reduce((a, x) => a + x.snapshot.invested, 0)
    const totalYield = balance - invested
    const perMonth = perInvestment.reduce((a, x) => a + x.snapshot.yieldPerMonth, 0)
    const perYear = perInvestment.reduce((a, x) => a + x.snapshot.yieldPerYear, 0)
    return { balance, invested, totalYield, ratio: invested > 0 ? totalYield / invested : 0, perMonth, perYear }
  }, [perInvestment])

  const combined: MonthlySeries = useMemo(() => {
    const activityYms = [
      ...data.contributions
        .filter((c) => perInvestment.some((x) => x.inv.id === c.investmentId))
        .map((c) => ymOfDate(c.date)),
      ...perInvestment.flatMap((x) => x.inv.valueUpdates.map((u) => ymOfDate(u.date))),
    ].sort()
    const first = activityYms[0]
    const span = first ? diffMonths(first, currentYm()) + 1 : 6
    const window = Math.min(60, Math.max(6, span))
    return combineSeries(
      perInvestment.map((x) => x.series),
      currentYm(),
      window,
    )
  }, [perInvestment, data.contributions])

  const hasAnyActivity = combined.balances.some((b) => b > 0)

  // Composição por classe e por banco (sobre o conjunto filtrado)
  const byClass = useMemo(() => {
    const map = new Map<AssetClass, number>()
    for (const x of perInvestment) {
      if (x.snapshot.balance <= 0) continue
      map.set(x.cls, (map.get(x.cls) ?? 0) + x.snapshot.balance)
    }
    // métricas neutras: variações de azul do próprio acento (disciplina de cor)
    const classColors: Record<AssetClass, string> = {
      pos: colors.series[0] ?? colors.primary,
      ipca: colors.series[1] ?? colors.primary,
      pre: colors.series[2] ?? colors.primary,
      outros: colors.series[3] ?? colors.primary,
    }
    return CLASS_ORDER.filter((c) => map.has(c)).map((c) => ({
      id: c,
      label: ASSET_CLASS_LABELS[c],
      value: map.get(c) ?? 0,
      color: classColors[c],
    }))
  }, [perInvestment, colors])

  const byBank = useMemo(() => {
    const map = new Map<string, number>()
    for (const x of perInvestment) {
      if (x.snapshot.balance <= 0) continue
      map.set(x.inv.bankId, (map.get(x.inv.bankId) ?? 0) + x.snapshot.balance)
    }
    return Array.from(map.entries())
      .map(([bankId, value]) => {
        const bank = banksById.get(bankId)
        return { id: bankId, label: bank?.name ?? '—', value, color: bank?.color ?? colors.primary }
      })
      .sort((a, b) => b.value - a.value)
  }, [perInvestment, banksById, colors])

  const topAssets = useMemo(
    () =>
      [...perInvestment]
        .filter((x) => x.snapshot.balance > 0)
        .sort((a, b) => b.snapshot.balance - a.snapshot.balance)
        .slice(0, 5),
    [perInvestment],
  )

  const balloon: BalloonSegment[] = useMemo(() => {
    if (!hasAnyActivity) {
      return [
        'Sua carteira ainda está vazia — crie um ativo e registre aportes (ou o valor de mercado, para fundos, ações e cripto) que a evolução aparece aqui.',
      ]
    }
    const segs: BalloonSegment[] = [
      'A carteira soma ',
      { value: brl(consolidated.balance), tone: 'primary' },
      ' — ',
      { value: brl(consolidated.invested), tone: 'ink' },
      ' aportados e ',
      { value: `+${brl(consolidated.totalYield)}`, tone: consolidated.totalYield >= 0 ? 'pos' : 'neg' },
      ` de rendimento acumulado (${formatPercent(consolidated.ratio, 1)})`,
    ]
    if (consolidated.perMonth > 0) {
      segs.push(', rendendo cerca de ', { value: `${brl(consolidated.perMonth)}/mês`, tone: 'pos' })
    }
    const top = topAssets[0]
    if (top) {
      segs.push('. Maior posição: ', { value: top.inv.name, tone: 'ink' }, ` (${formatPercent(consolidated.balance > 0 ? top.snapshot.balance / consolidated.balance : 0, 0)})`)
    }
    segs.push('.')
    return segs
  }, [hasAnyActivity, consolidated, topAssets, brl])

  async function removeInvestment(inv: Investment): Promise<void> {
    const count = data.contributions.filter((c) => c.investmentId === inv.id).length
    const linkedBox = data.boxes.find((b) => b.investmentId === inv.id)
    const ok = await confirmDialog({
      title: `Excluir ${inv.name}`,
      message: `${count > 0 ? `Os ${count} aportes registrados serão excluídos junto. ` : ''}${
        linkedBox ? `A caixinha "${linkedBox.name}" está vinculada e passará a ser manual. ` : ''
      }Essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir ativo',
      danger: true,
    })
    if (!ok) return
    mutate((d) => {
      const inv2 = d.investments.find((x) => x.id === inv.id)
      const snapshotBalance = inv2 ? investmentSnapshot(inv2, d.contributions, d.rates).balance : 0
      d.investments = d.investments.filter((x) => x.id !== inv.id)
      d.contributions = d.contributions.filter((c) => c.investmentId !== inv.id)
      for (const box of d.boxes) {
        if (box.investmentId === inv.id) {
          box.investmentId = null
          box.manualAmount = snapshotBalance
        }
      }
    })
    toast.success(`${inv.name} excluído`)
  }

  return (
    <>
      <PageHeader
        title="Carteira"
        subtitle="Investimentos e gestão de ativos"
        actions={
          <Button onClick={() => setInvDialog('new')}>
            <Plus size={15} /> Novo ativo
          </Button>
        }
      />

      {/* Painel consolidado (padrão StatCard) */}
      <div className="grid grid-cols-5 gap-4 mb-4">
        <StatCard icon={Wallet} value={<AnimatedMoney cents={consolidated.balance} />} label="Saldo total" />
        <StatCard icon={PiggyBank} value={<AnimatedMoney cents={consolidated.invested} />} label="Total aportado" />
        <StatCard
          icon={TrendingUp}
          value={<>{'+'}<AnimatedMoney cents={consolidated.totalYield} /></>}
          label="Rendimento acumulado"
          tone="pos"
          detail={formatPercent(consolidated.ratio, 2)}
        />
        <StatCard icon={CalendarRange} value={<AnimatedMoney cents={consolidated.perMonth} />} label="Rende por mês" />
        <StatCard icon={BadgeDollarSign} value={<AnimatedMoney cents={consolidated.perYear} />} label="Rende por ano" />
      </div>

      <SummaryBalloon title="Resumo da carteira" segments={balloon} className="mb-4" />

      {/* Filtros + gráfico principal */}
      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtrar por banco">
            <button
              type="button"
              onClick={() => setBankFilter('all')}
              className={cn(
                'h-8 px-3 rounded-full text-[12.5px] font-medium border transition-all duration-150 cursor-pointer',
                bankFilter === 'all'
                  ? 'bg-primary text-on-primary border-transparent'
                  : 'border-line-strong text-ink-soft hover:text-ink bg-surface-2',
              )}
            >
              Todos
            </button>
            {data.banks.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBankFilter(bankFilter === b.id ? 'all' : b.id)}
                className={cn(
                  'h-8 pl-1.5 pr-3 rounded-full text-[12.5px] font-medium border inline-flex items-center gap-1.5 transition-all duration-150 cursor-pointer',
                  bankFilter === b.id
                    ? 'text-white border-transparent shadow-[0_2px_8px_rgba(0,0,0,0.25)]'
                    : 'border-line-strong text-ink-soft hover:text-ink bg-surface-2',
                )}
                style={bankFilter === b.id ? { background: b.color } : undefined}
              >
                <BankLogo name={b.name} color={b.color} size={20} />
                {b.name}
              </button>
            ))}
          </div>
          <Segmented<ChartMode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'evolution', label: 'Evolução' },
              { value: 'composition', label: 'Composição' },
              { value: 'yield', label: 'Rendimento mês a mês' },
            ]}
          />
        </div>

        {/* Filtro por classe (combinável) */}
        <div className="flex items-center gap-1.5 flex-wrap mb-4" role="group" aria-label="Filtrar por classe">
          <button
            type="button"
            onClick={() => setClassFilter('all')}
            className={cn(
              'h-7 px-2.5 rounded-full text-[12px] font-medium border transition-all duration-150 cursor-pointer',
              classFilter === 'all'
                ? 'bg-primary-soft text-primary border-transparent'
                : 'border-line text-ink-faint hover:text-ink bg-transparent',
            )}
          >
            Todas as classes
          </button>
          {CLASS_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setClassFilter(classFilter === c ? 'all' : c)}
              className={cn(
                'h-7 px-2.5 rounded-full text-[12px] font-medium border transition-all duration-150 cursor-pointer',
                classFilter === c
                  ? 'bg-primary-soft text-primary border-transparent'
                  : 'border-line text-ink-faint hover:text-ink bg-transparent',
              )}
            >
              {ASSET_CLASS_LABELS[c]}
            </button>
          ))}
        </div>

        {!hasAnyActivity ? (
          <EmptyState
            icon={ChartLine}
            title="Sem dados para o gráfico ainda"
            description="Crie um ativo e registre aportes ou valores de mercado — evolução, composição e rendimento mensal aparecem aqui."
            className="py-8"
          />
        ) : mode === 'evolution' ? (
          <LineArea
            data={combined.months.map((ym, i) => ({
              label: formatYmTiny(ym),
              value: combined.balances[i] ?? 0,
              tip: (
                <>
                  <span className="text-ink-soft first-letter:uppercase">{formatYmShort(ym)}</span>
                  <br />
                  <strong className="text-ink tnum">{brl(combined.balances[i] ?? 0)}</strong>
                  {(combined.contributions[i] ?? 0) > 0 && (
                    <>
                      <br />
                      <span className="text-ink-faint tnum">
                        aportes: {brl(combined.contributions[i] ?? 0)}
                      </span>
                    </>
                  )}
                </>
              ),
            }))}
          />
        ) : mode === 'composition' ? (
          <Donut
            slices={perInvestment
              .filter((x) => x.snapshot.balance > 0)
              .sort((a, b) => b.snapshot.balance - a.snapshot.balance)
              .map((x) => ({
                id: x.inv.id,
                label: x.inv.name,
                value: x.snapshot.balance,
                color: banksById.get(x.inv.bankId)?.color ?? colors.primary,
              }))}
            centerTitle="Carteira"
            centerValue={brl(consolidated.balance)}
          />
        ) : (
          <Bars
            data={combined.months.map((ym, i) => ({
              label: formatYmTiny(ym),
              values: [combined.yields[i] ?? 0],
              tip: (
                <>
                  <span className="text-ink-soft first-letter:uppercase">{formatYmShort(ym)}</span>
                  <br />
                  <strong className="text-ink tnum">
                    {brl(combined.yields[i] ?? 0)} de juros
                  </strong>
                  <br />
                  <span className="text-ink-faint tnum">
                    {formatPercent(combined.yieldRatios[i] ?? 0, 2)} no mês
                  </span>
                </>
              ),
            }))}
            colorFor={(_, v) => (v >= 0 ? colors.pos : colors.neg)}
          />
        )}

        <p className="flex items-center gap-1.5 text-[11.5px] text-ink-faint mt-4 pt-3 border-t border-line">
          <Info size={12} className="shrink-0" />
          Estimativas brutas (sem IR) calculadas com as taxas de referência — o saldo oficial é o da
          instituição. Ativos de valor manual usam a sua última atualização.
        </p>
      </Card>

      {/* Grade dashboard: composição por classe · por banco · top ativos */}
      {hasAnyActivity && (
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Card className="p-5">
            <CardTitle className="mb-3">Composição por classe</CardTitle>
            <Donut slices={byClass} size={120} thickness={22} centerTitle="Total" centerValue={brl(consolidated.balance)} />
          </Card>
          <Card className="p-5">
            <CardTitle className="mb-3">Composição por banco</CardTitle>
            <Donut slices={byBank} size={120} thickness={22} centerTitle="Total" centerValue={brl(consolidated.balance)} />
          </Card>
          <Card className="p-5">
            <CardTitle className="mb-3 flex items-center gap-2">
              <Trophy size={14} className="text-warn" /> Top ativos
            </CardTitle>
            <ul className="flex flex-col gap-2.5">
              {topAssets.map((x) => {
                const max = topAssets[0]?.snapshot.balance ?? 1
                const bank = banksById.get(x.inv.bankId)
                return (
                  <li key={x.inv.id}>
                    <div className="flex items-center gap-2 text-[12.5px] mb-1">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: bank?.color ?? colors.primary }}
                      />
                      <span className="font-medium text-ink truncate">{x.inv.name}</span>
                      <span className="ml-auto tnum text-ink font-semibold shrink-0">
                        {brl(x.snapshot.balance)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(x.snapshot.balance / max) * 100}%`,
                          background: bank?.color ?? colors.primary,
                        }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>
      )}

      {/* Cards por ativo */}
      {perInvestment.length === 0 ? (
        <Card>
          <EmptyState
            icon={ChartLine}
            title={
              bankFilter === 'all' && classFilter === 'all'
                ? 'Nenhum ativo cadastrado'
                : 'Nada com esses filtros'
            }
            description="Cadastre CDBs, Tesouro, fundos, ações ou cripto — cada ativo com sua classe."
            action={
              <Button variant="soft" size="sm" onClick={() => setInvDialog('new')}>
                <Plus size={14} /> Criar ativo
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {perInvestment.map(({ inv, snapshot, series }) => (
            <InvestmentCard
              key={inv.id}
              inv={inv}
              snapshot={snapshot}
              series={series}
              bankColor={banksById.get(inv.bankId)?.color ?? colors.primary}
              bankName={banksById.get(inv.bankId)?.name ?? '—'}
              contributions={data.contributions.filter((c) => c.investmentId === inv.id)}
              onEdit={() => setInvDialog(inv)}
              onRemove={() => void removeInvestment(inv)}
              onContribute={() => setContribDialog({ investment: inv })}
              onUpdateValue={() => setValueDialog({ investment: inv })}
            />
          ))}
        </div>
      )}

      <InvestmentDialog state={invDialog} onClose={() => setInvDialog('closed')} />
      <ContributionDialog state={contribDialog} onClose={() => setContribDialog('closed')} />
      <ValueUpdateDialog state={valueDialog} onClose={() => setValueDialog('closed')} />
    </>
  )
}

function InvestmentCard({
  inv,
  snapshot,
  series,
  bankColor,
  bankName,
  contributions,
  onEdit,
  onRemove,
  onContribute,
  onUpdateValue,
}: {
  inv: Investment
  snapshot: ReturnType<typeof investmentSnapshot>
  series: MonthlySeries
  bankColor: string
  bankName: string
  contributions: Contribution[]
  onEdit(): void
  onRemove(): void
  onContribute(): void
  onUpdateValue(): void
}): ReactNode {
  const mutate = useDataStore((s) => s.mutate)
  const brl = useBRL()
  const [showHistory, setShowHistory] = useState(false)

  const sorted = [...contributions].sort((a, b) => b.date.localeCompare(a.date))
  const manual = inv.rateType === 'manual'

  async function removeContribution(c: Contribution): Promise<void> {
    const ok = await confirmDialog({
      title: 'Excluir aporte',
      message: `Excluir o aporte de ${brl(c.amount)} em ${formatDateBR(c.date)}? O saldo estimado será recalculado.`,
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    mutate((d) => removeContributionRecipe(d, c.id))
    toast.success('Aporte excluído')
  }

  return (
    <Card className="p-5 flex flex-col" style={{ boxShadow: `inset 0 3px 0 ${bankColor}` }}>
      <div className="flex items-start gap-3">
        <BankLogo name={bankName} color={bankColor} size={34} />
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate">{inv.name}</CardTitle>
          <p className="text-[11.5px] text-ink-faint">
            {bankName} · {ASSET_CLASS_LABELS[assetClass(inv.rateType)]} · {rateLabel(inv.rateType, inv.rateParam)}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            aria-label={`Editar ${inv.name}`}
            onClick={onEdit}
            className="h-7.5 w-7.5 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 cursor-pointer transition-colors"
          >
            <Pencil size={13.5} />
          </button>
          <button
            type="button"
            aria-label={`Excluir ${inv.name}`}
            onClick={onRemove}
            className="h-7.5 w-7.5 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-neg hover:bg-neg-soft cursor-pointer transition-colors"
          >
            <Trash2 size={13.5} />
          </button>
        </div>
      </div>

      <div className="flex items-end justify-between mt-4">
        <div>
          <p className="text-[11.5px] text-ink-faint">
            {manual ? 'Valor de mercado' : 'Saldo estimado'}
          </p>
          <p className="font-display text-[22px] font-bold text-ink tnum leading-tight">
            {brl(snapshot.balance)}
          </p>
          <p className="text-[12px] tnum mt-0.5">
            <span className="text-ink-soft">aportado {brl(snapshot.invested)}</span>
            {snapshot.invested > 0 && (
              <span
                className={cn(
                  'font-semibold ml-2',
                  snapshot.totalYieldRatio >= 0 ? 'text-pos' : 'text-neg',
                )}
              >
                {snapshot.totalYieldRatio >= 0 ? '+' : ''}
                {formatPercent(snapshot.totalYieldRatio, 2)}
              </span>
            )}
          </p>
        </div>
        {series.balances.length >= 2 && (
          <Sparkline values={series.balances} color={bankColor} width={130} height={40} />
        )}
      </div>

      {snapshot.hasRate ? (
        <div className="grid grid-cols-4 gap-2 mt-4 pt-3.5 border-t border-line text-center">
          <div>
            <p className="text-[10.5px] text-ink-faint">Taxa a.a.</p>
            <p className="text-[12.5px] font-semibold text-ink tnum">
              {snapshot.annualPercent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
            </p>
          </div>
          <div>
            <p className="text-[10.5px] text-ink-faint">Taxa a.m.</p>
            <p className="text-[12.5px] font-semibold text-ink tnum">
              {formatPercent(snapshot.monthly, 2)}
            </p>
          </div>
          <div>
            <p className="text-[10.5px] text-ink-faint">Rende/mês</p>
            <p className="text-[12.5px] font-semibold text-pos tnum">{brl(snapshot.yieldPerMonth)}</p>
          </div>
          <div>
            <p className="text-[10.5px] text-ink-faint">Rende/ano</p>
            <p className="text-[12.5px] font-semibold text-pos tnum">{brl(snapshot.yieldPerYear)}</p>
          </div>
        </div>
      ) : (
        <p className="mt-4 pt-3.5 border-t border-line text-[11.5px] text-ink-faint">
          Sem taxa automática — o valor acompanha suas atualizações de mercado
          {inv.valueUpdates.length > 0
            ? ` (última em ${formatDateBR([...inv.valueUpdates].sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? '')})`
            : ''}
          .
        </p>
      )}

      <div className="flex items-center gap-2 mt-4">
        <Button size="sm" onClick={onContribute}>
          <Plus size={13} /> Aporte
        </Button>
        {manual && (
          <Button size="sm" variant="soft" onClick={onUpdateValue}>
            <RefreshCcw size={13} /> Atualizar valor
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setShowHistory(!showHistory)} disabled={sorted.length === 0}>
          <ChevronDown size={13} className={cn('transition-transform duration-200', showHistory && 'rotate-180')} />
          {sorted.length} {sorted.length === 1 ? 'aporte' : 'aportes'}
        </Button>
      </div>

      {showHistory && sorted.length > 0 && (
        <ul className="mt-3 border-t border-line pt-2 max-h-44 overflow-y-auto">
          {sorted.map((c) => (
            <li
              key={c.id}
              className="group flex items-center gap-3 px-2 h-9 rounded-[8px] hover:bg-surface-2 transition-colors"
            >
              <span className="text-[12px] text-ink-faint tnum">{formatDateBR(c.date)}</span>
              <span className="ml-auto text-[12.5px] font-semibold text-ink tnum">
                {brl(c.amount)}
              </span>
              <button
                type="button"
                aria-label="Excluir aporte"
                onClick={() => void removeContribution(c)}
                className="h-6.5 w-6.5 rounded-[7px] inline-flex items-center justify-center text-ink-faint hover:text-neg hover:bg-neg-soft cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
