import { useMemo, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  CreditCard,
  Landmark,
  Minus,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Wallet,
} from 'lucide-react'
import { PageHeader } from '@/features/common/PageHeader'
import { Card as Panel } from '@/design/components/Card'
import { StatCard } from '@/design/components/StatCard'
import { AnimatedMoney } from '@/design/AnimatedMoney'
import { SummaryBalloon } from '@/design/components/SummaryBalloon'
import { Button } from '@/design/components/Button'
import { MoneyInput } from '@/design/components/Input'
import { EmptyState } from '@/design/components/EmptyState'
import { toast } from '@/design/components/toast'
import { confirmDialog } from '@/design/components/confirm'
import { useDataStore, useZentData } from '@/store/dataStore'
import { availableLimit, monthlyCommitment, payoffYm, remainingAmount, remainingInstallments } from '@/engine/cards'
import { formatBRL } from '@/engine/money'
import { formatYmShort } from '@/engine/dates'
import { cn } from '@/lib/cn'
import type { Bank, Card, Purchase } from '@/data/schema'
import { BankLogo } from './BankLogo'
import {
  BankDialog,
  CardDialog,
  PurchaseDialog,
  type BankDialogState,
  type CardDialogState,
  type PurchaseDialogState,
} from './dialogs'

/** Valor monetário editável inline (clique no lápis, Enter salva). */
function InlineMoney({
  value,
  onSave,
  allowNegative = false,
  label,
  className,
}: {
  value: number
  onSave(v: number): void
  allowNegative?: boolean
  label: string
  className?: string
}): ReactNode {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<number | null>(value)

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="w-36">
          <MoneyInput
            value={draft}
            onChange={setDraft}
            allowNegative={allowNegative}
            autoFocus
            aria-label={label}
            className="h-8 text-[13px]"
          />
        </span>
        <Button
          size="sm"
          onClick={() => {
            if (draft !== null) onSave(draft)
            setEditing(false)
          }}
          disabled={draft === null}
        >
          OK
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
      </span>
    )
  }

  return (
    <button
      type="button"
      title={`Editar ${label.toLowerCase()}`}
      aria-label={`Editar ${label.toLowerCase()}`}
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      className={cn(
        'group/inline inline-flex items-center gap-1.5 cursor-pointer rounded-[6px] px-1 -mx-1 hover:bg-surface-2 transition-colors',
        className,
      )}
    >
      <span className="tnum">{formatBRL(value)}</span>
      <Pencil
        size={11.5}
        className="text-ink-faint opacity-0 group-hover/inline:opacity-100 transition-opacity"
      />
    </button>
  )
}

