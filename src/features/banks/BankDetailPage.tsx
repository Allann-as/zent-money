import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowLeftRight,
  CreditCard,
  Landmark,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Card, CardTitle } from '@/design/components/Card'
import { Button } from '@/design/components/Button'
import { StatCard } from '@/design/components/StatCard'
import { AnimatedMoney } from '@/design/AnimatedMoney'
import { SummaryBalloon, type BalloonSegment } from '@/design/components/SummaryBalloon'
import { EmptyState } from '@/design/components/EmptyState'
import { LineArea } from '@/design/charts/LineArea'
import { Bars } from '@/design/charts/Bars'
import { useChartColors } from '@/design/charts/useChartColors'
import { toast } from '@/design/components/toast'
import { useZentData } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import { reconcileBankBalance } from '@/store/ledgerActions'
import { availableLimit, monthlyCommitment } from '@/engine/cards'
import { combineSeries, investmentSeries } from '@/engine/investments'
import { expensesOfBank, groupByMonth } from '@/engine/aggregations'
import { bankBalances, bankMovements } from '@/engine/ledger'
import { formatPercent } from '@/engine/money'
import { useBRL } from '@/design/money'
import { currentYm, formatYmLong, formatYmTiny } from '@/engine/dates'
import type { Bank } from '@/data/schema'
import { BankLogo } from './BankLogo'
import { InlineMoney } from './BanksPage'
import { AccountHistory } from './AccountHistory'
import { PayInvoiceDialog, TransferDialog } from './ledgerDialogs'

/**
 * Drill-down de um banco (R3 §3.3): tudo daquele banco em uma página —
 * conta, investido, faturas, parcelas, limite e os gastos pagos por ele.
 * Os "gastos por banco" dependem da origem opcional do gasto (§3.4): quem
 * não marcou "Pago com" simplesmente não aparece aqui.
 */
