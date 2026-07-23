import { useId, useRef, useState, type ReactNode } from 'react'
import { useChartColors } from './useChartColors'
import { measureText } from '@/design/ringGeometry'
import { ChartTip, niceMax, type TipState } from './ChartTip'
import { formatBRLCompact } from '@/engine/money'
import { usePrivacy } from '@/design/money'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ÁREA CONTÍNUA COM SINAL (R10 §⑥) — "Sobra mês a mês"
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Substitui as barras com pastilhas soltas abaixo do eixo. Uma linha só, do
 * primeiro ao último mês, com o preenchimento tomando a cor do LADO em que
 * está: menta acima do zero, coral abaixo. A leitura que isso entrega e a de
 * barras não entrega é a **travessia** — o mês em que a curva cruza o zero.
 *
 * ── COMO OS DOIS DEGRADÊS SÃO FEITOS ────────────────────────────────────
 * Uma área só, fechada na LINHA DO ZERO (não no rodapé do gráfico), pintada
 * duas vezes: cada passada tem um `clipPath` retangular — um cobre tudo acima
 * do zero, o outro tudo abaixo. Não há cálculo de interseção com o eixo, então
 * a travessia sai exata por construção, inclusive quando ela cai no meio de um
 * segmento (que é quase sempre).
 *
 * O degradê de cada lado nasce OPACO no zero e some ao se afastar — é o zero
 * que precisa de peso visual, não o extremo.
 *
 * ── ESCALA ──────────────────────────────────────────────────────────────
 * `niceMax` é aplicado aos dois lados separadamente, então uma série que só
 * mergulha um pouquinho não ganha meia tela de vermelho. A linha de zero é
 * SEMPRE desenhada, mesmo quando todos os pontos são positivos: sem ela, "tudo
 * acima do zero" e "tudo abaixo" desenhariam igual.
 */

const AXIS_FONT = 10.5

export interface SignedPoint {
  label: string
  value: number
  /** Marca este ponto como recorde, com um rótulo discreto ao lado. */
  record?: string
  tip?: ReactNode
}

