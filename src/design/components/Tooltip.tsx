import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Tooltip leve com portal (não é clipado por overflow).
 * Usado principalmente na sidebar recolhida.
 */
export function Tooltip({
  label,
  side = 'right',
  disabled = false,
  children,
}: {
  label: string
  side?: 'right' | 'top' | 'bottom'
  disabled?: boolean
  children: ReactNode
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  function show(): void {
    if (disabled) return
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    if (side === 'right') setPos({ x: r.right + 10, y: r.top + r.height / 2 })
    else if (side === 'top') setPos({ x: r.left + r.width / 2, y: r.top - 8 })
    else setPos({ x: r.left + r.width / 2, y: r.bottom + 8 })
  }

  const transform =
    side === 'right' ? 'translateY(-50%)' : side === 'top' ? 'translate(-50%, -100%)' : 'translateX(-50%)'

  return (
    <div
      ref={ref}
      className="contents"
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onFocus={show}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos && !disabled
        ? createPortal(
            <div
              role="tooltip"
              className="fixed z-[80] px-2.5 py-1.5 text-[12px] font-medium text-ink bg-surface-3 border border-line-strong rounded-[8px] shadow-pop whitespace-nowrap pointer-events-none anim-fade-in"
              style={{ left: pos.x, top: pos.y, transform }}
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
