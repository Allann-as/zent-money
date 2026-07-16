import type { ReactNode } from 'react'
import { Modal } from '@/design/components/Modal'

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['Ctrl', 'K'], label: 'Busca global e paleta de comandos' },
  { keys: ['Ctrl', 'B'], label: 'Recolher / expandir o menu lateral' },
  { keys: ['?'], label: 'Este painel de atalhos' },
  { keys: ['Esc'], label: 'Fechar modais e a busca' },
  { keys: ['↑', '↓'], label: 'Navegar nos resultados da busca' },
  { keys: ['Enter'], label: 'Abrir o resultado selecionado' },
]

/** Overlay `?` com os atalhos de teclado (§8). */
export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose(): void }): ReactNode {
  return (
    <Modal open={open} onClose={onClose} title="Atalhos de teclado" width={400}>
      <ul className="flex flex-col gap-2.5 py-1">
        {SHORTCUTS.map((s, i) => (
          <li key={i} className="flex items-center justify-between gap-4">
            <span className="text-[13px] text-ink-soft">{s.label}</span>
            <span className="flex items-center gap-1 shrink-0">
              {s.keys.map((k) => (
                <kbd
                  key={k}
                  className="min-w-[26px] text-center text-[11px] font-medium text-ink border border-line-strong bg-surface-2 rounded-[6px] px-1.5 py-0.5 font-sans"
                >
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11.5px] text-ink-faint mt-3 pt-3 border-t border-line">
        Dica: clique em qualquer valor monetário para copiá-lo.
      </p>
    </Modal>
  )
}
