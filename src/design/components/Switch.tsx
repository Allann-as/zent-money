import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Switch({
  checked,
  onChange,
  'aria-label': ariaLabel,
}: {
  checked: boolean
  onChange(next: boolean): void
  'aria-label': string
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5.5 w-9.5 rounded-full transition-colors duration-200 cursor-pointer shrink-0',
        checked ? 'bg-primary' : 'bg-surface-3 border border-line-strong',
      )}
    >
      <span
        className={cn(
          'absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200',
          checked ? 'left-[calc(100%-18px)]' : 'left-[3px]',
        )}
      />
    </button>
  )
}
