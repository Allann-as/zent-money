import { useMemo, useState, type ReactNode } from 'react'
import { Gift, Pencil, Plus, Repeat, Trash2, TrendingUp, Wallet } from 'lucide-react'
import { PageHeader } from '@/features/common/PageHeader'
import { MonthNav } from '@/features/common/MonthNav'
import { RecurringModal } from '@/features/common/RecurringModal'
import { Card, CardTitle } from '@/design/components/Card'
import { StatCard } from '@/design/components/StatCard'
import { Button } from '@/design/components/Button'
import { Field, Input, MoneyInput } from '@/design/components/Input'
import { Modal } from '@/design/components/Modal'
import { EmptyState } from '@/design/components/EmptyState'
import { toast } from '@/design/components/toast'
import { confirmDialog } from '@/design/components/confirm'
import { useDataStore, useZentData } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import { groupByMonth, salaryForYm, sumByMonth } from '@/engine/aggregations'
import { formatBRL } from '@/engine/money'
import { currentYm, formatDateShort, formatYmLong, todayIso, ymCompare, ymOfDate } from '@/engine/dates'
import { newId } from '@/lib/id'
import type { ExtraIncome } from '@/data/schema'

export function IncomePage(): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const ym = useUiStore((s) => s.activeYm)

  const [salaryModal, setSalaryModal] = useState(false)
  const [salaryDraft, setSalaryDraft] = useState<number | null>(null)
  const [extraModal, setExtraModal] = useState<'closed' | 'new' | ExtraIncome>('closed')
  const [recurringOpen, setRecurringOpen] = useState(false)

  const salary = salaryForYm(data.salaryHistory, ym)
  // agrupamento por mês memoizado — trocar de mês não varre o histórico (§10.4)
  const extrasByYm = useMemo(() => groupByMonth(data.extraIncomes), [data.extraIncomes])
  const monthExtras = useMemo(
    () => [...(extrasByYm.get(ym) ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [extrasByYm, ym],
  )
  const extrasTotal = useMemo(() => sumByMonth(monthExtras).get(ym) ?? 0, [monthExtras, ym])
  const total = salary + extrasTotal
  const viewingPast = ymCompare(ym, currentYm()) < 0

  function saveSalary(): void {
    if (salaryDraft === null) return
    const start = currentYm()
    mutate((d) => {
      const existing = d.salaryHistory.find((s) => s.startYm === start)
      if (existing) existing.amount = salaryDraft
      else d.salaryHistory.push({ id: newId(), startYm: start, amount: salaryDraft })
    })
    setSalaryModal(false)
    toast.success('Salário atualizado', `Vale de ${formatYmLong(start)} em diante. Meses passados mantêm o valor da época.`)
  }

  async function removeExtra(extra: ExtraIncome): Promise<void> {
    const ok = await confirmDialog({
      title: 'Excluir ganho extra',
      message: `Excluir "${extra.description}" (${formatBRL(extra.amount)})? Essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    mutate((d) => {
      d.extraIncomes = d.extraIncomes.filter((e) => e.id !== extra.id)
    })
    toast.success('Ganho extra excluído')
  }

  return (
    <>
      <PageHeader title="Ganhos" subtitle="Salário e entradas extras" actions={<MonthNav />} />

      {/* Cards de resumo (padrão StatCard) */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="relative">
          <StatCard
            icon={Wallet}
            value={formatBRL(salary)}
            label={viewingPast ? 'Salário da época' : 'Salário vigente'}
            className="h-full"
          />
          <Button
            size="sm"
            variant="ghost"
            className="absolute top-3.5 right-3.5"
            onClick={() => {
              setSalaryDraft(salaryForYm(data.salaryHistory, currentYm()) || null)
              setSalaryModal(true)
            }}
          >
            <Pencil size={13} /> Editar
          </Button>
        </div>
        <StatCard
          icon={Gift}
          value={formatBRL(extrasTotal)}
          label="Extras do mês"
          detail={
            monthExtras.length === 0
              ? 'nenhum lançamento'
              : `${monthExtras.length} ${monthExtras.length === 1 ? 'lançamento' : 'lançamentos'}`
          }
        />
        <StatCard
          icon={TrendingUp}
          value={formatBRL(total)}
          label="Total de entradas"
          tone="primary"
          detail={<span className="first-letter:uppercase inline-block">{formatYmLong(ym)}</span>}
        />
      </div>

      {/* Extras do mês */}
      <Card>
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <CardTitle>Ganhos extras de {formatYmLong(ym)}</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRecurringOpen(true)}>
              <Repeat size={13} /> Recorrentes
            </Button>
            <Button size="sm" onClick={() => setExtraModal('new')}>
              <Plus size={14} /> Novo extra
            </Button>
          </div>
        </div>
        {monthExtras.length === 0 ? (
          <EmptyState
            icon={Gift}
            title="Nenhum ganho extra neste mês"
            description={'Presente, freela, venda, reembolso… registre aqui tudo que entrou além do salário.'}
            action={
              <Button variant="soft" size="sm" onClick={() => setExtraModal('new')}>
                <Plus size={14} /> Registrar o primeiro
              </Button>
            }
          />
        ) : (
          <ul className="px-2 pb-2">
            {monthExtras.map((e) => (
              <li
                key={e.id}
                className="group flex items-center gap-3 px-3 h-12 rounded-[10px] hover:bg-surface-2 transition-colors"
              >
                <span className="text-[12px] text-ink-faint tnum w-14 shrink-0">
                  {formatDateShort(e.date)}
                </span>
                <span className="flex-1 text-[13.5px] text-ink truncate">{e.description}</span>
                <span className="text-[13.5px] font-semibold text-pos tnum">
                  +{formatBRL(e.amount)}
                </span>
                <span className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    aria-label={`Editar ${e.description}`}
                    onClick={() => setExtraModal(e)}
                    className="h-7 w-7 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-3 cursor-pointer"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir ${e.description}`}
                    onClick={() => void removeExtra(e)}
                    className="h-7 w-7 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-neg hover:bg-neg-soft cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Modal salário */}
      <Modal
        open={salaryModal}
        onClose={() => setSalaryModal(false)}
        title="Editar salário mensal"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSalaryModal(false)}>
              Cancelar
            </Button>
            <Button disabled={salaryDraft === null} onClick={saveSalary}>
              Salvar
            </Button>
          </>
        }
      >
        <Field
          label="Novo salário mensal"
          hint={`Vale de ${formatYmLong(currentYm())} em diante — meses passados continuam exibindo o salário da época.`}
        >
          <MoneyInput value={salaryDraft} onChange={setSalaryDraft} autoFocus aria-label="Salário mensal" />
        </Field>
      </Modal>

      <ExtraDialog state={extraModal} onClose={() => setExtraModal('closed')} />
      <RecurringModal kind="income" open={recurringOpen} onClose={() => setRecurringOpen(false)} />
    </>
  )
}

