import type { ReactNode } from 'react'
import { useChartColors } from './useChartColors'

/** Anel de progresso animado — assinatura visual das Caixinhas. */
export function ProgressRing({
  ratio,
  size = 120,
  thickness = 9,
  color,
  children,
}: {
  /** 0..1 (valores acima de 1 são tratados como completo). */
  ratio: number
  size?: number
  thickness?: number
  color?: string
  children?: ReactNode
}): ReactNode {
  const colors = useChartColors()
  const stroke = color ?? colors.primary
  const clamped = Math.max(0, Math.min(1, ratio))
  const R = 50 - thickness / 2
  const C = 2 * Math.PI * R

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <circle cx="50" cy="50" r={R} fill="none" stroke={colors.surface2} strokeWidth={thickness} />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={stroke}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - clamped)}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}
