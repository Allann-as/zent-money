import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link2, Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/features/common/PageHeader'
import { Card } from '@/design/components/Card'
import { Button } from '@/design/components/Button'
import { Field, Input, MoneyInput } from '@/design/components/Input'
import { Modal } from '@/design/components/Modal'
import { Select } from '@/design/components/Select'
import { EmptyState } from '@/design/components/EmptyState'
import { ProgressRing } from '@/design/charts/ProgressRing'
import { useChartColors } from '@/design/charts/useChartColors'
import { toast } from '@/design/components/toast'
import { confirmDialog } from '@/design/components/confirm'
import { useDataStore, useZentData } from '@/store/dataStore'
import { investmentSnapshot } from '@/engine/investments'
import { sumByMonth } from '@/engine/aggregations'
import { formatBRL, formatPercent } from '@/engine/money'
import { addMonths, currentYm, formatYmShort, lastMonths } from '@/engine/dates'
import { newId } from '@/lib/id'
import { cn } from '@/lib/cn'
import type { Box } from '@/data/schema'

const EMOJI_CHOICES = ['🛟', '🏖️', '✈️', '🏠', '🚗', '🎓', '💻', '📱', '🎸', '💍', '🐶', '🎁', '🩺', '🎮', '📷', '⚽'] as const

interface BoxComputed {
  box: Box
  current: number
  ratio: number
  /** Ritmo médio de aportes dos últimos 3 meses (centavos/mês); null se n/d. */
  pace: number | null
  /** Mês estimado para bater a meta no ritmo atual. */
  eta: string | null
  investmentName: string | null
}

export function BoxesPage(): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const colors = useChartColors()
  const [dialog, setDialog] = useState<'closed' | 'new' | Box>('closed')

  const computed: BoxComputed[] = useMemo(() => {
    const now = currentYm()
    const recent = new Set(lastMonths(now, 3))
    return data.boxes.map((box) => {
      let current = box.manualAmount
      let pace: number | null = null
      let investmentName: string | null = null
      if (box.investmentId) {
        const inv = data.investments.find((i) => i.id === box.investmentId)
        if (inv) {
          investmentName = inv.name
          current = investmentSnapshot(inv, data.contributions, data.rates).balance
          const own = data.contributions.filter((c) => c.investmentId === inv.id)
          const byMonth = sumByMonth(own)
          let sum = 0
          for (const ym of recent) sum += byMonth.get(ym) ?? 0
          pace = Math.round(sum / 3)
        }
      }
      const ratio = box.target > 0 ? current / box.target : 0
      let eta: string | null = null
      if (current >= box.target) eta = null
      else if (pace !== null && pace > 0) {
        const months = Math.ceil((box.target - current) / pace)
        eta = addMonths(now, months)
      }
      return { box, current, ratio, pace, eta, investmentName }
    })
  }, [data.boxes, data.investments, data.contributions, data.rates])

  // Celebração: dispara UMA vez quando a meta é batida
  useEffect(() => {
    for (const c of computed) {
      if (c.current >= c.box.target && !c.box.celebrated) {
        toast.success('Meta batida!', `"${c.box.name}" chegou a ${formatBRL(c.box.target)}.`)
        mutate((d) => {
          const b = d.boxes.find((x) => x.id === c.box.id)
          if (b) b.celebrated = true
        })
      } else if (c.current < c.box.target && c.box.celebrated) {
        // meta aumentou ou valor caiu — permite celebrar de novo no futuro
        mutate((d) => {
          const b = d.boxes.find((x) => x.id === c.box.id)
          if (b) b.celebrated = false
        })
      }
    }
  }, [computed, mutate])

  async function removeBox(box: Box): Promise<void> {
    const ok = await confirmDialog({
      title: `Excluir caixinha ${box.name}`,
      message: 'A meta será removida. Aplicações vinculadas não são afetadas.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    mutate((d) => {
      d.boxes = d.boxes.filter((b) => b.id !== box.id)
    })
    toast.success('Caixinha excluída')
  }

  return (
    <>
      <PageHeader
        title="Caixinhas"
        subtitle="Metas que viram conquistas"
        actions={
          <Button onClick={() => setDialog('new')}>
            <Plus size={15} /> Nova caixinha
          </Button>
        }
      />

      {computed.length === 0 ? (
        <Card>
          <EmptyState
            icon={PiggyBank}
            title="Nenhuma caixinha ainda"
            description="Crie metas com valor alvo e vínculo com uma aplicação — o progresso acompanha sozinho."
            action={
              <Button variant="soft" size="sm" onClick={() => setDialog('new')}>
                <Plus size={14} /> Criar caixinha
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {computed.map((c) => {
            const complete = c.current >= c.box.target
            return (
              <Card
                key={c.box.id}
                className={cn(
                  'group relative p-6 flex flex-col items-center text-center overflow-hidden',
                  complete && 'anim-celebrate border-pos/40',
                )}
              >
                {/* brilho de fundo sutil */}
                <div
                  aria-hidden="true"
                  className="absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-64 rounded-full blur-3xl opacity-25 pointer-events-none"
                  style={{ background: complete ? colors.pos : colors.primary }}
                />

                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    aria-label={`Editar caixinha ${c.box.name}`}
                    onClick={() => setDialog(c.box)}
                    className="h-7.5 w-7.5 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Pencil size={13.5} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir caixinha ${c.box.name}`}
                    onClick={() => void removeBox(c.box)}
                    className="h-7.5 w-7.5 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-neg hover:bg-neg-soft cursor-pointer transition-colors"
                  >
                    <Trash2 size={13.5} />
                  </button>
                </div>

                <ProgressRing
                  ratio={c.ratio}
                  size={132}
                  thickness={9}
                  color={complete ? colors.pos : colors.primary}
                >
                  <span className="text-[30px] leading-none" aria-hidden="true">
                    {c.box.emoji}
                  </span>
                  <span
                    className={cn(
                      'text-[13px] font-bold tnum mt-1',
                      complete ? 'text-pos' : 'text-primary',
                    )}
                  >
                    {formatPercent(Math.min(1, c.ratio), 0)}
                  </span>
                </ProgressRing>

                <p className="font-display text-[15.5px] font-semibold text-ink mt-4 truncate max-w-full">
                  {c.box.name}
                </p>

                <p className="text-[13.5px] tnum mt-1">
                  <strong className={cn('font-bold', complete ? 'text-pos' : 'text-ink')}>
                    {formatBRL(c.current)}
                  </strong>
                  <span className="text-ink-faint"> / {formatBRL(c.box.target)}</span>
                </p>

                <p className="text-[12px] text-ink-soft mt-2 min-h-[18px]">
                  {complete
                    ? 'Meta batida!'
                    : c.eta
                      ? `No ritmo atual: ~${formatYmShort(c.eta)}`
                      : c.investmentName
                        ? 'Sem aportes nos últimos 3 meses'
                        : 'Atualize o guardado para acompanhar'}
                </p>

                <p className="flex items-center gap-1.5 text-[11.5px] text-ink-faint mt-3 pt-3 border-t border-line w-full justify-center">
                  <Link2 size={11.5} />
                  {c.investmentName ? (
                    <>
                      vinculada a <strong className="text-ink-soft">{c.investmentName}</strong>
                    </>
                  ) : (
                    'meta manual'
                  )}
                </p>
              </Card>
            )
          })}
        </div>
      )}

      <BoxDialog state={dialog} onClose={() => setDialog('closed')} />
    </>
  )
}

