import { useId, useRef, useState, type ReactNode } from 'react'
import { useChartColors } from './useChartColors'
import { ChartTip, niceMax, type TipState } from './ChartTip'
import { formatBRLCompact } from '@/engine/money'
import { usePrivacy } from '@/design/money'

export interface LinePoint {
  label: string
  value: number
  /** Conteúdo extra do tooltip (ex.: valor formatado + detalhe). */
  tip?: ReactNode
}

/**
 * Gráfico de linha/área com gradiente, gridlines e tooltip.
 * Todas as cores vêm do tema ativo no momento do render.
 */
export function LineArea({
  data,
  color,
  height = 220,
  formatValue = formatBRLCompact,
}: {
  data: LinePoint[]
  color?: string
  height?: number
  formatValue?(v: number): string
}): ReactNode {
  const colors = useChartColors()
  const privacy = usePrivacy()
  const stroke = color ?? colors.primary
  const gradId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<TipState | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const W = 800
  const H = height
  const PAD_L = 56
  const PAD_R = 12
  const PAD_T = 14
  const PAD_B = 26

  if (data.length === 0) return null

  const max = niceMax(Math.max(...data.map((d) => d.value), 1))
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0
  const x = (i: number): number => PAD_L + (data.length > 1 ? i * stepX : innerW / 2)
  const y = (v: number): number => PAD_T + innerH - (v / max) * innerH

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ')
  const areaPath = `${linePath} L ${x(data.length - 1)} ${PAD_T + innerH} L ${x(0)} ${PAD_T + innerH} Z`
  const gridLines = [0.25, 0.5, 0.75, 1]

  function onMove(e: React.MouseEvent<SVGSVGElement>): void {
    if (privacy) return // sem tooltip de valor no modo privacidade (M2 §a)
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const idx = Math.round((px - PAD_L) / (stepX || 1))
    const clamped = Math.max(0, Math.min(data.length - 1, idx))
    const d = data[clamped]
    if (!d) return
    setHoverIdx(clamped)
    setTip({
      x: (x(clamped) / W) * rect.width,
      y: (y(d.value) / H) * rect.height,
      content: d.tip ?? (
        <>
          <span className="text-ink-soft">{d.label}</span>
          <br />
          <strong className="text-ink tnum">{formatValue(d.value)}</strong>
        </>
      ),
    })
  }

  // rótulos do eixo X: primeiro, últimos e alguns intermediários
  const labelEvery = Math.max(1, Math.ceil(data.length / 6))

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        onMouseMove={onMove}
        onMouseLeave={() => {
          setTip(null)
          setHoverIdx(null)
        }}
        role="img"
        aria-label="Gráfico de evolução"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="1" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {gridLines.map((g) => (
          <g key={g}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(max * g)}
              y2={y(max * g)}
              stroke={colors.border}
              strokeWidth="1"
              strokeDasharray="3 5"
            />
            <text
              x={PAD_L - 8}
              y={y(max * g) + 3.5}
              textAnchor="end"
              fontSize="10.5"
              fill={colors.inkFaint}
              className="tnum"
            >
              {privacy ? '' : formatValue(max * g)}
            </text>
          </g>
        ))}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={PAD_T + innerH}
          y2={PAD_T + innerH}
          stroke={colors.border}
          strokeWidth="1"
        />

        <path d={areaPath} fill={`url(#${gradId})`} className="anim-fade-in" />
        {/* a linha "se escreve" na primeira renderização (§5) */}
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="2.25"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          style={{ animation: 'zent-draw 700ms var(--ease-out-quint) both' }}
        />

        {hoverIdx !== null && data[hoverIdx] && (
          <g>
            <line
              x1={x(hoverIdx)}
              x2={x(hoverIdx)}
              y1={PAD_T}
              y2={PAD_T + innerH}
              stroke={colors.inkFaint}
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <circle
              cx={x(hoverIdx)}
              cy={y(data[hoverIdx].value)}
              r="4.5"
              fill={stroke}
              stroke={colors.surface}
              strokeWidth="2"
            />
          </g>
        )}

        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="10.5"
              fill={colors.inkFaint}
            >
              {d.label}
            </text>
          ) : null,
        )}
      </svg>
      <ChartTip tip={tip} />
    </div>
  )
}
