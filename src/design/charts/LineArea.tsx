import { useId, useRef, useState, type ReactNode } from 'react'
import { useChartColors } from './useChartColors'
import { measureText } from '@/design/ringGeometry'
import { ChartTip, niceMax, type TipState } from './ChartTip'
import { formatBRLCompact } from '@/engine/money'
import { usePrivacy } from '@/design/money'

/**
 * Tamanho de fonte por STYLE, e não por atributo (robustez de magnitude).
 *
 * `.tnum` traz `font-size: 0.95em`, e CSS vence atributo de apresentação: todo
 * `fontSize="10.5"` destes gráficos vinha sendo renderizado a ~13,3 unidades —
 * 27% maior que o pretendido. Isso não só engordava as etiquetas do eixo como
 * fazia qualquer cálculo de gutter baseado no 10.5 subestimar a largura real,
 * que é como os rótulos de milhão passaram a sair para fora do gráfico.
 */
const AXIS_FONT = 10.5

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
  const PAD_R = 12
  const PAD_T = 14
  const PAD_B = 26

  if (data.length === 0) return null

  const max = niceMax(Math.max(...data.map((d) => d.value), 1))

  /**
   * ── GUTTER DO EIXO Y MEDIDO, NÃO CHUTADO (robustez de magnitude) ────────
   * `PAD_L` era 56 fixo. Com valores grandes, "R$ 187,5 mi" a 10,5px mede ~54px
   * e é desenhado com `textAnchor="end"` a partir de `PAD_L − 8`: sobrava
   * −6, ou seja, o rótulo saía PELA ESQUERDA do próprio gráfico. O teste de
   * estresse pegou isso em todas as magnitudes acima de milhão.
   *
   * Agora o gutter é a maior etiqueta realmente formatada, medida na fonte
   * real, com 8px de folga — e nunca menor que os 56 originais, para gráficos
   * de valores pequenos não ficarem com o eixo colado no canto.
   */
  const gridLines = [0.25, 0.5, 0.75, 1]
  const PAD_L = Math.max(
    56,
    ...gridLines.map((g) => measureText(formatValue(max * g), AXIS_FONT, 400) + 16),
  )

  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0
  const x = (i: number): number => PAD_L + (data.length > 1 ? i * stepX : innerW / 2)
  const y = (v: number): number => PAD_T + innerH - (v / max) * innerH

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ')
  const areaPath = `${linePath} L ${x(data.length - 1)} ${PAD_T + innerH} L ${x(0)} ${PAD_T + innerH} Z`

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
          {/* área 18→0 (M3 §Gráficos) */}
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={stroke} stopOpacity="0.18" />
            <stop offset="1" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
          {/* drop-shadow 4px a 30% sob a linha (M3 §Gráficos) */}
          <filter id={`${gradId}-sh`} x="-10%" y="-20%" width="120%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor={stroke} floodOpacity="0.3" />
          </filter>
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
              style={{ fontSize: AXIS_FONT }}
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
        {/* a linha "se escreve" na primeira renderização — 2.5px com drop-shadow (M3) */}
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${gradId}-sh)`}
          pathLength={1}
          strokeDasharray={1}
          style={{ animation: 'zent-draw 600ms var(--ease-out-quint) both' }}
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
              style={{ fontSize: AXIS_FONT }}
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
