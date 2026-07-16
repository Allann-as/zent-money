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
      className="absolute z-10 pointer-events-none bg-surface-3 border border-line-strong rounded-[9px] shadow-pop px-3 py-2 text-[12px] leading-snug anim-fade-in whitespace-nowrap"
      style={{ left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - 10px))' }}
      role="status"
    >
      {tip.content}
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
