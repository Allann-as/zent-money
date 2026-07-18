import { useMemo, useState, type ReactNode } from 'react'
import { Modal } from '@/design/components/Modal'
import { Button } from '@/design/components/Button'
import { Field, MoneyInput } from '@/design/components/Input'
import { Select } from '@/design/components/Select'
import { toast } from '@/design/components/toast'
import { useDataStore, useZentData } from '@/store/dataStore'
import { addBudgetReallocation } from '@/store/mutations'
import { useUiStore } from '@/store/uiStore'
import { effectiveLimit, monthBudgets, validateReallocation } from '@/engine/budget'
import { useBRL } from '@/design/money'
import { formatYmLong } from '@/engine/dates'
import { newId } from '@/lib/id'

/**
 * Realocação de orçamento entre categorias (M1 §c). Move parte do limite de uma
 * categoria para outra **só no mês ativo** — a virada volta ao base. Não é
 * dinheiro: nada aqui toca o saldo de conta nenhuma.
 *
 * A origem precisa ter limite (efetivo) e não pode ceder mais do que tem; o
 * destino pode ser qualquer categoria, mesmo sem limite base (ganha um efetivo
 * só no mês). A prévia mostra o antes→depois das duas pontas antes de confirmar.
 */
export function ReallocateBudgetModal({
  open,
  onClose,
  defaultToCategoryId,
}: {
  open: boolean
  onClose(): void
  /** Categoria pré-selecionada como destino (ex.: a que estourou no aviso). */
  defaultToCategoryId?: string
}): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const ym = useUiStore((s) => s.activeYm)
  const brl = useBRL()

  const budgets = useMemo(
    () => monthBudgets(data.categories, data.budgetReallocations, ym),
    [data.categories, data.budgetReallocations, ym],
  )
  /** Só pode CEDER quem tem limite efetivo (não se cede o que não se tem). */
  const canGive = useMemo(
    () => data.categories.filter((c) => (budgets.get(c.id)?.effective ?? null) !== null),
    [data.categories, budgets],
  )

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const target = open ? (defaultToCategoryId ?? 'any') : 'closed'
  if (openedFor !== target) {
    setOpenedFor(target)
    if (open) {
      const firstGiver = canGive[0]?.id ?? ''
      // destino sugerido: o pedido, senão a primeira categoria diferente da origem
      const firstReceiver =
        defaultToCategoryId ?? data.categories.find((c) => c.id !== firstGiver)?.id ?? ''
      setFrom(firstReceiver === firstGiver ? (canGive.find((c) => c.id !== firstReceiver)?.id ?? firstGiver) : firstGiver)
      setTo(firstReceiver)
      setAmount(null)
    }
  }

  const fromCat = data.categories.find((c) => c.id === from)
  const toCat = data.categories.find((c) => c.id === to)
  const error =
    amount === null
      ? null
      : validateReallocation(data.categories, data.budgetReallocations, ym, {
          fromCategoryId: from,
          toCategoryId: to,
          amount,
        })
  const valid = amount !== null && amount > 0 && error === null

  const fromEff = fromCat ? effectiveLimit(fromCat, data.budgetReallocations, ym) : null
  const toEff = toCat ? effectiveLimit(toCat, data.budgetReallocations, ym) : null

  function save(): void {
    if (!valid || amount === null) return
    mutate((d) =>
      addBudgetReallocation(d, { id: newId(), ym, fromCategoryId: from, toCategoryId: to, amount }),
    )
    toast.success(
      'Orçamento realocado',
      `${brl(amount)} de ${fromCat?.name ?? '—'} para ${toCat?.name ?? '—'} em ${formatYmLong(ym)}.`,
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Realocar orçamento"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={save}>
            Realocar
          </Button>
        </>
      }
    >
      {canGive.length === 0 ? (
        <p className="text-[13px] text-ink-soft leading-relaxed">
          Nenhuma categoria tem limite de orçamento para ceder. Defina limites mensais em
          Gastos → Categorias para poder realocar.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[12.5px] text-ink-soft leading-relaxed">
            Move parte do limite de uma categoria para outra só em{' '}
            <strong className="text-ink">{formatYmLong(ym)}</strong>. Não mexe no seu saldo — é só
            orçamento, e o mês seguinte volta ao normal.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Ceder de"
              {...(fromEff !== null ? { hint: `Disponível: ${brl(fromEff)}` } : {})}
            >
              <Select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Categoria de origem">
                {canGive.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Para">
              <Select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Categoria de destino">
                {data.categories
                  .filter((c) => c.id !== from)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
          <Field label="Valor">
            <MoneyInput value={amount} onChange={setAmount} autoFocus aria-label="Valor a realocar" />
          </Field>
          {error !== null && amount !== null && (
            <p className="text-[12.5px] text-neg bg-neg-soft border border-neg/25 rounded-[10px] px-3 py-2.5">
              {error}
            </p>
          )}
          {valid && amount !== null && fromEff !== null && (
            <p className="text-[12.5px] text-ink-soft bg-surface-2 border border-line rounded-[10px] px-3 py-2.5 tnum leading-relaxed">
              {fromCat?.name}: <strong className="text-ink">{brl(fromEff)}</strong> →{' '}
              <strong className="text-ink">{brl(fromEff - amount)}</strong>
              {' · '}
              {toCat?.name}: <strong className="text-ink">{brl(toEff ?? 0)}</strong> →{' '}
              <strong className="text-ink">{brl((toEff ?? 0) + amount)}</strong>
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
