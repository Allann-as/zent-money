import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MARCA ZENT MONEY — "ASCENSÃO" (R10 §3, definitiva)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Um Z desenhado em traço contínuo cuja perna final se levanta e vira uma linha
 * de alta. Monocromática por natureza: usa `currentColor`, então herda sozinha a
 * primária do bloco de cor ativo (§2) e funciona nos dois temas.
 *
 * ── NÃO REDESENHAR ──────────────────────────────────────────────────────
 * Os dois `d` e os dois pesos (2.2 no Z, 1.8 na linha de ascensão) são a marca
 * APROVADA, no viewBox 40×40 original. Não "melhore" os pontos, não unifique os
 * pesos, não arredonde de outro jeito: qualquer ajuste aqui muda a identidade
 * do produto em todo lugar de uma vez (app, bloqueio, ícone, instalador).
 * A única variação permitida é o engrossamento ÓPTICO em tamanhos pequenos —
 * ver `bold` abaixo, que existe porque abaixo de ~24px o traço fino some.
 */

/** Pesos da marca. `bold` só para ≤24px, onde o traço original desaparece. */
const STROKE = { normal: { z: 2.2, rise: 1.8 }, bold: { z: 2.6, rise: 2.2 } }

/** Só o símbolo (currentColor) — para usos inline. */
export function ZentMark({
  size = 20,
  className,
}: {
  size?: number
  className?: string
}): ReactNode {
  // Engrossamento óptico automático: quem pede um mark de 16px não deveria
  // precisar saber que existe uma variante mais gorda.
  const w = size <= 24 ? STROKE.bold : STROKE.normal
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={w.z}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M9 11h17L9 27h12" />
      <path d="M21 27l5-5 4 3 6-9" strokeWidth={w.rise} />
    </svg>
  )
}

/** Chip quadrado com o símbolo — mesmo desenho do ícone do app. */
export function ZentLogo({ size = 34 }: { size?: number }): ReactNode {
  return (
    <span
      className="relative inline-flex items-center justify-center rounded-[12px] bg-surface-2 border border-line-strong text-primary shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* halo leve, como no ícone do app */}
      <span
        className="absolute inset-0 rounded-[12px] pointer-events-none"
        style={{ boxShadow: 'inset 0 0 12px -4px color-mix(in srgb, var(--primary) 40%, transparent)' }}
      />
      <ZentMark size={Math.round(size * 0.72)} />
    </span>
  )
}

/**
 * Símbolo + wordmark "Zent Money" (sidebar expandida, sobre).
 * "Zent" em 800 no texto; "Money" em 600 na primária (§3).
 */
export function ZentWordmark({ className }: { className?: string }): ReactNode {
  return (
    <span className={cn('inline-flex items-center gap-2 min-w-0', className)}>
      <ZentMark size={20} className="text-primary shrink-0" />
      <span className="font-display text-[15px] tracking-tight whitespace-nowrap truncate">
        <span className="font-extrabold text-ink">Zent</span>{' '}
        <span className="font-semibold text-primary">Money</span>
      </span>
    </span>
  )
}
