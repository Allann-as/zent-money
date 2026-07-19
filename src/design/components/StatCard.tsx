import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Card } from './Card'

/**
 * Card de estatística — padrão único do app (§3): chip de ícone arredondado
 * em violeta translúcido no topo, número grande em bold, rótulo curto abaixo.
 */
export function StatCard({
  icon: Icon,
  value,
  label,
  detail,
  tone = 'default',
  className,
}: {
  icon: LucideIcon
  value: ReactNode
  label: string
  /** Linha de apoio opcional (ex.: "34% da renda"). */
  detail?: ReactNode
  /** Cor do número: default (ink) | pos | neg | warn | primary. */
  tone?: 'default' | 'pos' | 'neg' | 'warn' | 'primary'
  className?: string
}): ReactNode {
  const toneClass =
    tone === 'pos'
      ? 'text-pos'
      : tone === 'neg'
        ? 'text-neg'
        : tone === 'warn'
          ? 'text-warn'
          : tone === 'primary'
            ? 'text-primary'
            : 'text-ink'
  return (
    <Card className={cn('p-5 card-hover card-topline', className)}>
      <span className="chip-glow h-9.5 w-9.5 rounded-[12px] bg-primary-soft inline-flex items-center justify-center">
        <Icon size={17} className="text-primary" />
      </span>
      <p className={cn('font-display text-[24px] font-bold tnum mt-3 leading-tight', toneClass)}>
        {value}
      </p>
      <p className="label-caps mt-1">{label}</p>
      {detail ? <p className="text-[11.5px] text-ink-faint tnum mt-0.5">{detail}</p> : null}
    </Card>
  )
}
