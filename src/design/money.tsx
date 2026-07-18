import { type ReactNode } from 'react'
import { useUiStore } from '@/store/uiStore'
import { formatBRL, formatBRLCompact } from '@/engine/money'

/**
 * Privacidade por MÁSCARA (M2 §a) — substitui o antigo blur de CSS.
 *
 * Com o modo privacidade ligado, todo valor monetário renderiza `R$ ••••••` e o
 * **valor real nunca chega ao DOM** (nem como texto, nem em aria-label): a máscara
 * é decidida no React, não pintada por cima. É a diferença entre "escondido de
 * quem olha" (blur, que ainda expõe o número no HTML) e "ausente" (máscara).
 *
 * Toda tela que mostra dinheiro usa `useBRL()` (formatador ligado ao estado de
 * privacidade) ou `<Money>`. Campos de digitação (`MoneyInput`) NÃO são mascarados
 * — ali o usuário está justamente vendo o que digita.
 */

export const MONEY_MASK = 'R$ ••••••'

export interface MoneyFmtOpts {
  /** Formato compacto (ex.: "R$ 1,2 mil") — rótulos de eixo de gráfico. */
  compact?: boolean
}

/** Formata em BRL, ou devolve a máscara quando a privacidade está ligada (puro). */
export function maskBRL(cents: number, privacy: boolean, opts: MoneyFmtOpts = {}): string {
  if (privacy) return MONEY_MASK
  return opts.compact ? formatBRLCompact(cents) : formatBRL(cents)
}

/**
 * Hook: um formatador de BRL que respeita o modo privacidade. Assinar o `privacy`
 * do store faz os valores trocarem para a máscara (e voltarem) na hora do toggle.
 */
export function useBRL(): (cents: number, opts?: MoneyFmtOpts) => string {
  const privacy = useUiStore((s) => s.privacy)
  return (cents, opts) => maskBRL(cents, privacy, opts)
}

/** true quando o modo privacidade está ligado — para gráficos esconderem rótulos/tooltips. */
export function usePrivacy(): boolean {
  return useUiStore((s) => s.privacy)
}

/** Valor monetário como elemento, já mascarado sob privacidade. */
export function Money({ cents, compact, className }: { cents: number; compact?: boolean; className?: string }): ReactNode {
  const brl = useBRL()
  return <span className={className}>{brl(cents, { compact: compact ?? false })}</span>
}
