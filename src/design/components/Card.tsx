import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Card({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>): ReactNode {
  return (
    <div
      className={cn(
        'bg-surface border border-line rounded-card shadow-card theme-transition',
        className,
      )}
      {...rest}
    />
  )
}

export function CardTitle({
  className,
  ...rest
}: HTMLAttributes<HTMLHeadingElement>): ReactNode {
  return (
    <h2
      className={cn('font-display text-[15px] font-semibold text-ink tracking-tight', className)}
      {...rest}
    />
  )
}
