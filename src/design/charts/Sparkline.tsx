import { useId, type ReactNode } from 'react'
import { useChartColors } from './useChartColors'

/** Mini-linha sem eixos para heros e cards compactos. */
export function Sparkline({
  values,
  color,
  width = 160,
  height = 44,
  filled = true,
}: {
  values: number[]
  color?: string
  width?: number
  height?: number
  filled?: boolean
}): ReactNode {
  const colors = useChartColors()
  const stroke = color ?? colors.primary
  const gradId = useId()

  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const PAD = 3
  const x = (i: number): number => PAD + (i / (values.length - 1)) * (width - PAD * 2)
  const y = (v: number): number => PAD + (1 - (v - min) / range) * (height - PAD * 2)

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L ${x(values.length - 1).toFixed(1)} ${height} L ${x(0).toFixed(1)} ${height} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {filled && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={stroke} stopOpacity="0.25" />
              <stop offset="1" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradId})`} />
        </>
      )}
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      {/* ponto final pulsando UMA vez (M3 §Cards) */}
      <circle
        cx={x(values.length - 1)}
        cy={y(values[values.length - 1] ?? 0)}
        r="2.6"
        fill={stroke}
        className="anim-spark-pulse"
      />
    </svg>
  )
}
