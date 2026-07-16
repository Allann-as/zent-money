import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}): ReactNode {
  return (
    <header className="flex items-end justify-between gap-4 mb-5">
      <div>
        <h1 className="font-display text-[22px] font-bold text-ink tracking-tight leading-tight">
          {title}
        </h1>
        {subtitle ? <p className="text-[13px] text-ink-soft mt-0.5">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </header>
  )
}