export function SignedArea({
  data,
  height = 240,
  formatValue = formatBRLCompact,
  goal,
}: {
  data: SignedPoint[]
  height?: number
  formatValue?(v: number): string
  /** Linha de referência (ex.: meta de 30% de poupança). */
  goal?: { value: number; label: string }
}): ReactNode {
  const colors = useChartColors()
  const privacy = usePrivacy()
  const gradId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<TipState | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const W = 800
  const H = height
  const PAD_R = 14
  const PAD_T = 18
  const PAD_B = 26

  if (data.length === 0) return null

  // A meta entra na escala: uma linha de referência fora do gráfico não
  // referencia nada.
  const rawMax = Math.max(0, ...data.map((d) => d.value), goal?.value ?? 0)
  const rawMin = Math.min(0, ...data.map((d) => d.value))
  const top = rawMax > 0 ? niceMax(rawMax) : 0
  const bottom = rawMin < 0 ? -niceMax(-rawMin) : 0
  // série toda zerada: uma faixa simbólica, para o gráfico não colapsar numa reta
  const span = top - bottom || 1

  // Etiquetas do eixo: os dois extremos, o zero e os meios de cada lado — só
  // dos lados que existem, para uma série sem negativos não anunciar um −R$ 0.
  const ticks = [
    top,
    ...(top > 0 ? [top / 2] : []),
    0,
    ...(bottom < 0 ? [bottom / 2] : []),
    ...(bottom < 0 ? [bottom] : []),
  ]

  // Gutter MEDIDO na fonte real (regra permanente de magnitude): "R$ 187,5 mi"
  // não cabe nos 56px que um dia foram constantes.
  const PAD_L = Math.max(56, ...ticks.map((t) => measureText(formatValue(t), AXIS_FONT, 400) + 16))

  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0
  const x = (i: number): number => PAD_L + (data.length > 1 ? i * stepX : innerW / 2)
  const y = (v: number): number => PAD_T + innerH - ((v - bottom) / span) * innerH
  const yZero = y(0)

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ')
  // Fecha na LINHA DO ZERO — é o que permite os dois clips pintarem o mesmo path.
  const areaPath = `${linePath} L ${x(data.length - 1)} ${yZero} L ${x(0)} ${yZero} Z`

  function onMove(e: React.MouseEvent<SVGSVGElement>): void {
    if (privacy) return // sem tooltip de valor sob privacidade (M2 §a)
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

  const labelEvery = Math.max(1, Math.ceil(data.length / 8))

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
        aria-label="Sobra mês a mês"
      >
        <defs>
          {/* Positivo: opaco no zero (embaixo), sumindo para cima */}
          <linearGradient id={`${gradId}-p`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={colors.pos} stopOpacity="0.05" />
            <stop offset="1" stopColor={colors.pos} stopOpacity="0.32" />
          </linearGradient>
          {/* Negativo: opaco no zero (em cima), sumindo para baixo */}
          <linearGradient id={`${gradId}-n`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={colors.neg} stopOpacity="0.32" />
            <stop offset="1" stopColor={colors.neg} stopOpacity="0.05" />
          </linearGradient>
          <clipPath id={`${gradId}-above`}>
            <rect x={PAD_L} y={PAD_T} width={innerW} height={Math.max(0, yZero - PAD_T)} />
          </clipPath>
          <clipPath id={`${gradId}-below`}>
            <rect x={PAD_L} y={yZero} width={innerW} height={Math.max(0, PAD_T + innerH - yZero)} />
          </clipPath>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            {t !== 0 && (
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y(t)}
                y2={y(t)}
                stroke={colors.border}
                strokeWidth="1"
                strokeDasharray="3 5"
              />
            )}
            <text
              x={PAD_L - 8}
              y={y(t) + 3.5}
              textAnchor="end"
              style={{ fontSize: AXIS_FONT }}
              fill={colors.inkFaint}
              className="tnum"
            >
              {privacy ? '' : formatValue(t)}
            </text>
          </g>
        ))}

        {/* As duas metades do MESMO path, cada uma no seu degradê */}
        <path
          d={areaPath}
          fill={`url(#${gradId}-p)`}
          clipPath={`url(#${gradId}-above)`}
          className="anim-fade-in"
        />
        <path
          d={areaPath}
          fill={`url(#${gradId}-n)`}
          clipPath={`url(#${gradId}-below)`}
          className="anim-fade-in"
        />

        {/* Meta: tracejado no acento, com o rótulo colado à direita */}
        {goal !== undefined && (
          <g>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(goal.value)}
              y2={y(goal.value)}
              stroke={colors.primary}
              strokeWidth="1.25"
              strokeDasharray="5 4"
              opacity="0.65"
            />
            <text
              x={W - PAD_R}
              y={y(goal.value) - 5}
              textAnchor="end"
              style={{ fontSize: 9.5 }}
              fill={colors.primary}
            >
              {goal.label}
            </text>
          </g>
        )}

        {/* Linha do zero: sólida e mais forte que as gridlines — é a referência */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={yZero}
          y2={yZero}
          stroke={colors.inkFaint}
          strokeWidth="1.25"
        />

        {/* Uma linha só, atravessando o zero */}
        <path
          d={linePath}
          fill="none"
          stroke={colors.primary}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          style={{ animation: 'zent-draw 600ms var(--ease-out-quint) both' }}
        />

        {/* Recordes: ponto na cor do lado + rótulo discreto */}
        {data.map((d, i) =>
          d.record === undefined ? null : (
            <g key={`rec-${i}`}>
              <circle
                cx={x(i)}
                cy={y(d.value)}
                r="4"
                fill={d.value >= 0 ? colors.pos : colors.neg}
                stroke={colors.surface}
                strokeWidth="2"
              />
              <text
                x={x(i)}
                y={d.value >= 0 ? y(d.value) - 10 : y(d.value) + 17}
                textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                style={{ fontSize: 9.5 }}
                fill={colors.inkFaint}
              >
                {d.record}
              </text>
            </g>
          ),
        )}

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
              fill={data[hoverIdx].value >= 0 ? colors.pos : colors.neg}
              stroke={colors.surface}
              strokeWidth="2"
            />
          </g>
        )}

        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text
              key={`lbl-${i}`}
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
