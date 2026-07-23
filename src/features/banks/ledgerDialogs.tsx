import { useMemo, useState, type ReactNode } from 'react'
import { Modal } from '@/design/components/Modal'
import { Button } from '@/design/components/Button'
import { Field, MoneyInput } from '@/design/components/Input'
import { DateField } from '@/design/components/DateField'
import { Select } from '@/design/components/Select'
import { toast } from '@/design/components/toast'
import { useZentData } from '@/store/dataStore'
import { createTransfer, payInvoice } from '@/store/ledgerActions'
import { bankBalances } from '@/engine/ledger'
import { useBRL } from '@/design/money'
import { todayIso } from '@/engine/dates'

/**
 * Transferência entre contas (R4 §1.4): um registro só, que aparece no
 * histórico das duas pontas (saída numa, entrada na outra).
 */
export function TransferDialog({
  open,
  onClose,
  defaultFromBankId,
}: {
  open: boolean
  onClose(): void
  defaultFromBankId?: string
}): ReactNode {
  const data = useZentData()
  const balances = useMemo(() => bankBalances(data), [data])
  const brl = useBRL()

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [date, setDate] = useState(todayIso())
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const target = open ? (defaultFromBankId ?? 'any') : 'closed'
  if (openedFor !== target) {
    setOpenedFor(target)
    if (open) {
      const first = defaultFromBankId ?? data.banks[0]?.id ?? ''
      setFrom(first)
      setTo(data.banks.find((b) => b.id !== first)?.id ?? '')
      setAmount(null)
      setDate(todayIso())
    }
  }

  const fromBank = data.banks.find((b) => b.id === from)
  const toBank = data.banks.find((b) => b.id === to)
  const valid = from !== '' && to !== '' && from !== to && amount !== null && amount > 0 && date !== ''
  const fromBalance = balances.get(from) ?? 0

  function save(): void {
    if (!valid || amount === null) return
    createTransfer(from, to, amount, date)
    toast.success(
      'Transferência registrada',
      `${brl(amount)} de ${fromBank?.name ?? '—'} para ${toBank?.name ?? '—'}.`,
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transferir entre contas"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={save}>
            Transferir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <Field label="De" hint={`Saldo: ${brl(fromBalance)}`}>
            <Select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Conta de origem">
              {data.banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Para">
            <Select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Conta de destino">
              {data.banks
                .filter((b) => b.id !== from)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Valor">
            <MoneyInput value={amount} onChange={setAmount} autoFocus aria-label="Valor da transferência" />
          </Field>
          <Field label="Data">
            <DateField value={date} onChange={setDate} />
          </Field>
        </div>
        {valid && amount !== null && (
          <p className="text-[12.5px] text-ink-soft bg-surface-2 border border-line rounded-[10px] px-3 py-2.5 tnum">
            {fromBank?.name} fica com <strong className="text-ink">{brl(fromBalance - amount)}</strong>{' '}
            e {toBank?.name} com{' '}
            <strong className="text-ink">{brl((balances.get(to) ?? 0) + amount)}</strong>.
          </p>
        )}
      </div>
    </Modal>
  )
}

/**
 * Pagamento de fatura (R4 §1.7) — o elo que faz o dinheiro do cartão sair da
 * conta. Gasto com origem-cartão nunca debita conta nenhuma: ele vira fatura, e
 * é aqui que a fatura vira saída de dinheiro. Assim cada real sai uma vez só.
 */
export function PayInvoiceDialog({
  open,
  onClose,
  bankId,
  cardId: presetCardId,
}: {
  open: boolean
  onClose(): void
  /** Banco cujos cartões são oferecidos; ausente = todos os cartões. */
  bankId?: string
  /** Cartão já escolhido ao abrir (ex.: vindo do card de uma parcela dele). */
  cardId?: string
}): ReactNode {
  const data = useZentData()
  const balances = useMemo(() => bankBalances(data), [data])
  const cards = useMemo(
    () => (bankId === undefined ? data.cards : data.cards.filter((c) => c.bankId === bankId)),
    [data.cards, bankId],
  )
  const brl = useBRL()

  const [cardId, setCardId] = useState('')
  const [payFrom, setPayFrom] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [date, setDate] = useState(todayIso())
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const target = open ? `${bankId ?? 'any'}/${presetCardId ?? ''}` : 'closed'
  if (openedFor !== target) {
    setOpenedFor(target)
    if (open) {
      // Um cartão pedido explicitamente ganha do primeiro da lista — quem abre a
      // fatura a partir de uma parcela do Nubank não quer o cartão do Itaú.
      const first = cards.find((c) => c.id === presetCardId) ?? cards[0]
      setCardId(first?.id ?? '')
      // Por padrão paga pela conta do próprio banco do cartão — o caso comum.
      setPayFrom(first?.bankId ?? data.banks[0]?.id ?? '')
      setAmount(first?.invoice ?? null)
      setDate(todayIso())
    }
  }

  const card = cards.find((c) => c.id === cardId)
  const valid = cardId !== '' && payFrom !== '' && amount !== null && amount > 0 && date !== ''
  const overpaying = card !== undefined && amount !== null && amount > card.invoice

  function save(): void {
    if (!valid || amount === null || !card) return
    payInvoice(cardId, payFrom, amount, date)
    toast.success(
      'Fatura paga',
      `${brl(amount)} saíram de ${data.banks.find((b) => b.id === payFrom)?.name ?? 'sua conta'} e a fatura do ${card.name} foi abatida.`,
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pagar fatura"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={save}>
            Pagar
          </Button>
        </>
      }
    >
      {cards.length === 0 ? (
        <p className="text-[13px] text-ink-soft">
          Nenhum cartão cadastrado neste banco. Adicione um cartão para registrar o pagamento da fatura.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <Field label="Cartão" hint={`Fatura: ${brl(card?.invoice ?? 0)}`}>
              <Select
                value={cardId}
                onChange={(e) => {
                  const next = cards.find((c) => c.id === e.target.value)
                  setCardId(e.target.value)
                  setAmount(next?.invoice ?? null)
                }}
                aria-label="Cartão da fatura"
              >
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Pagar com" hint={`Saldo: ${brl(balances.get(payFrom) ?? 0)}`}>
              <Select value={payFrom} onChange={(e) => setPayFrom(e.target.value)} aria-label="Conta que paga a fatura">
                {data.banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Valor" hint="Pagamento parcial é permitido">
              <MoneyInput value={amount} onChange={setAmount} aria-label="Valor do pagamento" />
            </Field>
            <Field label="Data">
              <DateField value={date} onChange={setDate} />
            </Field>
          </div>
          {overpaying && card && (
            <p className="text-[12.5px] text-warn bg-warn-soft border border-warn/25 rounded-[10px] px-3 py-2.5">
              O valor é maior que a fatura de {brl(card.invoice)}. A conta será debitada no valor
              cheio e a fatura ficará zerada — o excedente não vira crédito no cartão.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
