import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Card } from './Card'
import { useUiStore, type ViewId } from '@/store/uiStore'

export type BalloonTone = 'pos' | 'neg' | 'warn' | 'primary' | 'ink'

/** Um pedaço do parágrafo: texto simples ou valor destacado (clicável). */
export type BalloonSegment =
  | string
  | {
      value: string
      tone?: BalloonTone
      /** Se presente, o valor é clicável e navega até a seção. */
      goTo?: ViewId
    }

const TONE_CLASS: Record<BalloonTone, string> = {
  pos: 'text-pos',
  neg: 'text-neg',
  warn: 'text-warn',
  primary: 'text-primary',
  ink: 'text-ink',
}

/**
 * Balão de resumo inteligente (§3): card de texto corrido que narra o
 * período com os valores destacados inline em cores semânticas e
 * clicáveis, levando à seção correspondente.
 */
export function SummaryBalloon({
  title,
  segments,
  className,
}: {
  title: string
  segments: BalloonSegment[]
  className?: string
}): ReactNode {
  const setView = useUiStore((s) => s.setView)
  return (
    <Card className={cn('p-5 flex gap-3.5', className)}>
      <span className="h-9 w-9 rounded-[12px] bg-primary-soft inline-flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles size={16} className="text-primary" />
      </span>
      <div className="min-w-0">
        <p className="label-caps">{title}</p>
        <p className="text-[13.5px] text-ink-soft leading-relaxed mt-1">
          {segments.map((seg, i) => {
            if (typeof seg === 'string') return <span key={i}>{seg}</span>
            const cls = cn('font-bold tnum', TONE_CLASS[seg.tone ?? 'ink'])
            if (seg.goTo) {
              const goTo = seg.goTo
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setView(goTo)}
                  className={cn(
                    cls,
                    'cursor-pointer rounded-[4px] hover:underline underline-offset-2 decoration-1',
                  )}
                >
                  {seg.value}
                </button>
              )
            }
            return (
              <strong key={i} className={cls}>
                {seg.value}
              </strong>
            )
          })}
        </p>
      </div>
    </Card>
  )
}
