import type { ReactNode } from 'react'

export interface TipState {
  x: number
  y: number
  content: ReactNode
}

/**
 * Tooltip suave dos gráficos — posicionado dentro do container relativo
 * do gráfico, seguindo o ponto/barra sob o cursor.
 */
export function ChartTip({ tip }: { tip: TipState | null }): ReactNode {
  if (!tip) return null
  return (
    <div
      className="absolute z-10 pointer-events-none anim-fade-in"
      style={{ left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - 12px))' }}
      role="status"
    >
      {/* Tooltip universal (M3 §Gráficos): card raio 12, borda luminosa no topo,
          sombra dupla — o mesmo cartão em todos os gráficos do app. */}
      <div className="card-topline relative bg-surface-3 border border-line-strong rounded-[12px] shadow-pop px-3 py-2 text-[12px] leading-snug whitespace-nowrap">
        {tip.content}
      </div>
      {/* seta apontando para o ponto/barra */}
      <span
        aria-hidden="true"
        className="absolute left-1/2 -bottom-[5px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-surface-3 border-b border-r border-line-strong"
      />
    </div>
  )
}

/**
 * Conteúdo padrão do tooltip universal (M3): título em caps, valor tabular
 * grande e, opcionalmente, um delta % colorido pelo sinal.
 */
export function TipContent({
  title,
  value,
  delta,
}: {
  title: string
  value: string
  delta?: { text: string; positive: boolean } | null
}): ReactNode {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{title}</span>
      <strong className="font-display text-[15px] font-bold text-ink tnum leading-none">{value}</strong>
      {delta ? (
        <span className={`text-[11px] font-semibold tnum ${delta.positive ? 'text-pos' : 'text-neg'}`}>
          {delta.text}
        </span>
      ) : null}
    </div>
  )
}

/** Escala "bonita" para o eixo Y: retorna um máximo arredondado. */
export function niceMax(rawMax: number): number {
  if (rawMax <= 0) return 1
  const exp = Math.floor(Math.log10(rawMax))
  const base = Math.pow(10, exp)
  const norm = rawMax / base
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  return nice * base
}
