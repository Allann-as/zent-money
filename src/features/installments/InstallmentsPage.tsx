import { useMemo, useState, type ReactNode } from 'react'
import {
  BadgeCheck,
  CalendarCheck,
  CalendarClock,
  Check,
  Layers,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Undo2,
  Wallet,
} from 'lucide-react'
import { PageHeader } from '@/features/common/PageHeader'
import { Card, CardTitle } from '@/design/components/Card'
import { Button } from '@/design/components/Button'
import { Select } from '@/design/components/Select'
import { Segmented } from '@/design/components/Segmented'
import { StatCard } from '@/design/components/StatCard'
import { AnimatedMoney } from '@/design/AnimatedMoney'
import { SummaryBalloon, type BalloonSegment } from '@/design/components/SummaryBalloon'
import { EmptyState } from '@/design/components/EmptyState'
import { toast } from '@/design/components/toast'
import { confirmDialog } from '@/design/components/confirm'
import { useDataStore, useZentData } from '@/store/dataStore'
import {
  isStandalone,
  payoffYm,
  remainingAmount,
  remainingInstallments,
  totalMonthlyCommitment,
} from '@/engine/cards'
import { useBRL } from '@/design/money'
import { formatYmShort, ymCompare } from '@/engine/dates'
import { cn } from '@/lib/cn'
import type { Purchase } from '@/data/schema'
import { BankLogo } from '@/features/banks/BankLogo'
import { PurchaseDialog, type PurchaseDialogState } from '@/features/banks/dialogs'
import { PayInvoiceDialog } from '@/features/banks/ledgerDialogs'
import { unpayInstallment } from '@/store/mutations'
import { PayInstallmentDialog, type PayInstallmentState } from './PayInstallmentDialog'

type StatusFilter = 'active' | 'done' | 'all'

/** Valor especial do filtro de banco: só parcelas avulsas (R3 §2). */
const STANDALONE_FILTER = 'standalone'

/**
 * Parcelas — visão consolidada (§5.5): agrega TODAS as compras parceladas
 * de todos os cartões. Mesma fonte de verdade de Bancos & Cartões
 * (data.purchases) — duas visões, um dado.
 */
