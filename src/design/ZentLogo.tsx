import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Marca Zent Money R2 — "Z em degraus": três traços horizontais em degrau
 * ascendente (lê como Z e como gráfico subindo). Monocromática por natureza:
 * o símbolo herda cor via currentColor/tokens e funciona nos dois temas.
 */

/** Só o símbolo (currentColor) — para usos inline. */
export function ZentMark({ size = 20, className }: { size?: number; className?: string }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <rect x="9" y="3" width="12" height="4.2" rx="2.1" />
      <rect x="6" y="9.9" width="12" height="4.2" rx="2.1" />
      <rect x="3" y="16.8" width="12" height="4.2" rx="2.1" />
    </svg>
  )
}

/** Chip quadrado com o símbolo — mesmo desenho do ícone do app. */
export function ZentLogo({ size = 34 }: { size?: number }): ReactNode {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[12px] bg-surface-2 border border-line-strong text-primary shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <ZentMark size={Math.round(size * 0.62)} />
    </span>
  )
}

/** Símbolo + wordmark "Zent Money" (sidebar expandida, sobre). */
export function ZentWordmark({ className }: { className?: string }): ReactNode {
  return (
    <span className={cn('inline-flex items-center gap-2 min-w-0', className)}>
      <ZentMark size={18} className="text-primary shrink-0" />
      <span className="font-display text-[15px] font-bold text-ink tracking-tight whitespace-nowrap truncate">
        Zent Money
      </span>
    </span>
  )
}
