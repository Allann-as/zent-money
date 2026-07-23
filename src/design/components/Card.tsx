import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Card do app — a superfície onde o conteúdo vive.
 *
 * ── VÉU SOBRE O CÉU (R10 §1.7) ──────────────────────────────────────────
 * Com o céu de galáxia atrás de tudo, um card 100% opaco resolve a
 * legibilidade mas apaga o céu na área que mais ocupa a tela: o resultado é um
 * campo de estrelas que só existe nas margens, e não um céu contínuo. Por isso
 * a superfície é translúcida (`--card-veil`, .72 no escuro / .82 no claro,
 * dentro da faixa .6–.72 do §) com um blur leve por trás.
 *
 * A regra que manda aqui é a do §1.7: legibilidade acima de tudo, e quem cede é
 * o CARD, nunca o céu. Se um texto sofrer, este número sobe; a intensidade das
 * estrelas não desce.
 *
 * ── O BLUR FOI MEDIDO E REPROVADO ───────────────────────────────────────
 * O § pede "translúcido com leve blur", e a versão com `backdrop-filter:
 * blur(6px)` chegou a existir aqui. Com 50 mil lançamentos ela custou
 * **148ms por clique** ao navegar meses, contra 120ms sem ela (baseline da
 * v2.1: ~124ms). O motivo é específico desta release: `backdrop-filter` obriga
 * o compositor a reamostrar e desfocar o que está ATRÁS do elemento sempre que
 * aquilo muda — e o que está atrás agora é um céu que se mexe a cada frame.
 * São dezenas de cards × 60 vezes por segundo recalculando desfoque.
 *
 * É a lição do M3 outra vez (lá foram divs de 900px com blur-3xl), e a regra
 * que vale é a que o Allan aprovou: se custar FPS, o céu — e o enfeite do céu —
 * perde para o conteúdo. Ficou a translucidez, que entrega o efeito procurado
 * (o céu lido como contínuo por trás dos cards) e custa zero.
 */
export function Card({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>): ReactNode {
  return (
    <div
      className={cn(
        'border border-line rounded-card shadow-card theme-transition',
        'bg-[color-mix(in_srgb,var(--surface)_calc(var(--card-veil)*100%),transparent)]',
        className,
      )}
      {...rest}
    />
  )
}

export function CardTitle({
  className,
  ...rest
}: HTMLAttributes<HTMLHeadingElement>): ReactNode {
  return (
    <h2
      className={cn('font-display text-[15px] font-semibold text-ink tracking-tight', className)}
      {...rest}
    />
  )
}