export function InstallmentsPage(): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const brl = useBRL()

  const [bankFilter, setBankFilter] = useState('all')
  const [cardFilter, setCardFilter] = useState('all')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [dialog, setDialog] = useState<PurchaseDialogState>('closed')
  const [payDialog, setPayDialog] = useState<PayInstallmentState>('closed')
  const [invoiceCardId, setInvoiceCardId] = useState<string | null>(null)

  const banksById = useMemo(() => new Map(data.banks.map((b) => [b.id, b])), [data.banks])
  const cardsById = useMemo(() => new Map(data.cards.map((c) => [c.id, c])), [data.cards])

  const stats = useMemo(() => {
    const active = data.purchases.filter((p) => remainingInstallments(p) > 0)
    // inclui avulsas: o comprometido do mês é de TODAS as parcelas (R3 §2)
    const monthly = totalMonthlyCommitment(data.purchases)
    const remaining = active.reduce((a, p) => a + remainingAmount(p), 0)
    let next: { purchase: Purchase; ym: string } | null = null
    for (const p of active) {
      const ym = payoffYm(p)
      if (ym && (next === null || ymCompare(ym, next.ym) < 0)) next = { purchase: p, ym }
    }
    return { active, monthly, remaining, next }
  }, [data.purchases])

  const filtered = useMemo(() => {
    return data.purchases
      .filter((p) => {
        if (bankFilter === STANDALONE_FILTER) {
          if (!isStandalone(p)) return false
        } else {
          // avulsa não tem cartão nem banco: qualquer filtro de banco/cartão a exclui
          const card = p.cardId === null ? undefined : cardsById.get(p.cardId)
          if (cardFilter !== 'all' && p.cardId !== cardFilter) return false
          if (bankFilter !== 'all' && card?.bankId !== bankFilter) return false
        }
        const done = remainingInstallments(p) === 0
        if (status === 'active' && done) return false
        if (status === 'done' && !done) return false
        return true
      })
      .sort((a, b) => {
        const ra = remainingInstallments(a) === 0 ? 1 : 0
        const rb = remainingInstallments(b) === 0 ? 1 : 0
        if (ra !== rb) return ra - rb
        const ya = payoffYm(a) ?? '9999-99'
        const yb = payoffYm(b) ?? '9999-99'
        return ya.localeCompare(yb)
      })
  }, [data.purchases, bankFilter, cardFilter, status, cardsById])

  const cardOptions = useMemo(
    () => (bankFilter === 'all' ? data.cards : data.cards.filter((c) => c.bankId === bankFilter)),
    [data.cards, bankFilter],
  )

  const balloon: BalloonSegment[] = useMemo(() => {
    if (stats.active.length === 0) {
      return [
        'Nenhuma compra parcelada ativa no momento — seu limite de crédito está totalmente livre. Novas compras são cadastradas em ',
        { value: 'Bancos & Cartões', tone: 'primary', goTo: 'banks' },
        ' ou pelo botão acima.',
      ]
    }
    const segs: BalloonSegment[] = [
      'Você tem ',
      {
        value: `${stats.active.length} ${stats.active.length === 1 ? 'compra ativa' : 'compras ativas'}`,
        tone: 'primary',
        goTo: 'banks',
      },
      ' comprometendo ',
      { value: `${brl(stats.monthly)}/mês`, tone: 'warn' },
      ' do seu crédito; ainda faltam ',
      { value: brl(stats.remaining), tone: 'neg' },
      ' no total',
    ]
    if (stats.next) {
      segs.push(
        '. A próxima quitação é ',
        { value: stats.next.purchase.name, tone: 'ink' },
        ' em ',
        { value: formatYmShort(stats.next.ym), tone: 'pos' },
      )
    }
    segs.push('.')
    return segs
  }, [stats, brl])

  /**
   * Desfazer a última parcela paga. O caminho de IDA saiu daqui: registrar um
   * pagamento passou a abrir a confirmação já preenchida (§⑤), porque marcar
   * dinheiro como pago com um clique cego é fácil demais de errar. A VOLTA
   * continua sendo um clique — desfazer um engano não pode ter atrito.
   */
  function undoInstallment(p: Purchase): void {
    mutate((d) => unpayInstallment(d, p.id))
    toast.info(
      'Pagamento desfeito',
      `A ${p.paidInstallments}ª parcela de "${p.name}" voltou a constar como em aberto.`,
    )
  }

  async function removePurchase(p: Purchase): Promise<void> {
    const ok = await confirmDialog({
      title: isStandalone(p) ? 'Excluir parcela avulsa' : 'Excluir compra parcelada',
      message: isStandalone(p)
        ? `Excluir "${p.name}"? Ela sai do comprometido do mês.`
        : `Excluir "${p.name}"? O valor comprometido volta para o limite disponível do cartão.`,
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    mutate((d) => {
      d.purchases = d.purchases.filter((x) => x.id !== p.id)
    })
    toast.success(isStandalone(p) ? 'Parcela avulsa excluída' : 'Compra excluída')
  }

  const firstCardId = data.cards[0]?.id
  // tipo inicial do diálogo: segue o filtro ativo; sem cartão nenhum, só resta avulsa
  const newDialogCardId =
    bankFilter === STANDALONE_FILTER
      ? null
      : cardFilter !== 'all'
        ? cardFilter
        : (firstCardId ?? null)

  return (
    <>
      <PageHeader
        title="Parcelas"
        subtitle="Compras no cartão e parcelas avulsas, tudo em um lugar"
        actions={
          <Button onClick={() => setDialog({ mode: 'new', cardId: newDialogCardId })}>
            <Plus size={15} /> Nova parcela
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-4">
        <StatCard icon={CalendarClock} value={<AnimatedMoney cents={stats.monthly} />} label="Comprometido por mês" />
        <StatCard icon={Wallet} value={<AnimatedMoney cents={stats.remaining} />} label="Falta pagar no total" tone={stats.remaining > 0 ? 'neg' : 'default'} />
        <StatCard
          icon={CalendarCheck}
          value={stats.next ? formatYmShort(stats.next.ym) : '—'}
          label="Próxima quitação"
          {...(stats.next ? { detail: stats.next.purchase.name } : {})}
          tone="pos"
        />
      </div>

      <SummaryBalloon title="Resumo das parcelas" segments={balloon} className="mb-4" />

      <Card>
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 flex-wrap">
          <CardTitle>Compras parceladas</CardTitle>
          <div className="ml-auto flex items-center gap-2">
            <Select
              value={bankFilter}
              onChange={(e) => {
                setBankFilter(e.target.value)
                setCardFilter('all')
              }}
              className="h-8.5 w-36 text-[13px]"
              aria-label="Filtrar por banco"
            >
              <option value="all">Todos os bancos</option>
              {data.banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
              <option value={STANDALONE_FILTER}>Avulsas</option>
            </Select>
            <Select
              value={cardFilter}
              onChange={(e) => setCardFilter(e.target.value)}
              className="h-8.5 w-36 text-[13px]"
              aria-label="Filtrar por cartão"
              disabled={bankFilter === STANDALONE_FILTER}
            >
              <option value="all">Todos os cartões</option>
              {cardOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Segmented<StatusFilter>
              value={status}
              onChange={setStatus}
              options={[
                { value: 'active', label: 'Ativas' },
                { value: 'done', label: 'Quitadas' },
                { value: 'all', label: 'Todas' },
              ]}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Layers}
            title={data.purchases.length === 0 ? 'Nenhuma parcela ativa' : 'Nada com esses filtros'}
            description={
              data.purchases.length === 0
                ? 'Compras no cartão reduzem o limite disponível automaticamente; parcelas avulsas (empréstimo, crediário, boleto) entram só no comprometido do mês. Cadastre as duas aqui.'
                : 'Ajuste os filtros de banco, cartão ou status para ver outras parcelas.'
            }
          />
        ) : (
          <ul className="px-3 pb-3 flex flex-col gap-2">
            {filtered.map((p) => {
              const standalone = isStandalone(p)
              const card = p.cardId === null ? undefined : cardsById.get(p.cardId)
              const bank = card ? banksById.get(card.bankId) : undefined
              const remaining = remainingInstallments(p)
              const progress = p.paidInstallments / p.totalInstallments
              const payoff = payoffYm(p)
              return (
                <li
                  key={p.id}
                  className={cn(
                    'rounded-[12px] border px-4 py-3 flex items-center gap-3.5',
                    // ── Quitada tem estado PRÓPRIO, não é a ativa esmaecida ──
                    // Antes ela era o mesmo card a 55% de opacidade, o que lê
                    // como "desligado/indisponível". Quitar uma compra é uma
                    // conquista: o card ganha a borda e o selo em `pos` e
                    // continua perfeitamente legível.
                    remaining === 0
                      ? 'border-pos/30 bg-pos-soft'
                      : 'border-line bg-surface-2/40',
                  )}
                >
                  {standalone ? (
                    // avulsa não tem banco: chip neutro no lugar do logo
                    <span
                      className="h-8.5 w-8.5 shrink-0 rounded-[9px] border border-line bg-surface-3 inline-flex items-center justify-center text-ink-faint"
                      title="Parcela avulsa — não vinculada a cartão"
                    >
                      <Receipt size={15} />
                    </span>
                  ) : (
                    bank && <BankLogo name={bank.name} color={bank.color} size={34} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-[13.5px] font-semibold text-ink truncate">{p.name}</p>
                      {remaining === 0 && (
                        <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-px rounded-[5px] border border-pos/35 text-pos text-[10.5px] font-semibold uppercase tracking-wide">
                          <BadgeCheck size={11} /> quitada
                        </span>
                      )}
                      {standalone ? (
                        <span className="text-[11.5px] text-ink-faint truncate flex items-baseline gap-1.5">
                          <span className="px-1.5 py-px rounded-[5px] border border-line bg-surface-3 text-[10.5px] font-medium uppercase tracking-wide">
                            avulsa
                          </span>
                          {p.creditor ?? ''}
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-ink-faint truncate">
                          {bank?.name} · {card?.name ?? 'cartão removido'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 mt-1.5">
                      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden flex-1 max-w-[220px]">
                        <div
                          className={cn(
                            'h-full rounded-full transition-[width] duration-300',
                            remaining === 0 ? 'bg-pos' : 'bg-primary',
                          )}
                          style={{ width: `${progress * 100}%` }}
                        />
                      </div>
                      <span className="text-[11.5px] text-ink-soft tnum shrink-0">
                        {p.paidInstallments}/{p.totalInstallments}
                      </span>
                      <span className="text-[11.5px] text-ink-faint tnum shrink-0">
                        {brl(p.installmentAmount)}/mês
                        {remaining === 0 ? (
                          ' · quitada'
                        ) : (
                          <>
                            {' '}· falta {brl(remainingAmount(p))}
                            {payoff ? ` · quita em ${formatYmShort(payoff)}` : ''}
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {remaining > 0 && (
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={() => setPayDialog({ purchase: p })}
                        // Mesmo nome acessível do botão compacto em Bancos &
                        // Cartões: uma ação só, vista de dois lugares.
                        aria-label={`Registrar pagamento da ${p.paidInstallments + 1}ª parcela de ${p.name}`}
                        title={`Registrar pagamento da ${p.paidInstallments + 1}ª parcela`}
                      >
                        <Check size={12} /> Registrar pagamento da {p.paidInstallments + 1}ª
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={p.paidInstallments === 0}
                      onClick={() => undoInstallment(p)}
                      // Nome acessível específico: "desfazer" sozinho colidia com o
                      // "Desfazer pagamento" do toast que aparece no mesmo instante.
                      aria-label={`Desfazer última parcela paga de ${p.name}`}
                      title="Desfazer última parcela paga"
                    >
                      <Undo2 size={12} /> desfazer
                    </Button>
                    <button
                      type="button"
                      aria-label={`Editar compra ${p.name}`}
                      onClick={() => setDialog({ mode: 'edit', purchase: p })}
                      className="h-7 w-7 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 cursor-pointer transition-colors"
                    >
                      <Pencil size={12.5} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir compra ${p.name}`}
                      onClick={() => void removePurchase(p)}
                      className="h-7 w-7 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-neg hover:bg-neg-soft cursor-pointer transition-colors"
                    >
                      <Trash2 size={12.5} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <PurchaseDialog state={dialog} onClose={() => setDialog('closed')} />
      <PayInstallmentDialog
        state={payDialog}
        onClose={() => setPayDialog('closed')}
        onPayInvoice={setInvoiceCardId}
      />
      <PayInvoiceDialog
        open={invoiceCardId !== null}
        onClose={() => setInvoiceCardId(null)}
        {...(invoiceCardId === null ? {} : { cardId: invoiceCardId })}
      />
    </>
  )
}
