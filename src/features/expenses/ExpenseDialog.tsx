import { useState, type ReactNode } from 'react'
import { Modal } from '@/design/components/Modal'
import { Button } from '@/design/components/Button'
import { Field, Input, MoneyInput } from '@/design/components/Input'
import { Select } from '@/design/components/Select'
import { toast } from '@/design/components/toast'
import { useDataStore, useZentData } from '@/store/dataStore'
import { formatBRL } from '@/engine/money'
import { todayIso, ymOfDate } from '@/engine/dates'
import { newId } from '@/lib/id'
import { cn } from '@/lib/cn'
import type { Expense, ExpenseOrigin } from '@/data/schema'

export type ExpenseDialogState = 'closed' | 'new' | Expense

/** Origem → valor do <select> ('' = sem origem). */
function originToValue(o: ExpenseOrigin | null): string {
  if (o === null) return ''
  return o.kind === 'bank' ? `bank:${o.bankId}` : `card:${o.cardId}`
}

/** Valor do <select> → origem persistida. */
function valueToOrigin(v: string): ExpenseOrigin | null {
  if (v.startsWith('bank:')) return { kind: 'bank', bankId: v.slice(5) }
  if (v.startsWith('card:')) return { kind: 'card', cardId: v.slice(5) }
  return null
}

