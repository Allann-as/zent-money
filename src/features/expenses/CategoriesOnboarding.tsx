import { useState, type ReactNode } from 'react'
import { Check, Plus, Sparkles } from 'lucide-react'
import { Card } from '@/design/components/Card'
import { Button } from '@/design/components/Button'
import { toast } from '@/design/components/toast'
import { useDataStore } from '@/store/dataStore'
import { newId } from '@/lib/id'
import { cn } from '@/lib/cn'

/** Sugestões do onboarding — cores da paleta curada dessaturada (§3). */
const SUGGESTIONS: { name: string; color: string }[] = [
  { name: 'Mercado', color: '#7e9c86' },
  { name: 'Farmácia', color: '#6fa894' },
  { name: 'Restaurantes', color: '#d98f7e' },
  { name: 'Transporte', color: '#7fa9c0' },
  { name: 'Lazer', color: '#b598f0' },
  { name: 'Assinaturas', color: '#c08ba8' },
  { name: 'Contas de casa', color: '#c7a55e' },
  { name: 'Educação', color: '#8e8fb0' },
  { name: 'Roupas', color: '#a8b36e' },
  { name: 'Saúde', color: '#c9925c' },
]

export function CategoriesOnboarding({ onCreateCustom }: { onCreateCustom(): void }): ReactNode {
  const mutate = useDataStore((s) => s.mutate)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(['Mercado', 'Transporte', 'Lazer']),
  )

  function toggle(name: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function createSelected(): void {
    const chosen = SUGGESTIONS.filter((s) => selected.has(s.name))
    if (chosen.length === 0) return
    mutate((d) => {
      for (const s of chosen) {
        d.categories.push({ id: newId(), name: s.name, color: s.color, monthlyLimit: null })
      }
      d.meta.categoriesOnboarded = true
    })
    toast.success(
      `${chosen.length} ${chosen.length === 1 ? 'categoria criada' : 'categorias criadas'}`,
      'Você pode editar cor e limite mensal a qualquer momento.',
    )
  }

  return (
    <Card className="p-8">
      <div className="max-w-[560px] mx-auto text-center">
        <div className="rounded-[16px] bg-primary-soft inline-flex items-center justify-center mb-4 h-14 w-14">
          <Sparkles size={24} className="text-primary" />
        </div>
        <h2 className="font-display text-[19px] font-bold text-ink tracking-tight">
          Suas categorias, do seu jeito
        </h2>
        <p className="text-[13.5px] text-ink-soft mt-2 leading-relaxed">
          O Zent Money não cria nada por você — cada categoria é sua. Escolha algumas sugestões para
          começar (dá para editar cor e limite depois) ou crie a primeira do zero.
        </p>

        <div className="flex flex-wrap justify-center gap-2 mt-6">
          {SUGGESTIONS.map((s) => {
            const active = selected.has(s.name)
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => toggle(s.name)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-full border text-[13px] font-medium transition-all duration-150 cursor-pointer',
                  active
                    ? 'border-transparent text-white shadow-[0_2px_8px_rgba(0,0,0,0.25)]'
                    : 'border-line-strong text-ink-soft hover:text-ink hover:border-ink-faint bg-surface-2',
                )}
                style={active ? { background: s.color } : undefined}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ background: active ? 'rgba(255,255,255,0.85)' : s.color }}
                  aria-hidden="true"
                />
                {s.name}
                {active && <Check size={13} />}
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-center gap-3 mt-7">
          <Button onClick={createSelected} disabled={selected.size === 0}>
            <Check size={15} />
            Criar {selected.size > 0 ? selected.size : ''}{' '}
            {selected.size === 1 ? 'categoria' : 'categorias'}
          </Button>
          <Button variant="outline" onClick={onCreateCustom}>
            <Plus size={15} /> Criar do zero
          </Button>
        </div>
      </div>
    </Card>
  )
}