export function BanksPage(): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)

  const [bankDialog, setBankDialog] = useState<BankDialogState>('closed')
  const [cardDialog, setCardDialog] = useState<CardDialogState>('closed')
  const [purchaseDialog, setPurchaseDialog] = useState<PurchaseDialogState>('closed')

  const totals = useMemo(() => {
    const inAccounts = data.banks.reduce((a, b) => a + b.balance, 0)
    const invoices = data.cards.reduce((a, c) => a + c.invoice, 0)
    const monthly = data.cards.reduce((a, c) => a + monthlyCommitment(c.id, data.purchases), 0)
    return { inAccounts, invoices, monthly }
  }, [data.banks, data.cards, data.purchases])

  async function removeBank(bank: Bank): Promise<void> {
    const hasInvestments = data.investments.some((i) => i.bankId === bank.id)
    if (hasInvestments) {
      toast.warning(
        'Este banco tem aplicações',
        'Exclua ou mova as aplicações da Carteira antes de excluir o banco.',
      )
      return
    }
    const cardCount = data.cards.filter((c) => c.bankId === bank.id).length
    const ok = await confirmDialog({
      title: `Excluir ${bank.name}`,
      message:
        cardCount > 0
          ? `O banco tem ${cardCount} ${cardCount === 1 ? 'cartão' : 'cartões'} com parcelas, que serão excluídos junto. Essa ação não pode ser desfeita.`
          : 'Essa ação não pode ser desfeita.',
      confirmLabel: 'Excluir banco',
      danger: true,
    })
    if (!ok) return
    mutate((d) => {
      const cardIds = new Set(d.cards.filter((c) => c.bankId === bank.id).map((c) => c.id))
      d.banks = d.banks.filter((b) => b.id !== bank.id)
      d.cards = d.cards.filter((c) => c.bankId !== bank.id)
      d.purchases = d.purchases.filter((p) => !cardIds.has(p.cardId))
    })
    toast.success(`${bank.name} excluído`)
  }

  return (
    <>
      <PageHeader
        title="Bancos & Cartões"
        subtitle="Hub central de contas e crédito"
        actions={
          <Button onClick={() => setBankDialog('new')}>
            <Plus size={15} /> Novo banco
          </Button>
        }
      />

      {/* Totais (padrão StatCard) */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <StatCard
          icon={Landmark}
          value={<AnimatedMoney cents={totals.inAccounts} />}
          label="Total em conta"
          tone={totals.inAccounts < 0 ? 'neg' : 'default'}
        />
        <StatCard icon={Receipt} value={<AnimatedMoney cents={totals.invoices} />} label="Faturas abertas" />
        <StatCard icon={CreditCard} value={<AnimatedMoney cents={totals.monthly} />} label="Parcelas por mês" />
      </div>

      {/* Balão de resumo inteligente (§3) */}
      <SummaryBalloon
        title="Resumo de crédito e contas"
        className="mb-4"
        segments={[
          'Você tem ',
          { value: formatBRL(totals.inAccounts), tone: totals.inAccounts >= 0 ? 'pos' : 'neg' },
          ` em conta entre ${data.banks.length} ${data.banks.length === 1 ? 'banco' : 'bancos'}, `,
          { value: formatBRL(totals.invoices), tone: totals.invoices > 0 ? 'neg' : 'ink' },
          ' de faturas abertas e ',
          { value: `${formatBRL(totals.monthly)}/mês`, tone: totals.monthly > 0 ? 'warn' : 'ink', goTo: 'installments' },
          ' comprometidos em parcelas.',
        ]}
      />

      {/* Bancos */}
      {data.banks.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Landmark}
            title="Nenhum banco cadastrado"
            description="Adicione seus bancos para acompanhar saldos, cartões e parcelas em um só lugar."
            action={
              <Button variant="soft" size="sm" onClick={() => setBankDialog('new')}>
                <Plus size={14} /> Adicionar banco
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {data.banks.map((bank) => (
            <BankBlock
              key={bank.id}
              bank={bank}
              cards={data.cards.filter((c) => c.bankId === bank.id)}
              purchases={data.purchases}
              onEdit={() => setBankDialog(bank)}
              onRemove={() => void removeBank(bank)}
              onNewCard={() => setCardDialog({ mode: 'new', bankId: bank.id })}
              onEditCard={(card) => setCardDialog({ mode: 'edit', card })}
              onNewPurchase={(cardId) => setPurchaseDialog({ mode: 'new', cardId })}
              onEditPurchase={(purchase) => setPurchaseDialog({ mode: 'edit', purchase })}
            />
          ))}
        </div>
      )}

      <BankDialog state={bankDialog} onClose={() => setBankDialog('closed')} />
      <CardDialog state={cardDialog} onClose={() => setCardDialog('closed')} />
      <PurchaseDialog state={purchaseDialog} onClose={() => setPurchaseDialog('closed')} />
    </>
  )
}

