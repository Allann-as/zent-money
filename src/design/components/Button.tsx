import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'soft'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-press shadow-[0_1px_2px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)]',
  outline:
    'border border-line-strong text-ink hover:bg-surface-2 active:bg-surface-3',
  ghost: 'text-ink-soft hover:bg-surface-2 hover:text-ink active:bg-surface-3',
  soft: 'bg-primary-soft text-primary hover:bg-primary/20 active:bg-primary/25',
  danger: 'bg-neg text-white hover:brightness-110 active:brightness-95',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[8px]',
  md: 'h-9.5 px-4 text-sm gap-2 rounded-control',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-control',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(
        'inline-flex items-center justify-center font-medium select-none whitespace-nowrap',
        'transition-all duration-150 cursor-pointer',
        'disabled:opacity-45 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  )
})