export function BankDetailPage({ bank }: { bank: Bank }): ReactNode {
  const data = useZentData()
  const rates = data.rates
  const closeBankDetail = useUiStore((s) => s.closeBankDetail)
  const setView = useUiStore((s) => s.setView)
  const ym = useUiStore((s) => s.activeYm)
  const colors = useChartColors()
  const brl = useBRL()

  const [transferOpen, setTransferOpen] = useState(false)
  const [payInvoiceOpen, setPayInvoiceOpen] = useState(false)

  // Saldo e histórico DERIVADOS dos movimentos (ledger v7) — o card, o balão e
  // a última linha do histórico saem todos daqui, então não têm como divergir.
  const balance = useMemo(() => bankBalances(data).get(bank.id) ?? 0, [data, bank.id])
  const movements = useMemo(() => bankMovements(data, bank.id), [data, bank.id])

  const cards = useMemo(() => data.cards.filter((c) => c.bankId === bank.id), [data.cards, bank.id])
  const cardsById = useMemo(() => new Map(data.cards.map((c) => [c.id, c])), [data.cards])
  const cardIds = useMemo(() => new Set(cards.map((c) => c.id)), [cards])

  const investments = useMemo(
    () => data.investments.filter((i) => i.bankId === bank.id),
    [data.investments, bank.id],
  )

  const stats = useMemo(() => {
    const invoices = cards.reduce((a, c) => a + c.invoice, 0)
    const committed = cards.reduce((a, c) => a + monthlyCommitment(c.id, data.purchases), 0)
    const limitTotal = cards.reduce((a, c) => a + c.limit, 0)
    const available = cards.reduce((a, c) => a + availableLimit(c, data.purchases), 0)
    return { invoices, committed, limitTotal, available }
  }, [cards, data.purchases])

  // Série do investido NESTE banco (12m) — mesma máquina da Carteira
  const investedSeries = useMemo(
    () =>
      combineSeries(
        investments.map((inv) => investmentSeries(inv, data.contributions, rates)),
        currentYm(),
        12,
      ),
    [investments, data.contributions, rates],
  )

  const invested = investedSeries.balances[investedSeries.balances.length - 1] ?? 0

  const investedChart = useMemo(
    () =>
      investedSeries.months.map((m, i) => {
        const balance = investedSeries.balances[i] ?? 0
        return {
          label: formatYmTiny(m),
          value: balance,
          tip: (
            <span>
              {formatYmLong(m)}: <strong>{brl(balance)}</strong>
            </span>
          ),
        }
      }),
    [investedSeries, brl],
  )

  // Gastos do MÊS ATIVO pagos por este banco (conta ou cartões dele) — §3.4
  const expensesByYm = useMemo(() => groupByMonth(data.expenses), [data.expenses])
  const monthExpensesOfBank = useMemo(
    () => expensesOfBank(expensesByYm.get(ym) ?? [], bank.id, cardsById),
    [expensesByYm, ym, bank.id, cardsById],
  )
  const spentByBank = monthExpensesOfBank.reduce((a, e) => a + e.amount, 0)

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of monthExpensesOfBank) map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + e.amount)
    return Array.from(map.entries())
      .map(([id, total]) => ({ name: data.categories.find((c) => c.id === id)?.name ?? '—', total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
  }, [monthExpensesOfBank, data.categories])

  const purchasesOfBank = useMemo(
    () => data.purchases.filter((p) => p.cardId !== null && cardIds.has(p.cardId)),
    [data.purchases, cardIds],
  )

  /**
   * Gastos do mês lançados com origem em cada cartão (R4 §1.7). Existe para a
   * UI poder CONFRONTAR os dois números — o que você lançou × a fatura que
   * digitou — em vez de somar um no outro, que contaria em dobro (a fatura já
   * inclui as compras). Quem concilia é o usuário; o app só mostra a diferença.
   */
  const monthSpendByCard = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of expensesByYm.get(ym) ?? []) {
      if (e.origin?.kind === 'card') map.set(e.origin.cardId, (map.get(e.origin.cardId) ?? 0) + e.amount)
    }
    return map
  }, [expensesByYm, ym])

  const balloon: BalloonSegment[] = useMemo(() => {
    const segs: BalloonSegment[] = [
      `Em ${bank.name} você tem `,
      { value: brl(balance), tone: balance >= 0 ? 'pos' : 'neg' },
      ' em conta',
    ]
    if (invested > 0) {
      segs.push(' e ', { value: brl(invested), tone: 'primary', goTo: 'investments' }, ' investidos')
    }
    if (cards.length > 0) {
      segs.push(
        `. ${cards.length === 1 ? 'O cartão soma ' : `Os ${cards.length} cartões somam `}`,
        { value: brl(stats.invoices), tone: stats.invoices > 0 ? 'neg' : 'ink' },
        ' de fatura aberta e ',
        { value: `${brl(stats.committed)}/mês`, tone: stats.committed > 0 ? 'warn' : 'ink', goTo: 'installments' },
        ' em parcelas, com ',
        { value: brl(stats.available), tone: 'pos' },
        ' de limite livre',
      )
    }
    if (spentByBank > 0) {
      segs.push(
        `. Neste mês, `,
        { value: brl(spentByBank), tone: 'neg', goTo: 'expenses' },
        ' em gastos saíram daqui',
      )
    }
    segs.push('.')
    return segs
  }, [bank, balance, invested, cards.length, stats, spentByBank, brl])

  return (
    <>
      {/* Cabeçalho do banco com voltar */}
      <div className="flex items-center gap-4 mb-5 anim-page">
        <Button variant="ghost" size="md" onClick={closeBankDetail} aria-label="Voltar para Bancos & Cartões">
          <ArrowLeft size={16} /> Voltar
        </Button>
        <div className="flex items-center gap-4 min-w-0">
          <BankLogo name={bank.name} color={bank.color} size={54} />
          <div className="min-w-0">
            <h1 className="font-display text-[22px] font-bold text-ink tracking-tight truncate">
              {bank.name}
            </h1>
            <div className="text-[13px] text-ink-soft flex items-center gap-1">
              Saldo em conta:
              <InlineMoney
                value={balance}
                label="Saldo em conta"
                allowNegative
                onSave={(v) => {
                  // Conciliação (§1.5): registra a diferença, não sobrescreve.
                  const applied = reconcileBankBalance(bank.id, v)
                  if (applied === 0) return
                  toast.success(
                    'Saldo conciliado',
                    `Ajuste de ${applied > 0 ? '+' : '−'}${brl(Math.abs(applied))} registrado no histórico.`,
                  )
                }}
                className="font-semibold text-ink"
              />
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
            <ArrowLeftRight size={13.5} /> Transferir
          </Button>
          {cards.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setPayInvoiceOpen(true)}>
              <Receipt size={13.5} /> Pagar fatura
            </Button>
          )}
        </div>
      </div>

      {/* Cards do banco */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <StatCard icon={TrendingUp} value={<AnimatedMoney cents={invested} />} label="Investido aqui" tone="primary" />
        <StatCard icon={Receipt} value={<AnimatedMoney cents={stats.invoices} />} label="Faturas abertas" tone={stats.invoices > 0 ? 'neg' : 'default'} />
        <StatCard
          icon={CreditCard}
          value={<AnimatedMoney cents={stats.committed} />}
          label="Parcelas de cartão/mês"
        />
        <StatCard
          icon={Wallet}
          value={<AnimatedMoney cents={stats.available} />}
          label="Limite disponível"
          tone="pos"
          detail={stats.limitTotal > 0 ? `de ${brl(stats.limitTotal)} no total` : 'sem cartões'}
        />
      </div>

      <SummaryBalloon title={`Resumo de ${bank.name}`} segments={balloon} className="mb-4" />

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Evolução do investido neste banco */}
        <Card className="p-5">
          <CardTitle>Investido em {bank.name} (12 meses)</CardTitle>
          <div className="mt-4">
            {invested > 0 ? (
              <LineArea data={investedChart} height={170} />
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="Nada investido aqui"
                description="Aplicações deste banco cadastradas na Carteira aparecem neste gráfico."
                className="py-8"
                action={
                  <Button variant="soft" size="sm" onClick={() => setView('investments')}>
                    Ir para a Carteira
                  </Button>
                }
              />
            )}
          </div>
        </Card>

        {/* Gastos do mês pagos por este banco (§3.4) */}
        <Card className="p-5">
          <div className="flex items-baseline justify-between">
            <CardTitle>Gastos de {formatYmLong(ym)} por aqui</CardTitle>
            <span className="text-[13px] text-ink-soft tnum">
              <strong className="text-ink font-semibold">{brl(spentByBank)}</strong>
            </span>
          </div>
          <div className="mt-4">
            {spentByCategory.length > 0 ? (
              <Bars
                data={spentByCategory.map((r) => ({
                  label: r.name,
                  values: [r.total],
                  tip: (
                    <span>
                      {r.name}: <strong>{brl(r.total)}</strong>
                    </span>
                  ),
                }))}
                colors={[colors.primary]}
                height={170}
              />
            ) : (
              <EmptyState
                icon={Landmark}
                title="Nenhum gasto com origem aqui"
                description={'Marque "Pago com" ao lançar um gasto para ele entrar nesta análise.'}
                className="py-8"
                action={
                  <Button variant="soft" size="sm" onClick={() => setView('expenses')}>
                    Ir para Gastos
                  </Button>
                }
              />
            )}
          </div>
        </Card>
      </div>

      {/* Uso de limite por cartão */}
      {cards.length > 0 && (
        <Card className="p-5 mb-4">
          <CardTitle>Uso de limite por cartão</CardTitle>
          <div className="mt-4">
            <Bars
              data={cards.map((c) => {
                const used = c.limit - availableLimit(c, data.purchases)
                const pct = c.limit > 0 ? used / c.limit : 0
                return {
                  label: c.name,
                  values: [used],
                  tip: (
                    <span>
                      {c.name}: <strong>{brl(used)}</strong> de {brl(c.limit)} (
                      {formatPercent(pct, 0)})
                    </span>
                  ),
                }
              })}
              colors={[colors.primary]}
              height={150}
            />
          </div>
        </Card>
      )}

      {/* Cartões do banco, com parcelas */}
      <Card>
        <div className="px-5 pt-4 pb-3">
          <CardTitle>
            {cards.length === 0
              ? 'Cartões'
              : `${cards.length} ${cards.length === 1 ? 'cartão' : 'cartões'} · ${purchasesOfBank.length} ${purchasesOfBank.length === 1 ? 'compra parcelada' : 'compras parceladas'}`}
          </CardTitle>
        </div>
        {cards.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Nenhum cartão neste banco"
            description="Cadastre um cartão para acompanhar limite, fatura e parcelas por aqui."
            action={
              <Button variant="soft" size="sm" onClick={closeBankDetail}>
                Voltar e adicionar
              </Button>
            }
          />
        ) : (
          <ul className="px-3 pb-3 flex flex-col gap-2">
            {cards.map((c) => {
              const available = availableLimit(c, data.purchases)
              const used = c.limit - available
              const pct = c.limit > 0 ? Math.min(1, Math.max(0, used / c.limit)) : 0
              const cardPurchases = data.purchases.filter((p) => p.cardId === c.id)
              return (
                <li key={c.id} className="rounded-[12px] border border-line bg-surface-2/40 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-8 w-11 rounded-[7px] shrink-0"
                      style={{ background: bank.color }}
                      aria-hidden="true"
                    />
                    <p className="text-[13.5px] font-semibold text-ink flex-1 truncate">{c.name}</p>
                    <span className="text-[12px] text-ink-soft tnum">
                      fatura {brl(c.invoice)}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-3 mt-3 text-[12px]">
                    <span className="text-ink-faint">
                      Limite <strong className="block text-ink tnum text-[13px]">{brl(c.limit)}</strong>
                    </span>
                    <span className="text-ink-faint">
                      Usado <strong className="block text-ink tnum text-[13px]">{brl(used)}</strong>
                    </span>
                    <span className="text-ink-faint">
                      Disponível{' '}
                      <strong className="block text-pos tnum text-[13px]">{brl(available)}</strong>
                    </span>
                    <span className="text-ink-faint">
                      Parcelas{' '}
                      <strong className="block text-ink tnum text-[13px]">
                        {cardPurchases.filter((p) => p.paidInstallments < p.totalInstallments).length}
                      </strong>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden mt-3">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                  {/* Conciliação da fatura (§1.7): os dois números lado a lado, sem
                      somar um no outro — a fatura já embute as compras do mês. */}
                  {(monthSpendByCard.get(c.id) ?? 0) > 0 && (
                    <p className="text-[11.5px] text-ink-faint mt-2.5 leading-snug tnum">
                      Gastos de {formatYmLong(ym)} lançados neste cartão:{' '}
                      <strong className="text-ink-soft font-semibold">
                        {brl(monthSpendByCard.get(c.id) ?? 0)}
                      </strong>{' '}
                      · fatura que você digitou:{' '}
                      <strong className="text-ink-soft font-semibold">{brl(c.invoice)}</strong>. A
                      fatura não soma seus lançamentos — ela já os inclui.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* Histórico da conta (R4 §1): a prova de que o saldo é derivado */}
      <div className="mt-4">
        <AccountHistory movements={movements} balance={balance} />
      </div>

      <TransferDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        defaultFromBankId={bank.id}
      />
      <PayInvoiceDialog open={payInvoiceOpen} onClose={() => setPayInvoiceOpen(false)} bankId={bank.id} />
    </>
  )
}
