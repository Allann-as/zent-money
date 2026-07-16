import { forwardRef, useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { formatMoneyPlain, parseMoney } from '@/engine/money'

export const inputClass = cn(
  'h-9.5 w-full px-3 rounded-control bg-surface-2 border border-line text-sm text-ink',
  'placeholder:text-ink-faint transition-colors duration-150',
  'hover:border-line-strong focus:border-primary focus:bg-surface',
  'focus:outline-none focus:ring-2 focus:ring-primary/25',
  'disabled:opacity-45 disabled:pointer-events-none',
)

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(inputClass, className)} {...rest} />
  },
)

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string
  children: ReactNode
  hint?: string
  className?: string
}): ReactNode {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-[12.5px] font-medium text-ink-soft">{label}</span>
      {children}
      {hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
    </label>
  )
}

export interface MoneyInputProps {
  /** Valor em centavos; null = vazio. */
  value: number | null
  onChange(cents: number | null): void
  placeholder?: string
  autoFocus?: boolean
  className?: string
  id?: string
  allowNegative?: boolean
  'aria-label'?: string
}

/**
 * Input monetário: aceita "1.234,56" (BR) e "1234.56" (US) enquanto digita,
 * normaliza para pt-BR ao perder o foco. Inválido → borda vermelha.
 */
export function MoneyInput({
  value,
  onChange,
  placeholder = '0,00',
  autoFocus,
  className,
  id,
  allowNegative = false,
  ...aria
}: MoneyInputProps): ReactNode {
  const [text, setText] = useState(value === null ? '' : formatMoneyPlain(value))
  const [focused, setFocused] = useState(false)

  // Sincroniza quando o valor muda por fora (ex.: reset do formulário)
  useEffect(() => {
    if (!focused) setText(value === null ? '' : formatMoneyPlain(value))
  }, [value, focused])

  const parsed = text.trim() === '' ? null : parseMoney(text)
  const invalid = text.trim() !== '' && (parsed === null || (!allowNegative && parsed < 0))

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-faint pointer-events-none font-medium">
        R$
      </span>
      <input
        id={id}
        autoFocus={autoFocus}
        inputMode="decimal"
        className={cn(
          inputClass,
          'pl-9 tnum',
          invalid && 'border-neg focus:border-neg focus:ring-neg/20',
          className,
        )}
        placeholder={placeholder}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          if (parsed !== null && !invalid) setText(formatMoneyPlain(parsed))
        }}
        onChange={(e) => {
          const t = e.target.value
          setText(t)
          const cents = t.trim() === '' ? null : parseMoney(t)
          if (cents === null) onChange(null)
          else if (!allowNegative && cents < 0) onChange(null)
          else onChange(cents)
        }}
        {...aria}
      />
    </div>
  )
}
