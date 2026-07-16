import { create } from 'zustand'
import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

/**
 * Modal de confirmação próprio (substitui confirm() nativo).
 * Uso: `if (await confirmDialog({ title, message, danger: true })) { ... }`
 */

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface ConfirmState {
  open: boolean
  options: ConfirmOptions
  resolve: ((ok: boolean) => void) | null
  ask(options: ConfirmOptions): Promise<boolean>
  answer(ok: boolean): void
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: { title: '', message: '' },
  resolve: null,
  ask: (options) =>
    new Promise<boolean>((resolve) => {
      // se já houver um pendente, resolve como cancelado
      get().resolve?.(false)
      set({ open: true, options, resolve })
    }),
  answer: (ok) => {
    get().resolve?.(ok)
    set({ open: false, resolve: null })
  },
}))

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().ask(options)
}

export function ConfirmHost(): ReactNode {
  const { open, options, answer } = useConfirmStore()
  return (
    <Modal
      open={open}
      onClose={() => answer(false)}
      title={options.title}
      width={400}
      footer={
        <>
          <Button variant="ghost" onClick={() => answer(false)}>
            {options.cancelLabel ?? 'Cancelar'}
          </Button>
          <Button variant={options.danger ? 'danger' : 'primary'} onClick={() => answer(true)}>
            {options.confirmLabel ?? 'Confirmar'}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] text-ink-soft leading-relaxed">{options.message}</p>
    </Modal>
  )
}
