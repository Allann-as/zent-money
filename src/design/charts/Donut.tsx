import { useState, type ReactNode } from 'react'
import { useChartColors } from './useChartColors'
import { formatBRL, formatPercent } from '@/engine/money'
import { cn } from '@/lib/cn'

export interface DonutSlice {
  id: string
  label: string
  value: number
  color: string
}

/**
 * Rosca interativa com legenda (valor e %) — hover destaca a fatia
 * tanto no anel quanto na legenda.
 */
export function Donut({
  slices,
  size = 190,
  thickness = 26,
  centerTitle,
  centerValue,
}: {
  slices: DonutSlice[]
  size?: number
  thickness?: number
  centerTitle?: string
  centerValue?: string
}): ReactNode {
  const colors = useChartColors()
  const [hover, setHover] = useState<string | null>(null)

  const total = slices.reduce((a, s) => a + s.value, 0)
  const R = 50 - thickness / 4
  const C = 2 * Math.PI * R
  let offset = 0

  const hovered = slices.find((s) => s.id === hover)

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Composição">
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={colors.surface2}
            strokeWidth={thickness / 2}
          />
          {total > 0 &&
            slices.map((s) => {
              const frac = s.value / total
              const dash = frac * C
              const el = (
                <circle
                  key={s.id}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hover === s.id ? thickness / 2 + 2 : thickness / 2}
                  strokeDasharray={`${Math.max(0, dash - 1)} ${C - dash + 1}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  transform="rotate(-90 50 50)"
                  opacity={hover === null || hover === s.id ? 1 : 0.35}
                  style={{ transition: 'opacity 150ms, stroke-width 150ms', cursor: 'pointer' }}
                  onMouseEnter={() => setHover(s.id)}
                  onMouseLeave={() => setHover(null)}
                />
              )
              offset += dash
              return el
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-6">
          <span className="text-[11px] text-ink-faint leading-tight">
            {hovered ? hovered.label : centerTitle}
          </span>
          <span className="font-display text-[15px] font-bold text-ink tnum leading-tight mt-0.5">
            {hovered ? formatBRL(hovered.value) : centerValue}
          </span>
          {hovered && total > 0 && (
            <span className="text-[11px] text-ink-soft tnum">
              {formatPercent(hovered.value / total, 1)}
            </span>
          )}
        </div>
      </div>

      {/* Legenda: valor e % */}
      <ul className="flex flex-col gap-1.5 min-w-0 flex-1">
        {slices.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={cn(
                'w-full flex items-center gap-2 text-[12.5px] rounded-[7px] px-1.5 py-1 cursor-pointer transition-colors',
                hover === s.id ? 'bg-surface-2' : 'hover:bg-surface-2',
              )}
              onMouseEnter={() => setHover(s.id)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-ink truncate">{s.label}</span>
              <span className="ml-auto text-ink font-semibold tnum shrink-0">{formatBRL(s.value)}</span>
              <span className="text-ink-faint tnum w-11 text-right shrink-0">
                {total > 0 ? formatPercent(s.value / total, 0) : '—'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
