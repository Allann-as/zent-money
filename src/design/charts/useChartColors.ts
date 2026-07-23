import { useMemo } from 'react'
import { useUiStore } from '@/store/uiStore'
import { BLOCK_OF } from '@/design/blocks'

export interface ChartColors {
  ink: string
  inkSoft: string
  inkFaint: string
  border: string
  surface: string
  surface2: string
  primary: string
  pos: string
  neg: string
  warn: string
  series: string[]
}

/**
 * Lê as cores do tema ATIVO no momento do render (§3): os gráficos nunca
 * usam cor fixa. Recalcula quando o tema OU o bloco de cor mudam.
 *
 * ── POR QUE `--primary-still`, e não `--primary` (R10 §2) ────────────────
 * A primária é uma custom property registrada e ANIMADA: durante os 450ms da
 * troca de bloco ela vale uma cor intermediária. Um gráfico que monta nesse
 * intervalo (e todos montam — a página remonta ao trocar de seção) leria a cor
 * do meio do caminho e congelaria nela, porque a string já foi para dentro do
 * SVG. `--primary-still` é o gêmeo NÃO animado do mesmo valor: o gráfico nasce
 * direto na cor final do bloco enquanto o entorno atravessa.
 *
 * Todos os outros tokens lidos aqui (--pos, --neg, --surface, --border,
 * --chart-*) ficam FORA da lista animada justamente por isto — ver a nota
 * "o que anima e o que estala" em tokens.css.
 *
 * A leitura só é correta porque `data-block` é aplicado na AÇÃO de navegação
 * (uiStore.setView), antes do React renderizar a seção nova. Se fosse aplicado
 * num efeito, o efeito rodaria DEPOIS deste render e o gráfico nasceria com a
 * paleta da seção anterior.
 */
export function useChartColors(): ChartColors {
  const theme = useUiStore((s) => s.theme)
  const block = BLOCK_OF[useUiStore((s) => s.activeView)]
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
      primary: v('--primary-still'),
      pos: v('--pos'),
      neg: v('--neg'),
      warn: v('--warn'),
      series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--chart-${i}`)),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, block])
}