function ExtraDialog({
  state,
  onClose,
}: {
  state: 'closed' | 'new' | ExtraIncome
  onClose(): void
}): ReactNode {
  const mutate = useDataStore((s) => s.mutate)
  const editing = state !== 'closed' && state !== 'new' ? state : null
  const open = state !== 'closed'

  const [date, setDate] = useState(todayIso())
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [repeatMonthly, setRepeatMonthly] = useState(false)
  const [openedFor, setOpenedFor] = useState<'closed' | 'new' | string>('closed')

  // Reinicializa o formulário quando abre para um alvo diferente
  const target: string = editing?.id ?? (typeof state === 'string' ? state : 'closed')
  if (open && openedFor !== target) {
    setOpenedFor(target)
    setDate(editing?.date ?? todayIso())
    setDescription(editing?.description ?? '')
    setAmount(editing?.amount ?? null)
    setRepeatMonthly(false)
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const valid = description.trim() !== '' && amount !== null && amount > 0 && date !== ''

  function save(): void {
    if (!valid || amount === null) return
    const cleanDesc = description.trim()
    mutate((d) => {
      if (editing) {
        const e = d.extraIncomes.find((x) => x.id === editing.id)
        if (e) {
          e.date = date
          e.description = cleanDesc
          e.amount = amount
        }
      } else {
        const recurringId = repeatMonthly ? newId() : null
        if (recurringId) {
          d.recurringIncomes.push({
            id: recurringId,
            description: cleanDesc,
            amount,
            dayOfMonth: Number(date.slice(8, 10)),
            startYm: ymOfDate(date),
            endYm: null,
          })
        }
        d.extraIncomes.push({
          id: newId(),
          date,
          description: cleanDesc,
          amount,
          ...(recurringId ? { recurringId } : {}),
        })
      }
    })
    toast.success(
      editing ? 'Ganho extra atualizado' : repeatMonthly ? 'Ganho recorrente criado' : 'Ganho extra registrado',
      repeatMonthly && !editing
        ? `${formatBRL(amount)} — será lançado todo mês automaticamente.`
        : formatBRL(amount),
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar ganho extra' : 'Novo ganho extra'}
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
        <Field label="Descrição">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={'Ex.: Presente da vó, Freela…'}
            autoFocus
            maxLength={60}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Valor">
            <MoneyInput value={amount} onChange={setAmount} aria-label="Valor do ganho extra" />
          </Field>
        </div>
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
