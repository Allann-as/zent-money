import type { ReactNode } from 'react'
import { CalendarOff, Repeat, Trash2 } from 'lucide-react'
import { Modal } from '@/design/components/Modal'
import { Button } from '@/design/components/Button'
import { toast } from '@/design/components/toast'
import { confirmDialog } from '@/design/components/confirm'
import { useDataStore, useZentData } from '@/store/dataStore'
import { formatBRL } from '@/engine/money'
import { currentYm, formatYmShort } from '@/engine/dates'

/**
 * Gerenciamento de lançamentos recorrentes (Gastos e Ganhos).
 * Encerrar: para de gerar a partir do próximo mês (endYm = mês atual).
 * Excluir: remove o template (lançamentos já criados são preservados).
 */
export function RecurringModal({
  kind,
  open,
  onClose,
}: {
  kind: 'expense' | 'income'
  open: boolean
  onClose(): void
}): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)

  const items =
    kind === 'expense'
      ? data.recurringExpenses.map((t) => ({
          id: t.id,
          title: t.description || data.categories.find((c) => c.id === t.categoryId)?.name || 'Gasto',
          amount: t.amount,
          dayOfMonth: t.dayOfMonth,
          endYm: t.endYm,
        }))
      : data.recurringIncomes.map((t) => ({
          id: t.id,
          title: t.description,
          amount: t.amount,
          dayOfMonth: t.dayOfMonth,
          endYm: t.endYm,
        }))

  function stop(id: string, title: string): void {
    mutate((d) => {
      const list = kind === 'expense' ? d.recurringExpenses : d.recurringIncomes
      const t = list.find((x) => x.id === id)
      if (t) t.endYm = currentYm()
    })
    toast.success(`"${title}" encerrada`, 'Não gera novos lançamentos a partir do próximo mês.')
  }

  async function remove(id: string, title: string): Promise<void> {
    const ok = await confirmDialog({
      title: 'Excluir recorrência',
      message: `Excluir a recorrência "${title}"? Os lançamentos já criados são mantidos.`,
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    mutate((d) => {
      if (kind === 'expense') d.recurringExpenses = d.recurringExpenses.filter((x) => x.id !== id)
      else d.recurringIncomes = d.recurringIncomes.filter((x) => x.id !== id)
    })
    toast.success('Recorrência excluída')
  }

  const ended = (endYm: string | null): boolean => endYm !== null && endYm <= currentYm()

  return (
    <Modal open={open} onClose={onClose} title="Lançamentos recorrentes" width={480}>
      {items.length === 0 ? (
        <p className="text-[13px] text-ink-soft py-3 leading-relaxed">
          Nenhuma recorrência ainda. Ao criar um {kind === 'expense' ? 'gasto' : 'ganho extra'},
          marque <strong className="text-ink">“Repetir todo mês”</strong> — o lançamento passa a ser
          criado automaticamente a cada mês.
        </p>
      ) : (
        <ul className="flex flex-col -mx-1">
          {items.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 px-3 h-12 rounded-[10px] hover:bg-surface-2 transition-colors"
            >
              <span className="h-8 w-8 rounded-[10px] bg-accent-soft inline-flex items-center justify-center shrink-0">
                <Repeat size={14} className="text-accent-strong" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink truncate">{t.title}</p>
                <p className="text-[11.5px] text-ink-faint tnum">
                  {formatBRL(t.amount)} · todo dia {t.dayOfMonth}
                  {t.endYm ? ` · ${ended(t.endYm) ? 'encerrada' : `até ${formatYmShort(t.endYm)}`}` : ''}
                </p>
              </div>
              {!ended(t.endYm) && (
                <Button size="sm" variant="ghost" onClick={() => stop(t.id, t.title)}>
                  <CalendarOff size={13} /> Encerrar
                </Button>
              )}
              <button
                type="button"
                aria-label={`Excluir recorrência ${t.title}`}
                onClick={() => void remove(t.id, t.title)}
                className="h-7 w-7 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-neg hover:bg-neg-soft cursor-pointer transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
