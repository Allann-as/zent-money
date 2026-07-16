import { useMemo, useState, type ReactNode } from 'react'
import { CalendarCheck, CalendarClock, Layers, Minus, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { PageHeader } from '@/features/common/PageHeader'
import { Card, CardTitle } from '@/design/components/Card'
import { Button } from '@/design/components/Button'
import { Select } from '@/design/components/Select'
import { Segmented } from '@/design/components/Segmented'
import { StatCard } from '@/design/components/StatCard'
import { SummaryBalloon, type BalloonSegment } from '@/design/components/SummaryBalloon'
import { EmptyState } from '@/design/components/EmptyState'
import { toast } from '@/design/components/toast'
import { confirmDialog } from '@/design/components/confirm'
import { useDataStore, useZentData } from '@/store/dataStore'
import {
  monthlyCommitment,
  payoffYm,
  remainingAmount,
  remainingInstallments,
} from '@/engine/cards'
import { formatBRL } from '@/engine/money'
import { formatYmShort, ymCompare } from '@/engine/dates'
import { cn } from '@/lib/cn'
import type { Purchase } from '@/data/schema'
import { BankLogo } from '@/features/banks/BankLogo'
import { PurchaseDialog, type PurchaseDialogState } from '@/features/banks/dialogs'

type StatusFilter = 'active' | 'done' | 'all'

/**
 * Parcelas — visão consolidada (§5.5): agrega TODAS as compras parceladas
 * de todos os cartões. Mesma fonte de verdade de Bancos & Cartões
 * (data.purchases) — duas visões, um dado.
 */
export function InstallmentsPage(): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)

  const [bankFilter, setBankFilter] = useState('all')
  const [cardFilter, setCardFilter] = useState('all')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [dialog, setDialog] = useState<PurchaseDialogState>('closed')

  const banksById = useMemo(() => new Map(data.banks.map((b) => [b.id, b])), [data.banks])
  const cardsById = useMemo(() => new Map(data.cards.map((c) => [c.id, c])), [data.cards])

  const stats = useMemo(() => {
    const active = data.purchases.filter((p) => remainingInstallments(p) > 0)
    const monthly = data.cards.reduce((a, c) => a + monthlyCommitment(c.id, data.purchases), 0)
    const remaining = active.reduce((a, p) => a + remainingAmount(p), 0)
    let next: { purchase: Purchase; ym: string } | null = null
    for (const p of active) {
      const ym = payoffYm(p)
      if (ym && (next === null || ymCompare(ym, next.ym) < 0)) next = { purchase: p, ym }
    }
    return { active, monthly, remaining, next }
  }, [data.purchases, data.cards])

  const filtered = useMemo(() => {
    return data.purchases
      .filter((p) => {
        const card = cardsById.get(p.cardId)
        if (cardFilter !== 'all' && p.cardId !== cardFilter) return false
        if (bankFilter !== 'all' && card?.bankId !== bankFilter) return false
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
      { value: `${formatBRL(stats.monthly)}/mês`, tone: 'warn' },
      ' do seu crédito; ainda faltam ',
      { value: formatBRL(stats.remaining), tone: 'neg' },
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
  }, [stats])

  function payInstallment(p: Purchase, delta: 1 | -1): void {
    mutate((d) => {
      const x = d.purchases.find((y) => y.id === p.id)
      if (!x) return
      x.paidInstallments = Math.min(x.totalInstallments, Math.max(0, x.paidInstallments + delta))
    })
    if (delta === 1) {
      const nowRemaining = remainingInstallments(p) - 1
      if (nowRemaining === 0) {
        toast.success(`"${p.name}" quitada!`, 'O limite comprometido foi liberado por completo.')
      } else {
        toast.success(
          `Parcela de "${p.name}" paga`,
          `${formatBRL(p.installmentAmount)} devolvidos ao limite disponível.`,
        )
      }
    }
  }

  async function removePurchase(p: Purchase): Promise<void> {
    const ok = await confirmDialog({
      title: 'Excluir compra parcelada',
      message: `Excluir "${p.name}"? O valor comprometido volta para o limite disponível do cartão.`,
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    mutate((d) => {
      d.purchases = d.purchases.filter((x) => x.id !== p.id)
    })
    toast.success('Compra excluída')
  }

  const firstCardId = data.cards[0]?.id

  return (
    <>
      <PageHeader
        title="Parcelas"
        subtitle="Todas as compras parceladas, de todos os cartões"
        actions={
          firstCardId ? (
            <Button onClick={() => setDialog({ mode: 'new', cardId: cardFilter !== 'all' ? cardFilter : firstCardId })}>
              <Plus size={15} /> Nova compra parcelada
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-4">
        <StatCard icon={CalendarClock} value={formatBRL(stats.monthly)} label="Comprometido por mês" />
        <StatCard icon={Wallet} value={formatBRL(stats.remaining)} label="Falta pagar no total" tone={stats.remaining > 0 ? 'neg' : 'default'} />
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
            </Select>
            <Select
              value={cardFilter}
              onChange={(e) => setCardFilter(e.target.value)}
              className="h-8.5 w-36 text-[13px]"
              aria-label="Filtrar por cartão"
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
            title={
              data.purchases.length === 0
                ? 'Nenhuma compra parcelada'
                : 'Nada com esses filtros'
            }
            description={
              data.purchases.length === 0
                ? 'Cadastre compras parceladas nos cartões — elas aparecem aqui consolidadas e reduzem o limite disponível automaticamente.'
                : 'Ajuste os filtros de banco, cartão ou status para ver outras compras.'
            }
          />
        ) : (
          <ul className="px-3 pb-3 flex flex-col gap-2">
            {filtered.map((p) => {
              const card = cardsById.get(p.cardId)
              const bank = card ? banksById.get(card.bankId) : undefined
              const remaining = remainingInstallments(p)
              const progress = p.paidInstallments / p.totalInstallments
              const payoff = payoffYm(p)
              return (
                <li
                  key={p.id}
                  className={cn(
                    'rounded-[12px] border border-line bg-surface-2/40 px-4 py-3 flex items-center gap-3.5',
                    remaining === 0 && 'opacity-55',
                  )}
                >
                  {bank && <BankLogo name={bank.name} color={bank.color} size={34} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-[13.5px] font-semibold text-ink truncate">{p.name}</p>
                      <span className="text-[11.5px] text-ink-faint truncate">
                        {bank?.name} · {card?.name ?? 'cartão removido'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 mt-1.5">
                      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden flex-1 max-w-[220px]">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-300"
                          style={{ width: `${progress * 100}%` }}
                        />
                      </div>
                      <span className="text-[11.5px] text-ink-soft tnum shrink-0">
                        {p.paidInstallments}/{p.totalInstallments}
                      </span>
                      <span className="text-[11.5px] text-ink-faint tnum shrink-0">
                        {formatBRL(p.installmentAmount)}/mês
                        {remaining === 0 ? (
                          ' · quitada'
                        ) : (
                          <>
                            {' '}· falta {formatBRL(remainingAmount(p))}
                            {payoff ? ` · quita em ${formatYmShort(payoff)}` : ''}
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="soft"
                      disabled={remaining === 0}
                      onClick={() => payInstallment(p, 1)}
                      title="Marcar uma parcela como paga"
                    >
                      <Plus size={12} /> 1 paga
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={p.paidInstallments === 0}
                      onClick={() => payInstallment(p, -1)}
                      title="Desfazer última parcela paga"
                    >
                      <Minus size={12} /> desfazer
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
    </>
  )
}
