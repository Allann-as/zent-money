import { useEffect, useState, type ReactNode } from 'react'
import { Delete } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Teclado de PIN (M2 §b) — bolinhas que preenchem a cada dígito, teclado clicável
 * e teclado físico ao mesmo tempo. Controla o próprio valor; o pai reage só ao
 * `onSubmit(pin)` e pede reset/shake por nonce (após um erro).
 *
 * PIN de `min`–`max` dígitos: como o comprimento é variável, o envio é explícito
 * (Enter ou o botão ✓), habilitado a partir de `min`.
 */
export function PinPad({
  min = 4,
  max = 6,
  disabled = false,
  resetNonce = 0,
  shakeNonce = 0,
  onSubmit,
}: {
  min?: number
  max?: number
  disabled?: boolean
  /** Muda para limpar o valor digitado (ex.: após PIN errado). */
  resetNonce?: number
  /** Muda para disparar o shake das bolinhas (erro). */
  shakeNonce?: number
  onSubmit(pin: string): void
}): ReactNode {
  const [value, setValue] = useState('')

  useEffect(() => {
    setValue('')
  }, [resetNonce])

  const canSubmit = value.length >= min && !disabled

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (disabled) return
      if (e.key >= '0' && e.key <= '9') {
        setValue((v) => (v.length < max ? v + e.key : v))
      } else if (e.key === 'Backspace') {
        setValue((v) => v.slice(0, -1))
      } else if (e.key === 'Enter') {
        setValue((v) => {
          if (v.length >= min) onSubmit(v)
          return v
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [disabled, min, max, onSubmit])

  const press = (d: string): void => {
    if (disabled) return
    setValue((v) => (v.length < max ? v + d : v))
  }
  const back = (): void => setValue((v) => v.slice(0, -1))
  const submit = (): void => {
    if (canSubmit) onSubmit(value)
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div className="flex flex-col items-center gap-7">
      {/* Bolinhas: preenchem conforme digita; tremem no erro */}
      <div key={shakeNonce} className={cn('flex gap-3.5', shakeNonce > 0 && 'anim-shake')}>
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-3.5 w-3.5 rounded-full border-[1.5px] transition-all duration-150',
              i < value.length
                ? 'bg-primary border-primary scale-110 shadow-[0_0_12px_2px_var(--primary-soft)]'
                : // vazia com mais contraste (reparo do M2): borda forte + miolo sutil
                  'border-line-strong bg-surface-2/70',
            )}
          />
        ))}
      </div>

      {/* Teclado numérico */}
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => press(k)}
            className="h-14 w-14 rounded-full border border-line bg-surface-2/60 text-[19px] font-display font-medium text-ink tabular-nums transition-all duration-150 hover:bg-surface-3 hover:border-line-strong active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={back}
          aria-label="Apagar último dígito"
          className="h-14 w-14 rounded-full inline-flex items-center justify-center text-ink-soft transition-all duration-150 hover:bg-surface-2 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <Delete size={20} />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => press('0')}
          className="h-14 w-14 rounded-full border border-line bg-surface-2/60 text-[19px] font-display font-medium text-ink tabular-nums transition-all duration-150 hover:bg-surface-3 hover:border-line-strong active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          0
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          aria-label="Confirmar PIN"
          className="h-14 w-14 rounded-full inline-flex items-center justify-center bg-primary text-on-primary font-semibold text-[15px] transition-all duration-150 hover:brightness-110 active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
        >
          OK
        </button>
      </div>
    </div>
  )
}
