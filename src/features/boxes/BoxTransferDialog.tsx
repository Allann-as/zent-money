import { useMemo, useState, type ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Modal } from '@/design/components/Modal'
import { Button } from '@/design/components/Button'
import { Field, MoneyInput } from '@/design/components/Input'
import { BankPicker, type BankPickerOption } from '@/design/components/BankPicker'
import { toast } from '@/design/components/toast'
import { useDataStore, useZentData } from '@/store/dataStore'
import { useBRL } from '@/design/money'
import { bankBalances, boxStoredAmount } from '@/engine/ledger'
import { addBoxTransfer } from '@/store/mutations'
import { todayIso } from '@/engine/dates'
import { newId } from '@/lib/id'
import { cn } from '@/lib/cn'
import type { Box } from '@/data/schema'

export type BoxTransferState = 'closed' | { box: Box; mode: 'in' | 'out' }

/**
 * Guardar / Resgatar de uma caixinha manual (§4). Transferência REAL entre
 * conta e caixinha, com o "fluxo" (−origem → +destino) à mostra antes de
 * confirmar. Guardar debita a conta e credita a caixinha; Resgatar faz o
 * inverso — e nunca deixa resgatar mais do que há guardado.
 */
export function BoxTransferDialog({
  state,
  onClose,
}: {
  state: BoxTransferState
  onClose(): void
}): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const brl = useBRL()
  const open = state !== 'closed'
  const box = open ? state.box : null

  const [mode, setMode] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState<number | null>(null)
  const [bankId, setBankId] = useState<string | null>(null)
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const key = open ? `${state.box.id}:${state.mode}` : 'closed'
  if (open && openedFor !== key) {
    setOpenedFor(key)
    setMode(state.mode)
    setAmount(null)
    setBankId(null)
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const balances = useMemo(() => bankBalances(data), [data])
  const stored = box ? boxStoredAmount(box.id, box.manualAmount, data.boxTransfers) : 0

  // Opções do BankPicker: no Guardar, conta zerada fica desabilitada ("sem
  // saldo") — não se cede o que não se tem; no Resgatar, todas as contas servem
  // de destino.
  const options: BankPickerOption[] = data.banks.map((b) => {
    const bal = balances.get(b.id) ?? 0
    const disabled = mode === 'in' && bal <= 0
    return {
      id: b.id,
      name: b.name,
      logoName: b.name,
      logoColor: b.color,
      subtitle: `saldo ${brl(bal)}`,
      danger: bal <= 0,
      disabled,
      ...(disabled ? { reason: 'sem saldo' } : {}),
    }
  })

  const selectedBank = data.banks.find((b) => b.id === bankId) ?? null
  const overWithdraw = mode === 'out' && amount !== null && amount > stored
  const valid =
    amount !== null && amount > 0 && bankId !== null && !overWithdraw &&
    (mode === 'in' ? (balances.get(bankId) ?? 0) >= amount : true)

  function save(): void {
    if (!valid || amount === null || bankId === null || !box) return
    mutate((d) => {
      addBoxTransfer(d, { id: newId(), boxId: box.id, bankId, amount, date: todayIso(), direction: mode })
    })
    if (mode === 'in') toast.success('Guardado', `${brl(amount)} em ${box.name}`)
    else toast.success('Resgatado', `${brl(amount)} de ${box.name}`)
    onClose()
  }

  const title = box ? `${mode === 'in' ? 'Guardar' : 'Resgatar'} — ${box.name}` : ''

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!valid}
            onClick={save}
            className={mode === 'out' ? 'bg-neg text-white hover:bg-neg' : undefined}
          >
            {mode === 'in' ? 'Guardar' : 'Resgatar'} {amount ? brl(amount) : ''}
          </Button>
        </>
      }
    >
      {/* Alterna Guardar/Resgatar */}
      <div className="inline-flex w-full rounded-control border border-line p-0.5 mb-4" role="radiogroup" aria-label="Guardar ou resgatar">
        {(['in', 'out'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => {
              setMode(m)
              setBankId(null)
            }}
            className={cn(
              'flex-1 h-9 rounded-[8px] text-[13px] font-semibold cursor-pointer transition-colors',
              mode === m ? 'bg-surface-3 text-ink' : 'text-ink-soft hover:text-ink',
            )}
          >
            {m === 'in' ? 'Guardar' : 'Resgatar'}
          </button>
        ))}
      </div>

      <Field label={mode === 'in' ? 'Quanto guardar' : 'Quanto resgatar'}>
        <MoneyInput value={amount} onChange={setAmount} autoFocus aria-label={mode === 'in' ? 'Valor a guardar' : 'Valor a resgatar'} />
      </Field>
      <p className="tnum text-[12px] text-ink-faint mt-1.5 mb-4">
        {mode === 'in' ? 'guardado na caixinha' : 'disponível na caixinha'}: {brl(stored)}
        {overWithdraw && <span className="text-neg"> — não dá para resgatar mais que isso</span>}
      </p>

      <p className="text-[12px] font-semibold text-ink-soft mb-2">
        {mode === 'in' ? 'De qual conta sai' : 'Para qual conta vai'}
      </p>
      <BankPicker
        options={options}
        value={bankId}
        onChange={setBankId}
        ariaLabel={mode === 'in' ? 'Conta de origem' : 'Conta de destino'}
      />

      {/* Fluxo −origem → +destino */}
      {amount !== null && amount > 0 && selectedBank && (
        <div className="flex items-center gap-3 bg-surface-2 border border-line rounded-[12px] px-4 py-3 mt-4">
          <FlowSide
            label={mode === 'in' ? selectedBank.name : box?.name ?? ''}
            value={`− ${brl(amount)}`}
            tone="neg"
          />
          <ArrowRight size={18} className="text-primary shrink-0" />
          <FlowSide
            label={mode === 'in' ? box?.name ?? '' : selectedBank.name}
            value={`+ ${brl(amount)}`}
            tone="pos"
          />
        </div>
      )}
    </Modal>
  )
}

function FlowSide({ label, value, tone }: { label: string; value: string; tone: 'pos' | 'neg' }): ReactNode {
  return (
    <div className="flex-1 text-center min-w-0">
      <div className="text-[10px] uppercase tracking-[0.1em] text-ink-faint font-bold truncate">{label}</div>
      <div className={cn('tnum text-[15px] font-extrabold mt-0.5', tone === 'neg' ? 'text-neg' : 'text-pos')}>
        {value}
      </div>
    </div>
  )
}
