import { useMemo, type ReactNode } from 'react'
import { ArrowRight, CreditCard, Receipt } from 'lucide-react'
import { Modal } from '@/design/components/Modal'
import { Button } from '@/design/components/Button'
import { toast } from '@/design/components/toast'
import { useDataStore, useZentData } from '@/store/dataStore'
import { payInstallment, unpayInstallment } from '@/store/mutations'
import { availableLimit, isStandalone, remainingAmount, remainingInstallments } from '@/engine/cards'
import { useBRL } from '@/design/money'
import { BankLogo } from '@/features/banks/BankLogo'
import type { Purchase } from '@/data/schema'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * REGISTRAR PAGAMENTO DA Nª PARCELA (R10 §⑤) — um clique, sem digitar
 * ═══════════════════════════════════════════════════════════════════════
 *
 * O card da parcela abre esta confirmação JÁ PREENCHIDA: qual parcela, quanto,
 * quantas faltam depois e o limite que volta ao cartão. Não há campo de valor —
 * a parcela é o que é, e pedir para digitá-la só criaria a chance de digitar
 * errado.
 *
 * ── POR QUE NÃO HÁ "CONTA A DEBITAR" AQUI ───────────────────────────────
 * Numa compra de cartão a parcela **já está dentro da fatura**, que neste app é
 * um snapshot manual digitado pelo usuário (R3 §3.4). O dinheiro sai da conta no
 * **pagamento da fatura**; debitar também no marcar-parcela-como-paga contaria o
 * mesmo real duas vezes — o furo que a R4 fechou. Então, em vez de um seletor de
 * conta que mentiria, o diálogo diz onde o dinheiro sai de fato e oferece o
 * atalho para pagar a fatura (que aí sim escolhe a conta e debita).
 *
 * Numa parcela **avulsa** (empréstimo, crediário, boleto) não há fatura nem
 * conta vinculada no modelo — o registro é de controle do comprometido do mês.
 * Ligá-la a um débito real é evento novo + migração, e pertence à etapa de
 * suficiência de saldo, não a este milestone.
 */

export type PayInstallmentState = { purchase: Purchase } | 'closed'

