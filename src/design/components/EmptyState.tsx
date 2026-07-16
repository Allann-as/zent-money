import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Área vazia desenhada — nunca deixar um espaço em branco sem explicação. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}): ReactNode {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-10 px-6', className)}>
      <div className="h-12 w-12 rounded-[14px] bg-primary-soft flex items-center justify-center mb-3.5">
        <Icon size={22} className="text-primary" />
      </div>
      <p className="font-display text-[14.5px] font-semibold text-ink">{title}</p>
      {description ? (
        <p className="text-[13px] text-ink-soft mt-1.5 max-w-[340px] leading-relaxed">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
