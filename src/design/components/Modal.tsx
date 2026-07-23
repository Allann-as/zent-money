import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface ModalProps {
  open: boolean
  onClose(): void
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: number
}

/**
 * Modal do design system: portal, backdrop, Esc, focus trap básico.
 *
 * ── FORMATO A (R10 §7): 380px, COLUNA ÚNICA ─────────────────────────────
 * A largura padrão caiu de 440 para 380 e os formulários de lançamento
 * perderam as fileiras de dois campos. Um formulário de dinheiro é uma
 * sequência de decisões — quanto, de quê, quando, de onde — e em duas colunas
 * o olho tem de escolher por onde ir a cada linha. Em coluna única existe um
 * caminho só, de cima para baixo.
 *
 * Modais que NÃO são formulário de lançamento (conquistas, detalhamento do
 * score, recorrentes) seguem passando a própria largura: ali o conteúdo é
 * leitura, não digitação, e espremer não ajuda ninguém.
 */
export function Modal({ open, onClose, title, children, footer, width = 380 }: ModalProps): ReactNode {
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // onClose entra por ref: como callback inline, sua identidade muda a cada render do
  // pai. Nas deps do efeito abaixo, isso o re-executaria a cada tecla digitada e o
  // foco seria roubado do campo em uso (bug do salário, R3 §1).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const el = panelRef.current
    // foca o primeiro campo do corpo — nunca o "Fechar" do cabeçalho
    const first = bodyRef.current?.querySelector<HTMLElement>('input, select, textarea, button')
    ;(first ?? el)?.focus()

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      } else if (e.key === 'Tab' && el) {
        // focus trap: mantém Tab dentro do modal
        const focusables = el.querySelectorAll<HTMLElement>(
          'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return
        const list = Array.from(focusables).filter((f) => !f.hasAttribute('disabled'))
        const firstEl = list[0]
        const lastEl = list[list.length - 1]
        if (!firstEl || !lastEl) return
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault()
          lastEl.focus()
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 anim-fade-in"
      style={{ background: 'var(--backdrop)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'bg-surface border border-line rounded-card shadow-pop anim-pop-in',
          'max-h-[85vh] flex flex-col w-full',
        )}
        style={{ maxWidth: width }}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="font-display text-[15px] font-semibold text-ink tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="h-7 w-7 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </header>
        <div ref={bodyRef} className="px-5 pb-4 overflow-y-auto">
          {children}
        </div>
        {footer ? (
          <footer className="flex justify-end gap-2 px-5 py-3.5 border-t border-line">{footer}</footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