function BankBlock({
  bank,
  cards,
  purchases,
  onEdit,
  onRemove,
  onNewCard,
  onEditCard,
  onNewPurchase,
  onEditPurchase,
}: {
  bank: Bank
  cards: Card[]
  purchases: Purchase[]
  onEdit(): void
  onRemove(): void
  onNewCard(): void
  onEditCard(card: Card): void
  onNewPurchase(cardId: string): void
  onEditPurchase(purchase: Purchase): void
}): ReactNode {
  const mutate = useDataStore((s) => s.mutate)

  return (
    <Panel className="overflow-hidden">
      {/* Cabeçalho do banco */}
      <div
        className="flex items-center gap-3.5 px-5 py-4"
        style={{ boxShadow: `inset 3px 0 0 ${bank.color}` }}
      >
        <BankLogo name={bank.name} color={bank.color} size={40} />
        <div className="min-w-0">
          <p className="font-display text-[15px] font-semibold text-ink truncate">{bank.name}</p>
          <div className="text-[13px] text-ink-soft flex items-center gap-1">
            Saldo em conta:{' '}
            <InlineMoney
              value={bank.balance}
              allowNegative
              label={`Saldo do ${bank.name}`}
              onSave={(v) => {
                mutate((d) => {
                  const b = d.banks.find((x) => x.id === bank.id)
                  if (b) b.balance = v
                })
                toast.success('Saldo atualizado', `${bank.name}: ${formatBRL(v)}`)
              }}
              className={cn('font-semibold', bank.balance < 0 ? 'text-neg' : 'text-ink')}
            />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={onNewCard}>
            <Plus size={13.5} /> Cartão
          </Button>
          <button
            type="button"
            aria-label={`Editar banco ${bank.name}`}
            onClick={onEdit}
            className="h-8 w-8 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 cursor-pointer transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            aria-label={`Excluir banco ${bank.name}`}
            onClick={onRemove}
            className="h-8 w-8 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-neg hover:bg-neg-soft cursor-pointer transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Cartões */}
      {cards.length > 0 && (
        <div className="px-5 pb-5 flex flex-col gap-3">
          {cards.map((card) => (
            <CardBlock
              key={card.id}
              card={card}
              accent={bank.color}
              purchases={purchases.filter((p) => p.cardId === card.id)}
              onEdit={() => onEditCard(card)}
              onNewPurchase={() => onNewPurchase(card.id)}
              onEditPurchase={onEditPurchase}
            />
          ))}
        </div>
      )}
    </Panel>
  )
}

