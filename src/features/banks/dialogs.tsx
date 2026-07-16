import { useState, type ReactNode } from 'react'
import { Modal } from '@/design/components/Modal'
import { Button } from '@/design/components/Button'
import { Field, Input, MoneyInput } from '@/design/components/Input'
import { Select } from '@/design/components/Select'
import { ColorPicker } from '@/design/components/ColorPicker'
import { toast } from '@/design/components/toast'
import { useDataStore, useZentData } from '@/store/dataStore'
import { currentYm, formatYmLong, addMonths } from '@/engine/dates'
import { newId } from '@/lib/id'
import type { Bank, Card, Purchase } from '@/data/schema'

// ── Banco ────────────────────────────────────────────────────────────────────

export type BankDialogState = 'closed' | 'new' | Bank

export function BankDialog({
  state,
  onClose,
}: {
  state: BankDialogState
  onClose(): void
}): ReactNode {
  const mutate = useDataStore((s) => s.mutate)
  const editing = state !== 'closed' && state !== 'new' ? state : null
  const open = state !== 'closed'

  const [name, setName] = useState('')
  const [color, setColor] = useState('#5b8fc0')
  const [balance, setBalance] = useState<number | null>(0)
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const target: string = editing?.id ?? (typeof state === 'string' ? state : 'closed')
  if (open && openedFor !== target) {
    setOpenedFor(target)
    setName(editing?.name ?? '')
    setColor(editing?.color ?? '#5b8fc0')
    setBalance(editing?.balance ?? 0)
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const valid = name.trim() !== ''

  function save(): void {
    if (!valid) return
    const clean = name.trim()
    mutate((d) => {
      if (editing) {
        const b = d.banks.find((x) => x.id === editing.id)
        if (b) {
          b.name = clean
          b.color = color
          b.balance = balance ?? 0
        }
      } else {
        d.banks.push({ id: newId(), name: clean, color, balance: balance ?? 0 })
      }
    })
    toast.success(editing ? 'Banco atualizado' : `Banco "${clean}" adicionado`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar banco' : 'Novo banco'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={save}>
            {editing ? 'Salvar' : 'Adicionar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Nubank"
            autoFocus
            maxLength={32}
          />
        </Field>
        <Field label="Cor da marca">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field label="Saldo em conta">
          <MoneyInput value={balance} onChange={setBalance} allowNegative aria-label="Saldo em conta" />
        </Field>
      </div>
    </Modal>
  )
}

// ── Cartão ───────────────────────────────────────────────────────────────────

export type CardDialogState = 'closed' | { mode: 'new'; bankId: string } | { mode: 'edit'; card: Card }

export function CardDialog({
  state,
  onClose,
}: {
  state: CardDialogState
  onClose(): void
}): ReactNode {
  const mutate = useDataStore((s) => s.mutate)
  const open = state !== 'closed'
  const editing = open && state.mode === 'edit' ? state.card : null

  const [name, setName] = useState('')
  const [limit, setLimit] = useState<number | null>(null)
  const [invoice, setInvoice] = useState<number | null>(0)
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const target = !open ? 'closed' : editing ? `edit-${editing.id}` : `new-${state.mode === 'new' ? state.bankId : ''}`
  if (open && openedFor !== target) {
    setOpenedFor(target)
    setName(editing?.name ?? '')
    setLimit(editing?.limit ?? null)
    setInvoice(editing?.invoice ?? 0)
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const valid = name.trim() !== '' && limit !== null && limit > 0

  function save(): void {
    if (!open || !valid || limit === null) return
    const clean = name.trim()
    mutate((d) => {
      if (editing) {
        const c = d.cards.find((x) => x.id === editing.id)
        if (c) {
          c.name = clean
          c.limit = limit
          c.invoice = invoice ?? 0
        }
      } else if (state.mode === 'new') {
        d.cards.push({ id: newId(), bankId: state.bankId, name: clean, limit, invoice: invoice ?? 0 })
      }
    })
    toast.success(editing ? 'Cartão atualizado' : `Cartão "${clean}" adicionado`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar cartão' : 'Novo cartão'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={save}>
            {editing ? 'Salvar' : 'Adicionar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome do cartão">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Ultravioleta"
            autoFocus
            maxLength={32}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Limite total">
            <MoneyInput value={limit} onChange={setLimit} aria-label="Limite total do cartão" />
          </Field>
          <Field label="Fatura atual">
            <MoneyInput value={invoice} onChange={setInvoice} aria-label="Fatura atual" />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

// ── Compra parcelada ─────────────────────────────────────────────────────────

export type PurchaseDialogState =
  | 'closed'
  | { mode: 'new'; cardId: string }
  | { mode: 'edit'; purchase: Purchase }

export function PurchaseDialog({
  state,
  onClose,
}: {
  state: PurchaseDialogState
  onClose(): void
}): ReactNode {
  const mutate = useDataStore((s) => s.mutate)
  const allCards = useZentData().cards
  const open = state !== 'closed'
  const editing = open && state.mode === 'edit' ? state.purchase : null

  const [name, setName] = useState('')
  const [cardId, setCardId] = useState('')
  const [installment, setInstallment] = useState<number | null>(null)
  const [total, setTotal] = useState('12')
  const [paid, setPaid] = useState('0')
  const [startYm, setStartYm] = useState(currentYm())
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const target = !open ? 'closed' : editing ? `edit-${editing.id}` : `new-${state.mode === 'new' ? state.cardId : ''}`
  if (open && openedFor !== target) {
    setOpenedFor(target)
    setName(editing?.name ?? '')
    setCardId(editing?.cardId ?? (state.mode === 'new' ? state.cardId : ''))
    setInstallment(editing?.installmentAmount ?? null)
    setTotal(String(editing?.totalInstallments ?? 12))
    setPaid(String(editing?.paidInstallments ?? 0))
    setStartYm(editing?.startYm ?? currentYm())
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const totalN = Number(total)
  const paidN = Number(paid)
  const valid =
    name.trim() !== '' &&
    cardId !== '' &&
    installment !== null &&
    installment > 0 &&
    Number.isInteger(totalN) &&
    totalN >= 1 &&
    totalN <= 120 &&
    Number.isInteger(paidN) &&
    paidN >= 0 &&
    paidN <= totalN &&
    /^\d{4}-\d{2}$/.test(startYm)

  function save(): void {
    if (!open || !valid || installment === null) return
    const clean = name.trim()
    mutate((d) => {
      if (editing) {
        const p = d.purchases.find((x) => x.id === editing.id)
        if (p) {
          p.name = clean
          p.cardId = cardId
          p.installmentAmount = installment
          p.totalInstallments = totalN
          p.paidInstallments = paidN
          p.startYm = startYm
        }
      } else if (state.mode === 'new') {
        d.purchases.push({
          id: newId(),
          cardId,
          name: clean,
          installmentAmount: installment,
          totalInstallments: totalN,
          paidInstallments: paidN,
          startYm,
        })
      }
    })
    toast.success(
      editing ? 'Compra atualizada' : `Compra parcelada adicionada`,
      `${clean} · ${totalN}x — o limite disponível do cartão já reflete as parcelas.`,
    )
    onClose()
  }

  // opções de mês: 24 para trás até 1 à frente
  const monthOptions: string[] = []
  for (let i = -24; i <= 1; i++) monthOptions.push(addMonths(currentYm(), i))
  if (!monthOptions.includes(startYm)) monthOptions.unshift(startYm)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar compra parcelada' : 'Nova compra parcelada'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={save}>
            {editing ? 'Salvar' : 'Adicionar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome da compra">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Notebook"
              autoFocus
              maxLength={48}
            />
          </Field>
          <Field label="Cartão">
            <Select value={cardId} onChange={(e) => setCardId(e.target.value)} aria-label="Cartão da compra">
              {allCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor da parcela">
            <MoneyInput value={installment} onChange={setInstallment} aria-label="Valor da parcela" />
          </Field>
          <Field label="Total de parcelas">
            <Input
              type="number"
              min={1}
              max={120}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className="tnum"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Parcelas já pagas">
            <Input
              type="number"
              min={0}
              max={totalN || 0}
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              className="tnum"
            />
          </Field>
          <Field label="Mês da 1ª parcela">
            <Select value={startYm} onChange={(e) => setStartYm(e.target.value)}>
              {monthOptions.map((ym) => (
                <option key={ym} value={ym}>
                  {formatYmLong(ym)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {installment !== null && installment > 0 && valid && (
          <p className="text-[12.5px] text-ink-soft bg-surface-2 border border-line rounded-[10px] px-3 py-2.5 tnum">
            Compromisso total:{' '}
            <strong className="text-ink">
              {((installment * totalN) / 100).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </strong>{' '}
            · restam {totalN - paidN} parcelas
          </p>
        )}
      </div>
    </Modal>
  )
}
