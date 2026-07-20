import type { ReactNode } from 'react'
import { Ban, Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { BankLogo } from '@/features/banks/BankLogo'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * BankPicker (§5) — seletor de conta/origem em ESTILO LISTA, com logo real
 * do banco (assets/logos/, fallback monograma), nome e um subtítulo de
 * contexto (saldo/limite). Um único componente reusado em todos os
 * formulários que escolhem de onde o dinheiro sai/entra: Guardar, Resgatar,
 * aporte, "pago com" do gasto, "recebido em" do ganho.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Opções INVÁLIDAS para a ação ficam **desabilitadas com o motivo à mostra**
 * (ex.: conta zerada em "de qual conta sai" → "sem saldo"): é impossível ceder
 * dinheiro que não existe, e a UI diz por quê em vez de só sumir com a opção.
 */

export interface BankPickerOption {
  id: string
  name: string
  /** Nome usado para achar o logo (normalmente = name; para cartão, o banco). */
  logoName: string
  logoColor: string
  /** Contexto à direita do nome (ex.: "saldo R$ 1.250,00"). */
  subtitle?: string
  /** true pinta o subtítulo em coral (ex.: saldo zerado). */
  danger?: boolean
  /** Desabilita a opção; `reason` aparece no lugar do check. */
  disabled?: boolean
  reason?: string
  /** Opção neutra sem logo de banco (ex.: "Sem origem") — usa ícone Ban. */
  neutral?: boolean
}

export function BankPicker({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly BankPickerOption[]
  value: string | null
  onChange(id: string): void
  ariaLabel: string
}): ReactNode {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-col gap-2">
      {options.map((o) => {
        const selected = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={o.disabled}
            disabled={o.disabled}
            onClick={() => !o.disabled && onChange(o.id)}
            className={cn(
              'flex items-center gap-3 px-3.5 py-2.5 rounded-[12px] border text-left transition-all',
              o.disabled
                ? 'opacity-45 cursor-not-allowed border-line bg-surface-2'
                : 'cursor-pointer bg-surface-2 hover:border-pos/50',
              selected && !o.disabled && 'border-pos bg-pos-soft',
              !selected && !o.disabled && 'border-line',
            )}
            style={
              selected && !o.disabled
                ? { boxShadow: '0 0 16px -6px color-mix(in srgb, var(--pos) 45%, transparent)' }
                : undefined
            }
          >
            {o.neutral ? (
              <span className="inline-flex items-center justify-center rounded-[10px] bg-surface-3 text-ink-faint shrink-0 h-8 w-8">
                <Ban size={15} />
              </span>
            ) : (
              <BankLogo name={o.logoName} color={o.logoColor} size={32} />
            )}
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-semibold text-ink truncate">{o.name}</span>
              {o.subtitle && (
                <span className={cn('block tnum text-[12px]', o.danger ? 'text-neg' : 'text-ink-soft')}>
                  {o.subtitle}
                </span>
              )}
            </span>
            {o.disabled ? (
              o.reason ? (
                <span className="tnum text-[11px] text-neg tracking-wide shrink-0">{o.reason}</span>
              ) : null
            ) : (
              <span
                aria-hidden="true"
                className={cn(
                  'h-5 w-5 rounded-full border-2 shrink-0 inline-flex items-center justify-center',
                  selected ? 'border-pos bg-pos' : 'border-line',
                )}
              >
                {selected && <Check size={12} className="text-on-primary" strokeWidth={3} />}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