function CardBlock({
  card,
  accent,
  purchases,
  onEdit,
  onNewPurchase,
  onEditPurchase,
}: {
  card: Card
  accent: string
  purchases: Purchase[]
  onEdit(): void
  onNewPurchase(): void
  onEditPurchase(purchase: Purchase): void
}): ReactNode {
  const mutate = useDataStore((s) => s.mutate)
  const [expanded, setExpanded] = useState(true)

  const available = availableLimit(card, purchases)
  const committed = purchases.reduce((a, p) => a + remainingAmount(p), 0)
  const usedRatio = card.limit > 0 ? Math.min(1, Math.max(0, (card.limit - available) / card.limit)) : 0
  const active = purchases.filter((p) => remainingInstallments(p) > 0)
  const done = purchases.filter((p) => remainingInstallments(p) === 0)

  async function removeCard(): Promise<void> {
    const ok = await confirmDialog({
      title: `Excluir cartão ${card.name}`,
      message:
        purchases.length > 0
          ? `As ${purchases.length} compras parceladas deste cartão serão excluídas junto. Essa ação não pode ser desfeita.`
          : 'Essa ação não pode ser desfeita.',
      confirmLabel: 'Excluir cartão',
      danger: true,
    })
    if (!ok) return
    mutate((d) => {
      d.cards = d.cards.filter((c) => c.id !== card.id)
      d.purchases = d.purchases.filter((p) => p.cardId !== card.id)
    })
    toast.success(`Cartão ${card.name} excluído`)
  }

  async function removePurchase(p: Purchase): Promise<void> {
    const ok = await confirmDialog({
      title: 'Excluir compra parcelada',
      message: `Excluir "${p.name}"? O valor comprometido volta para o limite disponível.`,
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    mutate((d) => {
      d.purchases = d.purchases.filter((x) => x.id !== p.id)
    })
    toast.success('Compra excluída')
  }

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

  return (
    <div className="rounded-[14px] border border-line bg-surface-2/50 overflow-hidden">
      {/* Cabeçalho do cartão */}
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className="h-8 w-11 rounded-[6px] shrink-0 border border-white/10"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accent}99)`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
            }}
            aria-hidden="true"
          />
          <p className="font-display text-[14px] font-semibold text-ink truncate">{card.name}</p>
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={onNewPurchase}>
              <Plus size={13} /> Compra parcelada
            </Button>
            <button
              type="button"
              aria-label={`Editar cartão ${card.name}`}
              onClick={onEdit}
              className="h-7.5 w-7.5 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-3 cursor-pointer transition-colors"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              aria-label={`Excluir cartão ${card.name}`}
              onClick={() => void removeCard()}
              className="h-7.5 w-7.5 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-neg hover:bg-neg-soft cursor-pointer transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-3">
          <div>
            <p className="text-[11.5px] text-ink-faint">Limite total</p>
            <p className="text-[13.5px] font-semibold text-ink tnum">{formatBRL(card.limit)}</p>
          </div>
          <div>
            <p className="text-[11.5px] text-ink-faint">Fatura atual</p>
            <InlineMoney
              value={card.invoice}
              label={`Fatura do ${card.name}`}
              onSave={(v) => {
                mutate((d) => {
                  const c = d.cards.find((x) => x.id === card.id)
                  if (c) c.invoice = v
                })
                toast.success('Fatura atualizada', formatBRL(v))
              }}
              className="text-[13.5px] font-semibold text-ink"
            />
          </div>
          <div>
            <p className="text-[11.5px] text-ink-faint">Comprometido em parcelas</p>
            <p className="text-[13.5px] font-semibold text-warn tnum">{formatBRL(committed)}</p>
          </div>
          <div>
            <p className="text-[11.5px] text-ink-faint">Disponível</p>
            <p
              className={cn(
                'text-[13.5px] font-bold tnum',
                available < 0 ? 'text-neg' : 'text-pos',
              )}
            >
              {formatBRL(available)}
            </p>
          </div>
        </div>

        {/* Barra de uso do limite */}
        <div
          className="h-2 rounded-full bg-surface-3 overflow-hidden mt-3"
          role="img"
          aria-label={`${Math.round(usedRatio * 100)}% do limite comprometido`}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300',
              usedRatio < 0.85 ? 'bg-primary' : usedRatio < 1 ? 'bg-warn' : 'bg-neg',
            )}
            style={{ width: `${usedRatio * 100}%` }}
          />
        </div>
      </div>

      {/* Parcelas */}
      {purchases.length > 0 && (
        <div className="border-t border-line">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="w-full flex items-center gap-2 px-4 h-9 text-[12.5px] font-medium text-ink-soft hover:text-ink hover:bg-surface-2 cursor-pointer transition-colors"
          >
            <ChevronDown
              size={14}
              className={cn('transition-transform duration-200', !expanded && '-rotate-90')}
            />
            {active.length} {active.length === 1 ? 'compra ativa' : 'compras ativas'}
            {done.length > 0 ? ` · ${done.length} quitada${done.length > 1 ? 's' : ''}` : ''}
          </button>

          {expanded && (
            <ul className="px-4 pb-3.5 flex flex-col gap-2.5">
              {[...active, ...done].map((p) => {
                const remaining = remainingInstallments(p)
                const progress = p.paidInstallments / p.totalInstallments
                const payoff = payoffYm(p)
                return (
                  <li
                    key={p.id}
                    className={cn(
                      'rounded-[10px] border border-line bg-surface px-3.5 py-2.5',
                      remaining === 0 && 'opacity-55',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className="text-[13px] font-medium text-ink truncate">{p.name}</p>
                          <span className="text-[11.5px] text-ink-faint tnum shrink-0">
                            {formatBRL(p.installmentAmount)}/mês
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 mt-1.5">
                          <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden flex-1 max-w-[180px]">
                            <div
                              className="h-full rounded-full bg-primary transition-[width] duration-300"
                              style={{ width: `${progress * 100}%` }}
                            />
                          </div>
                          <span className="text-[11.5px] text-ink-soft tnum shrink-0">
                            {p.paidInstallments}/{p.totalInstallments}
                          </span>
                          <span className="text-[11.5px] text-ink-faint tnum shrink-0">
                            {remaining === 0 ? (
                              'quitada'
                            ) : (
                              <>
                                falta {formatBRL(remainingAmount(p))}
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
                          onClick={() => onEditPurchase(p)}
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
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {purchases.length === 0 && (
        <div className="border-t border-line px-4 py-2.5 flex items-center gap-2 text-[12px] text-ink-faint">
          <Wallet size={13} />
          Sem compras parceladas — adicione uma para o limite refletir o compromisso.
        </div>
      )}
    </div>
  )
}