export function PayInstallmentDialog({
  state,
  onClose,
  onPayInvoice,
}: {
  state: PayInstallmentState
  onClose(): void
  /** Atalho para o diálogo de pagar fatura (só faz sentido em compra de cartão). */
  onPayInvoice(cardId: string): void
}): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const brl = useBRL()

  const open = state !== 'closed'
  // A compra vem do store (não da cópia congelada no state) para que o diálogo
  // reflita uma edição feita em outra aba/janela entre abrir e confirmar.
  const purchase = useMemo(
    () => (state === 'closed' ? undefined : data.purchases.find((p) => p.id === state.purchase.id)),
    [state, data.purchases],
  )

  const card = purchase?.cardId == null ? undefined : data.cards.find((c) => c.id === purchase.cardId)
  const bank = card ? data.banks.find((b) => b.id === card.bankId) : undefined

  if (!open || purchase === undefined) {
    return <Modal open={false} onClose={onClose} title="Registrar pagamento">{null}</Modal>
  }

  const standalone = isStandalone(purchase)
  const nth = purchase.paidInstallments + 1
  const remainingBefore = remainingInstallments(purchase)
  const remainingAfter = remainingBefore - 1
  const owedAfter = remainingAmount(purchase) - purchase.installmentAmount

  // Limite antes → depois: derivação pura, sem simular mutação no store.
  // `availableLimit = limite − fatura − comprometido`, e o comprometido conta só
  // o que falta — então o "depois" é o "antes" mais uma parcela.
  const limitBefore = card ? availableLimit(card, data.purchases) : null
  const limitAfter = limitBefore === null ? null : limitBefore + purchase.installmentAmount

  function confirm(): void {
    if (purchase === undefined) return
    const p = purchase
    mutate((d) => payInstallment(d, p.id))
    const undo = (): void => {
      mutate((d) => unpayInstallment(d, p.id))
      toast.info('Pagamento desfeito', `A ${nth}ª parcela de "${p.name}" voltou a constar como em aberto.`)
    }
    if (remainingAfter === 0) {
      toast.success(`"${p.name}" quitada!`, 'O limite comprometido foi liberado por completo.', {
        label: 'Desfazer pagamento',
        onClick: undo,
      })
    } else {
      toast.success(
        `${nth}ª parcela de "${p.name}" paga`,
        standalone
          ? `Faltam ${remainingAfter} ${remainingAfter === 1 ? 'parcela' : 'parcelas'} · ${brl(owedAfter)}.`
          : `${brl(p.installmentAmount)} devolvidos ao limite · faltam ${remainingAfter} ${remainingAfter === 1 ? 'parcela' : 'parcelas'}.`,
        { label: 'Desfazer pagamento', onClick: undo },
      )
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Registrar pagamento da ${nth}ª`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirm}>Confirmar pagamento</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Identificação da compra */}
        <div className="flex items-center gap-3">
          {standalone ? (
            <span className="h-8.5 w-8.5 shrink-0 rounded-[9px] border border-line bg-surface-3 inline-flex items-center justify-center text-ink-faint">
              <Receipt size={15} />
            </span>
          ) : (
            bank && <BankLogo name={bank.name} color={bank.color} size={34} />
          )}
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink truncate">{purchase.name}</p>
            <p className="text-[11.5px] text-ink-faint truncate">
              {standalone ? (purchase.creditor ?? 'parcela avulsa') : `${bank?.name ?? ''} · ${card?.name ?? 'cartão removido'}`}
            </p>
          </div>
        </div>

        {/* Os números da confirmação — nenhum campo para digitar */}
        <dl className="rounded-[12px] border border-line bg-surface-2/40 divide-y divide-line">
          <Row label="Parcela">
            <span className="tnum">
              {nth}ª de {purchase.totalInstallments}
            </span>
          </Row>
          <Row label="Valor">
            <span className="tnum font-semibold text-ink">{brl(purchase.installmentAmount)}</span>
          </Row>
          <Row label="Depois de confirmar">
            {remainingAfter === 0 ? (
              <span className="text-pos font-semibold">quitada</span>
            ) : (
              <span className="tnum">
                faltam {remainingAfter} · {brl(owedAfter)}
              </span>
            )}
          </Row>
          {limitBefore !== null && limitAfter !== null && (
            <Row label={`Limite do ${card?.name ?? 'cartão'}`}>
              <span className="tnum inline-flex items-center gap-1.5">
                <span className="text-ink-faint">{brl(limitBefore)}</span>
                <ArrowRight size={12} className="text-ink-faint shrink-0" />
                <span className="text-pos font-semibold">{brl(limitAfter)}</span>
              </span>
            </Row>
          )}
        </dl>

        {/* De onde o dinheiro sai — dito com honestidade, sem seletor que mente */}
        {standalone ? (
          <p className="text-[12px] text-ink-soft leading-relaxed">
            Parcela avulsa: o Zent registra o andamento e o comprometido do mês. O débito na conta
            ainda não é modelado para avulsas — lance o pagamento como gasto se quiser vê-lo no
            saldo.
          </p>
        ) : (
          <div className="rounded-[10px] border border-line bg-surface-2/40 px-3 py-2.5">
            <p className="text-[12px] text-ink-soft leading-relaxed flex items-start gap-2">
              <CreditCard size={13} className="mt-0.5 shrink-0 text-ink-faint" />
              <span>
                Esta parcela já está na fatura do {card?.name ?? 'cartão'} — o dinheiro sai da conta
                quando você paga a fatura. Marcar como paga aqui devolve o valor ao limite.
              </span>
            </p>
            {card && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-1.5 -ml-1.5"
                onClick={() => {
                  onClose()
                  onPayInvoice(card.id)
                }}
              >
                Pagar fatura do {card.name}
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

/**
 * Linha rótulo→valor que NÃO transborda em nenhuma magnitude (DECISOES).
 *
 * A defesa aqui é `flex-wrap`, não largura fixa: quando o valor não cabe ao
 * lado do rótulo — o caso do "limite antes → depois", que carrega DOIS valores
 * numa modal de 380px —, ele desce para a própria linha em vez de ser cortado.
 * O valor em si nunca quebra no meio (`whitespace-nowrap`), que é a outra
 * metade da regra: número não se parte.
 */
function Row({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-[13px]">
      <dt className="text-ink-soft shrink-0">{label}</dt>
      <dd className="text-ink text-right ml-auto whitespace-nowrap">{children}</dd>
    </div>
  )
}
