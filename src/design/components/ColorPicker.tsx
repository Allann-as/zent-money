import type { ReactNode } from 'react'
import { Check, Pipette } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Paleta curada para categorias — harmoniosa nos dois temas. */
export const CURATED_COLORS = [
  '#57b6f2', // azul-céu (primária da marca)
  '#22c8e6', // ciano
  '#4adfc3', // verde-água
  '#2fd680', // verde
  '#a3d977', // lima
  '#ffb454', // âmbar
  '#ff8a5c', // laranja
  '#ff6b6b', // coral
  '#ff7ab8', // rosa
  '#b98aff', // lilás
  '#6e5bff', // violeta (secundária da marca)
  '#6ba1ff', // azul claro
] as const

export function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange(color: string): void
}): ReactNode {
  const isCustom = !CURATED_COLORS.includes(value as (typeof CURATED_COLORS)[number])
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CURATED_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Cor ${c}`}
          onClick={() => onChange(c)}
          className={cn(
            'h-7 w-7 rounded-full inline-flex items-center justify-center transition-transform duration-150 cursor-pointer hover:scale-110',
            value === c && 'ring-2 ring-offset-2 ring-primary ring-offset-surface',
          )}
          style={{ background: c }}
        >
          {value === c && <Check size={13} className="text-white drop-shadow" />}
        </button>
      ))}
      <label
        className={cn(
          'relative h-7 w-7 rounded-full inline-flex items-center justify-center cursor-pointer border border-dashed border-line-strong hover:border-primary transition-colors',
          isCustom && 'ring-2 ring-offset-2 ring-primary ring-offset-surface border-solid',
        )}
        style={isCustom ? { background: value } : undefined}
        title="Cor livre"
      >
        <Pipette size={12} className={isCustom ? 'text-white drop-shadow' : 'text-ink-faint'} />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
          aria-label="Escolher cor livre"
        />
      </label>
    </div>
  )
}