function BoxDialog({
  state,
  onClose,
}: {
  state: 'closed' | 'new' | Box
  onClose(): void
}): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const editing = state !== 'closed' && state !== 'new' ? state : null
  const open = state !== 'closed'

  const [emoji, setEmoji] = useState<string>('🛟')
  const [name, setName] = useState('')
  const [target, setTarget] = useState<number | null>(null)
  const [link, setLink] = useState<string>('manual')
  const [manualAmount, setManualAmount] = useState<number | null>(0)
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const targetKey: string = editing?.id ?? (typeof state === 'string' ? state : 'closed')
  if (open && openedFor !== targetKey) {
    setOpenedFor(targetKey)
    setEmoji(editing?.emoji ?? '🛟')
    setName(editing?.name ?? '')
    setTarget(editing?.target ?? null)
    setLink(editing?.investmentId ?? 'manual')
    setManualAmount(editing?.manualAmount ?? 0)
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const valid = name.trim() !== '' && target !== null && target > 0

  function save(): void {
    if (!valid || target === null) return
    const clean = name.trim()
    const investmentId = link === 'manual' ? null : link
    mutate((d) => {
      if (editing) {
        const b = d.boxes.find((x) => x.id === editing.id)
        if (b) {
          b.emoji = emoji
          b.name = clean
          b.target = target
          b.investmentId = investmentId
          b.manualAmount = manualAmount ?? 0
        }
      } else {
        d.boxes.push({
          id: newId(),
          emoji,
          name: clean,
          target,
          investmentId,
          manualAmount: manualAmount ?? 0,
          celebrated: false,
        })
      }
    })
    toast.success(editing ? 'Caixinha atualizada' : `Caixinha "${clean}" criada`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar caixinha' : 'Nova caixinha'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={save}>
            {editing ? 'Salvar' : 'Criar caixinha'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Ícone">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Escolher ícone">
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={emoji === e}
                onClick={() => setEmoji(e)}
                className={cn(
                  'h-9 w-9 rounded-[10px] text-[18px] inline-flex items-center justify-center cursor-pointer transition-all duration-150 border',
                  emoji === e
                    ? 'border-primary bg-primary-soft scale-105'
                    : 'border-line hover:border-line-strong hover:bg-surface-2',
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Nome da meta">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Reserva de emergência"
            maxLength={40}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor alvo">
            <MoneyInput value={target} onChange={setTarget} aria-label="Valor alvo da caixinha" />
          </Field>
          <Field label="Vínculo">
            <Select value={link} onChange={(e) => setLink(e.target.value)}>
              <option value="manual">Manual (eu atualizo)</option>
              {data.investments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {link === 'manual' ? (
          <Field label="Quanto já guardei" hint="Atualize aqui sempre que guardar mais.">
            <MoneyInput value={manualAmount} onChange={setManualAmount} aria-label="Valor guardado" />
          </Field>
        ) : (
          <p className="text-[12.5px] text-ink-soft bg-surface-2 border border-line rounded-[10px] px-3 py-2.5">
            O valor desta caixinha acompanha automaticamente o saldo estimado da aplicação vinculada.
          </p>
        )}
      </div>
    </Modal>
  )
}