export function ExpenseDialog({
  state,
  onClose,
}: {
  state: ExpenseDialogState
  onClose(): void
}): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const editing = state !== 'closed' && state !== 'new' ? state : null
  const open = state !== 'closed'

  const [date, setDate] = useState(todayIso())
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [essential, setEssential] = useState(true)
  const [repeatMonthly, setRepeatMonthly] = useState(false)
  /** "Pago com" (R3 §3.4): '' = sem origem · 'bank:<id>' · 'card:<id>'. */
  const [origin, setOrigin] = useState('')
  /** Opt-in explícito de somar este gasto à fatura do cartão (ver DECISOES). */
  const [addToInvoice, setAddToInvoice] = useState(false)
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const target: string = editing?.id ?? (typeof state === 'string' ? state : 'closed')
  if (open && openedFor !== target) {
    setOpenedFor(target)
    setDate(editing?.date ?? todayIso())
    setCategoryId(editing?.categoryId ?? data.categories[0]?.id ?? '')
    setDescription(editing?.description ?? '')
    setAmount(editing?.amount ?? null)
    setEssential(editing?.essential ?? true)
    setRepeatMonthly(false)
    setOrigin(originToValue(editing?.origin ?? null))
    setAddToInvoice(false)
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const originCardId = origin.startsWith('card:') ? origin.slice(5) : null

  const valid = categoryId !== '' && amount !== null && amount > 0 && date !== ''

  /** Alerta de limite da categoria: âmbar ao cruzar 90%, vermelho ao estourar. */
  function checkLimit(catId: string, addedAmount: number, expenseYm: string): void {
    const category = data.categories.find((c) => c.id === catId)
    if (!category || category.monthlyLimit === null || category.monthlyLimit <= 0) return
    const limit = category.monthlyLimit
    let before = 0
    for (const e of data.expenses) {
      if (e.categoryId === catId && ymOfDate(e.date) === expenseYm && e.id !== (editing?.id ?? '')) {
        before += e.amount
      }
    }
    const after = before + addedAmount
    if (after > limit && before <= limit) {
      toast.error(
        `Limite de ${category.name} estourado`,
        `${formatBRL(after)} lançados — o limite do mês é ${formatBRL(limit)}.`,
      )
    } else if (after >= limit * 0.9 && before < limit * 0.9) {
      toast.warning(
        `${category.name} perto do limite`,
        `${formatBRL(after)} de ${formatBRL(limit)} (${Math.round((after / limit) * 100)}% do teto do mês).`,
      )
    }
  }

  function save(): void {
    if (!valid || amount === null) return
    const cleanDesc = description.trim()
    const nextOrigin = valueToOrigin(origin)
    // Opt-in: soma pontual à fatura do cartão. NÃO é um vínculo vivo — a fatura
    // segue sendo o snapshot que o usuário mantém (ver DECISOES.md, R3 §3.4).
    const invoiceCardId = addToInvoice && originCardId !== null ? originCardId : null
    mutate((d) => {
      if (editing) {
        const e = d.expenses.find((x) => x.id === editing.id)
        if (e) {
          e.date = date
          e.categoryId = categoryId
          e.description = cleanDesc
          e.amount = amount
          e.essential = essential
          e.origin = nextOrigin
        }
      } else {
        const recurringId = repeatMonthly ? newId() : null
        if (recurringId) {
          d.recurringExpenses.push({
            id: recurringId,
            categoryId,
            description: cleanDesc,
            amount,
            essential,
            dayOfMonth: Number(date.slice(8, 10)),
            startYm: ymOfDate(date),
            endYm: null,
          })
        }
        d.expenses.push({
          id: newId(),
          date,
          categoryId,
          description: cleanDesc,
          amount,
          essential,
          origin: nextOrigin,
          ...(recurringId ? { recurringId } : {}),
        })
      }
      if (invoiceCardId !== null) {
        const card = d.cards.find((c) => c.id === invoiceCardId)
        if (card) card.invoice += amount
      }
    })
    checkLimit(categoryId, amount, ymOfDate(date))
    toast.success(
      editing ? 'Gasto atualizado' : repeatMonthly ? 'Gasto recorrente criado' : 'Gasto registrado',
      invoiceCardId !== null
        ? `${formatBRL(amount)} — somados à fatura do cartão.`
        : repeatMonthly && !editing
          ? `${formatBRL(amount)} — será lançado todo mês automaticamente.`
          : formatBRL(amount),
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar gasto' : 'Novo gasto'}
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
          <Field label="Data">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
          </Field>
          <Field label="Categoria">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Descrição (opcional)">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Compras da semana"
            maxLength={60}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor">
            <MoneyInput value={amount} onChange={setAmount} aria-label="Valor do gasto" />
          </Field>
          {/* R3 §3.4 — opcional: habilita as análises por banco */}
          <Field label="Pago com (opcional)">
            <Select
              value={origin}
              onChange={(e) => {
                setOrigin(e.target.value)
                if (!e.target.value.startsWith('card:')) setAddToInvoice(false)
              }}
              aria-label="Pago com"
            >
              <option value="">Sem origem</option>
              {data.banks.length > 0 && (
                <optgroup label="Contas">
                  {data.banks.map((b) => (
                    <option key={b.id} value={`bank:${b.id}`}>
                      {b.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {data.cards.length > 0 && (
                <optgroup label="Cartões">
                  {data.cards.map((c) => {
                    const bank = data.banks.find((b) => b.id === c.bankId)
                    return (
                      <option key={c.id} value={`card:${c.id}`}>
                        {c.name}
                        {bank ? ` · ${bank.name}` : ''}
                      </option>
                    )
                  })}
                </optgroup>
              )}
            </Select>
          </Field>
        </div>
        {originCardId !== null && !editing && (
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addToInvoice}
              onChange={(e) => setAddToInvoice(e.target.checked)}
              className="h-4 w-4 mt-0.5 accent-[color:var(--primary)] cursor-pointer shrink-0"
              aria-label="Somar à fatura do cartão"
            />
            <span className="text-[13px] text-ink">
              Somar à fatura do cartão{' '}
              <span className="text-ink-faint">
                — só marque se a fatura ainda não inclui este gasto, senão ele conta duas vezes.
              </span>
            </span>
          </label>
        )}
        <Field label="Classificação">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Necessário ou supérfluo">
            <button
              type="button"
              role="radio"
              aria-checked={essential}
              onClick={() => setEssential(true)}
              className={cn(
                'h-9.5 rounded-control border text-[13px] font-medium transition-all duration-150 cursor-pointer',
                essential
                  ? 'border-pos bg-pos-soft text-pos'
                  : 'border-line text-ink-soft hover:border-line-strong',
              )}
            >
              Necessário
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!essential}
              onClick={() => setEssential(false)}
              className={cn(
                'h-9.5 rounded-control border text-[13px] font-medium transition-all duration-150 cursor-pointer',
                !essential
                  ? 'border-warn bg-warn-soft text-warn'
                  : 'border-line text-ink-soft hover:border-line-strong',
              )}
            >
              Supérfluo
            </button>
          </div>
        </Field>
        {!editing && (
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={repeatMonthly}
              onChange={(e) => setRepeatMonthly(e.target.checked)}
              className="h-4 w-4 accent-[color:var(--primary)] cursor-pointer"
              aria-label="Repetir todo mês"
            />
            <span className="text-[13px] text-ink">
              Repetir todo mês{' '}
              <span className="text-ink-faint">
                (lançado automaticamente no dia {date ? Number(date.slice(8, 10)) : '—'})
              </span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  )
}
