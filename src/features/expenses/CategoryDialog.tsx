import { useState, type ReactNode } from 'react'
import { Modal } from '@/design/components/Modal'
import { Button } from '@/design/components/Button'
import { Field, Input, MoneyInput } from '@/design/components/Input'
import { ColorPicker, CURATED_COLORS } from '@/design/components/ColorPicker'
import { toast } from '@/design/components/toast'
import { useDataStore } from '@/store/dataStore'
import { newId } from '@/lib/id'
import type { Category } from '@/data/schema'

export type CategoryDialogState = 'closed' | 'new' | Category

export function CategoryDialog({
  state,
  onClose,
}: {
  state: CategoryDialogState
  onClose(): void
}): ReactNode {
  const mutate = useDataStore((s) => s.mutate)
  const editing = state !== 'closed' && state !== 'new' ? state : null
  const open = state !== 'closed'

  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(CURATED_COLORS[0])
  const [limit, setLimit] = useState<number | null>(null)
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const target: string = editing?.id ?? (typeof state === 'string' ? state : 'closed')
  if (open && openedFor !== target) {
    setOpenedFor(target)
    setName(editing?.name ?? '')
    setColor(editing?.color ?? CURATED_COLORS[(Math.abs(Date.now()) % CURATED_COLORS.length)] ?? CURATED_COLORS[0])
    setLimit(editing?.monthlyLimit ?? null)
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const valid = name.trim() !== ''

  function save(): void {
    if (!valid) return
    const clean = name.trim()
    mutate((d) => {
      if (editing) {
        const c = d.categories.find((x) => x.id === editing.id)
        if (c) {
          c.name = clean
          c.color = color
          c.monthlyLimit = limit
        }
      } else {
        d.categories.push({ id: newId(), name: clean, color, monthlyLimit: limit })
        d.meta.categoriesOnboarded = true
      }
    })
    toast.success(editing ? 'Categoria atualizada' : `Categoria "${clean}" criada`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar categoria' : 'Nova categoria'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={save}>
            {editing ? 'Salvar' : 'Criar categoria'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Mercado"
            autoFocus
            maxLength={32}
          />
        </Field>
        <Field label="Cor">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field label="Limite mensal (opcional)" hint="Usado na barra de orçamento da Visão geral.">
          <MoneyInput value={limit} onChange={setLimit} aria-label="Limite mensal da categoria" />
        </Field>
      </div>
    </Modal>
  )
}
