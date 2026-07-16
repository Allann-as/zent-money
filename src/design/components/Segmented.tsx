import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

/** Controle segmentado (ex.: modos de gráfico da Carteira). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange(v: T): void
  className?: string
  /** Nome do grupo. Nunca envolva este componente num <label>: o label
   *  reivindicaria o primeiro botão e embaralharia o nome acessível das abas. */
  ariaLabel?: string
}): ReactNode {
  return (
    <div
      role="tablist"
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      className={cn('inline-flex p-1 gap-0.5 bg-surface-2 border border-line rounded-[11px]', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7.5 px-3.5 rounded-[8px] text-[12.5px] font-medium transition-all duration-150 cursor-pointer whitespace-nowrap',
            o.value === value
              ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.25)] border border-line-strong'
              : 'text-ink-soft hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
