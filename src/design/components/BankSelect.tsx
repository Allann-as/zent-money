import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { inputClass } from './Input'
import { BankLogo } from '@/features/banks/BankLogo'
import type { Bank } from '@/data/schema'

/**
 * Select de banco com logo (§6 R2): botão + popover listbox com navegação
 * por teclado, usado nos formulários que escolhem banco.
 */
export function BankSelect({
  banks,
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  banks: readonly Bank[]
  value: string
  onChange(bankId: string): void
  'aria-label': string
}): ReactNode {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = banks.find((b) => b.id === value)

  useEffect(() => {
    if (!open) return
    setHighlight(Math.max(0, banks.findIndex((b) => b.id === value)))
    function onDocClick(e: MouseEvent): void {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open, banks, value])

  function onKeyDown(e: React.KeyboardEvent): void {
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'Escape') {
      e.stopPropagation()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(banks.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const b = banks[highlight]
      if (b) {
        onChange(b.id)
        setOpen(false)
      }
    }
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(inputClass, 'flex items-center gap-2 text-left cursor-pointer pr-8')}
      >
        {selected ? (
          <>
            <BankLogo name={selected.name} color={selected.color} size={20} />
            <span className="truncate">{selected.name}</span>
          </>
        ) : (
          <span className="text-ink-faint">Escolher banco…</span>
        )}
        <ChevronDown size={14} className="absolute right-2.5 text-ink-faint" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto bg-surface border border-line-strong rounded-[10px] shadow-pop p-1 anim-pop-in"
        >
          {banks.map((b, i) => (
            <li key={b.id} role="option" aria-selected={b.id === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(b.id)
                  setOpen(false)
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2 h-9 rounded-[8px] text-[13px] text-left cursor-pointer transition-colors',
                  i === highlight ? 'bg-primary-soft text-ink' : 'text-ink-soft hover:text-ink',
                )}
              >
                <BankLogo name={b.name} color={b.color} size={20} />
                <span className="truncate flex-1">{b.name}</span>
                {b.id === value && <Check size={13} className="text-primary shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
