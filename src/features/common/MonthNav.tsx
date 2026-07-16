import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'
import { addMonths, currentYm, formatYmLong } from '@/engine/dates'
import { cn } from '@/lib/cn'

/** Navegação de mês ‹ › compartilhada — afeta todos os blocos da página. */
export function MonthNav(): ReactNode {
  const ym = useUiStore((s) => s.activeYm)
  const setYm = useUiStore((s) => s.setYm)
  const isCurrent = ym === currentYm()

  return (
    <div className="inline-flex items-center gap-1 bg-surface border border-line rounded-[11px] p-1 shadow-card">
      <button
        type="button"
        aria-label="Mês anterior"
        onClick={() => setYm(addMonths(ym, -1))}
        className="h-7.5 w-7.5 rounded-[8px] inline-flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 active:bg-surface-3 transition-colors cursor-pointer"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onClick={() => setYm(currentYm())}
        title={isCurrent ? 'Mês atual' : 'Voltar para o mês atual'}
        className={cn(
          'px-2 min-w-[132px] text-center text-[13px] font-medium first-letter:uppercase cursor-pointer rounded-[8px] h-7.5 transition-colors',
          isCurrent ? 'text-ink' : 'text-primary hover:bg-primary-soft',
        )}
      >
        {formatYmLong(ym)}
      </button>
      <button
        type="button"
        aria-label="Próximo mês"
        onClick={() => setYm(addMonths(ym, 1))}
        className="h-7.5 w-7.5 rounded-[8px] inline-flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 active:bg-surface-3 transition-colors cursor-pointer"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
