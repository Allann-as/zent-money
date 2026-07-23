import { useState, type ReactNode } from 'react'
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

export interface BarGroup {
  label: string
  /** 1 valor = barra simples; 2+ = barras pareadas. Aceita negativos. */
  values: number[]
  tip?: ReactNode
}

/**
 * Barras verticais (simples ou pareadas) com topo arredondado (padrão da
 * referência), baseline em zero, suporte a negativos, gridlines e tooltip.
 */
export function Bars({
  data,
  colors: seriesColors,
  height = 220,
  formatValue = formatBRLCompact,
  colorFor,
}: {
  data: BarGroup[]
  /** Cores por série (barras pareadas). Default: primary. */
  colors?: string[]
  height?: number
  formatValue?(v: number): string
  /** Cor por barra individual (série única) — ex.: verde/vermelho por sinal. */
  colorFor?(group: BarGroup, value: number): string
}): ReactNode {
  const theme = useChartColors()
  const privacy = usePrivacy()
  const [tip, setTip] = useState<TipState | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const W = 800
  const H = height
  const PAD_R = 12
  const PAD_T = 14
  const PAD_B = 26

  if (data.length === 0) return null

  const allValues = data.flatMap((d) => d.values)
  const maxPos = niceMax(Math.max(...allValues, 0, 1))
  const minNegRaw = Math.min(...allValues, 0)
  const maxNeg = minNegRaw < 0 ? niceMax(-minNegRaw) : 0
  const gridLines = [0.5, 1]

  /**
   * Gutter do eixo Y MEDIDO — mesma correção do LineArea. Com `PAD_L` fixo em
   * 56, "R$ 25 mi" (82px na fonte real) era desenhado a partir de `PAD_L − 8` e
   * saía 19px pela esquerda do gráfico. O eixo negativo conta junto: ele tem as
   * mesmas etiquetas com um sinal a mais, que é o caso mais largo.
   */
  const PAD_L = Math.max(
    56,
    ...gridLines.flatMap((g) => [
      measureText(formatValue(maxPos * g), AXIS_FONT, 400) + 16,
      maxNeg > 0 ? measureText(formatValue(-maxNeg * g), AXIS_FONT, 400) + 16 : 0,
    ]),
  )

  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const total = maxPos + maxNeg
  const zeroY = PAD_T + (maxPos / total) * innerH
  const scale = innerH / total

  const nSeries = Math.max(...data.map((d) => d.values.length))
  const groupW = innerW / data.length
  const barGap = Math.min(6, groupW * 0.15)
  const barW = Math.max(3, (groupW - barGap * 2) / nSeries)

  const palette = seriesColors ?? [theme.primary, theme.neg]

  function showTip(e: React.MouseEvent<SVGElement>, gi: number): void {
    if (privacy) return // sem tooltip de valor no modo privacidade (M2 §a)
    const g = data[gi]
    if (!g) return
    const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (!rect) return
    const cx = PAD_L + gi * groupW + groupW / 2
    setHover(gi)
    setTip({
      x: (cx / W) * rect.width,
      y: ((zeroY - Math.max(...g.values, 0) * scale) / H) * rect.height,
      content: g.tip ?? (
        <>
          <span className="text-ink-soft">{g.label}</span>
          <br />
          <strong className="text-ink tnum">{formatValue(g.values[0] ?? 0)}</strong>
        </>
      ),
    })
  }

  const labelEvery = Math.max(1, Math.ceil(data.length / 12))

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        onMouseLeave={() => {
          setTip(null)
          setHover(null)
        }}
        role="img"
        aria-label="Gráfico de barras"
      >
        {gridLines.map((g) => (
          <g key={`p${g}`}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={zeroY - maxPos * g * scale}
              y2={zeroY - maxPos * g * scale}
              stroke={theme.border}
              strokeWidth="1"
              strokeDasharray="3 5"
            />
            <text
              x={PAD_L - 8}
              y={zeroY - maxPos * g * scale + 3.5}
              textAnchor="end"
              style={{ fontSize: AXIS_FONT }}
              fill={theme.inkFaint}
              className="tnum"
            >
              {privacy ? '' : formatValue(maxPos * g)}
            </text>
          </g>
        ))}
        {maxNeg > 0 &&
          gridLines.map((g) => (
            <g key={`n${g}`}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={zeroY + maxNeg * g * scale}
                y2={zeroY + maxNeg * g * scale}
                stroke={theme.border}
                strokeWidth="1"
                strokeDasharray="3 5"
              />
              <text
                x={PAD_L - 8}
                y={zeroY + maxNeg * g * scale + 3.5}
                textAnchor="end"
                style={{ fontSize: AXIS_FONT }}
                fill={theme.inkFaint}
                className="tnum"
              >
                {privacy ? '' : formatValue(-maxNeg * g)}
              </text>
            </g>
          ))}
        <line x1={PAD_L} x2={W - PAD_R} y1={zeroY} y2={zeroY} stroke={theme.border} strokeWidth="1.25" />

        {data.map((g, gi) => (
          <g
            key={gi}
            opacity={hover === null || hover === gi ? 1 : 0.45}
            style={{
              transition: 'opacity 120ms, filter 120ms',
              // hover +15% de brilho no grupo sob o cursor (M3 §Gráficos)
              filter: hover === gi ? 'brightness(1.15)' : undefined,
            }}
          >
            {g.values.map((v, si) => {
              const bx = PAD_L + gi * groupW + barGap + si * barW
              const h = Math.max(0.5, Math.abs(v) * scale)
              const w = Math.max(1, barW - 1.5)
              const fill = colorFor ? colorFor(g, v) : (palette[si] ?? theme.primary)
              // topo arredondado 6px (M3); barras negativas arredondam a ponta de baixo
              const r = Math.min(w / 2, 6, h)
              const d =
                v >= 0
                  ? `M ${bx} ${zeroY} v ${-(h - r)} q 0 ${-r} ${r} ${-r} h ${w - 2 * r} q ${r} 0 ${r} ${r} v ${h - r} Z`
                  : `M ${bx} ${zeroY} v ${h - r} q 0 ${r} ${r} ${r} h ${w - 2 * r} q ${r} 0 ${r} ${-r} v ${-(h - r)} Z`
              // barras "sobem" na primeira renderização (§5) — transform GPU-friendly
              return (
                <path
                  key={si}
                  d={d}
                  fill={fill}
                  onMouseMove={(e) => showTip(e, gi)}
                  style={{
                    transformBox: 'fill-box',
                    transformOrigin: v >= 0 ? 'bottom' : 'top',
                    animation: `zent-bar-grow 420ms var(--ease-out-quint) ${Math.min(gi * 14, 260)}ms both`,
                  }}
                />
              )
            })}
            {/* área de hover cobrindo o grupo inteiro */}
            <rect
              x={PAD_L + gi * groupW}
              y={PAD_T}
              width={groupW}
              height={innerH}
              fill="transparent"
              onMouseMove={(e) => showTip(e, gi)}
            />
          </g>
        ))}

        {data.map((g, gi) =>
          gi % labelEvery === 0 || gi === data.length - 1 ? (
            <text
              key={gi}
              x={PAD_L + gi * groupW + groupW / 2}
              y={H - 8}
              textAnchor="middle"
              style={{ fontSize: AXIS_FONT }}
              fill={theme.inkFaint}
            >
              {g.label}
            </text>
          ) : null,
        )}
      </svg>
      <ChartTip tip={tip} />
    </div>
  )
}
