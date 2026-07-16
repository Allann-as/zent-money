import { useMemo } from 'react'
import { useUiStore } from '@/store/uiStore'

export interface ChartColors {
  ink: string
  inkSoft: string
  inkFaint: string
  border: string
  surface: string
  surface2: string
  primary: string
  accent: string
  pos: string
  neg: string
  warn: string
  series: string[]
}

/**
 * Lê as cores do tema ATIVO no momento do render (§3): os gráficos nunca
 * usam cor fixa. Recalcula quando o tema muda (dependência no uiStore).
 */
export function useChartColors(): ChartColors {
  const theme = useUiStore((s) => s.theme)
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement)
    const v = (name: string): string => style.getPropertyValue(name).trim()
    return {
      ink: v('--ink'),
      inkSoft: v('--ink-soft'),
      inkFaint: v('--ink-faint'),
      border: v('--border'),
      surface: v('--surface'),
      surface2: v('--surface-2'),
      primary: v('--primary'),
      accent: v('--accent'),
      pos: v('--pos'),
      neg: v('--neg'),
      warn: v('--warn'),
      series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--chart-${i}`)),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])
}
