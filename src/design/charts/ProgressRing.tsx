import type { ReactNode } from 'react'
import { useChartColors } from './useChartColors'
import { RingCenter } from '@/design/RingCenter'
import { innerRadiusPx } from '@/design/ringGeometry'

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
      {/**
       * O miolo passou a ser um <RingCenter>: antes era `inset-0` com margem
       * NENHUMA, ou seja, a área útil declarada era o quadrado inteiro que
       * contém o círculo. Qualquer conteúdo um pouco largo encostava no anel
       * — e nas quebras de cima e de baixo, onde o círculo é mais estreito,
       * encostava muito antes de "encher" a largura.
       */}
      <RingCenter innerRadius={innerRadiusPx(size, thickness)}>{children}</RingCenter>
    </div>
  )
}
