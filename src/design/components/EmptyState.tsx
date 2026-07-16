import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Ilustração dos estados vazios (§4): um painel em traço fino com uma série
 * "por vir" pontilhada e uma base de dados vazia. É UMA cena, parametrizada
 * pelo ícone da seção — dá cara de produto sem exigir um desenho diferente
 * para cada um dos ~12 estados vazios do app (que envelheceriam separados).
 * Tudo em currentColor e traço 1.5px, como o resto do set de ícones.
 */
function EmptyIllustration({ icon: Icon }: { icon: LucideIcon }): ReactNode {
  return (
    <div className="relative mb-4" aria-hidden="true">
      <svg
        width="128"
        height="76"
        viewBox="0 0 128 76"
        fill="none"
        className="text-ink-faint/45"
      >
        {/* painel */}
        <rect
          x="1"
          y="1"
          width="126"
          height="74"
          rx="10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          opacity="0.7"
        />
        {/* base do gráfico */}
        <path d="M14 60H114" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        {/* série "por vir": sobe da esquerda para a direita */}
        <path
          d="M18 52C30 52 34 40 46 40C58 40 62 28 74 28C86 28 90 20 110 20"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="3 5"
        />
        {/* marcos do eixo */}
        {[18, 46, 74, 110].map((x) => (
          <path
            key={x}
            d={`M${x} 60V64`}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.45"
          />
        ))}
      </svg>
      {/* ícone da seção no chip padrão do app, sobre a cena */}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="h-11 w-11 rounded-[13px] bg-primary-soft border border-line flex items-center justify-center backdrop-blur-[1px]">
          <Icon size={20} className="text-primary" />
        </span>
      </span>
    </div>
  )
}

/** Área vazia desenhada — nunca deixar um espaço em branco sem explicação. */
export function EmptyState({
  icon,
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
      <EmptyIllustration icon={icon} />
      <p className="font-display text-[14.5px] font-semibold text-ink">{title}</p>
      {description ? (
        <p className="text-[13px] text-ink-soft mt-1.5 max-w-[340px] leading-relaxed">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
