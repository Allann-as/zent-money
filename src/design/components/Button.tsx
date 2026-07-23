import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * BOTÃO "FIO DE LUZ" (R10 §6)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * O primário deixou de ser um retângulo chapado na cor de acento e passou a ser
 * uma SUPERFÍCIE ELEVADA (panel2 → panel), borda `line2`, texto na primária e um
 * fio luminoso de 1px no topo — a mesma gramática dos cards. O acento sai da
 * área e vai para o texto e para o fio: o botão continua sendo a coisa mais
 * chamativa da tela sem berrar em bloco.
 *
 * Raio 11px (9 no small, 13 no large) e hover que eleva 1px. **Nunca ovais.**
 *
 * ── O DESTRUTIVO É A EXCEÇÃO DELIBERADA ─────────────────────────────────
 * Ele mantém a área sólida em `--neg`. Passar o destrutivo para a mesma
 * superfície discreta dos outros deixaria "Excluir" com o MESMO peso visual de
 * "Cancelar" — o único botão do app cujo erro é irreversível não pode ser o mais
 * fácil de clicar por engano. Ele adota o raio e a elevação do sistema; só não
 * abre mão da cor.
 */

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'soft'
type Size = 'sm' | 'md' | 'lg' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Mostra o giro e bloqueia o clique — para ações que gravam/exportam. */
  loading?: boolean
}

const VARIANTS: Record<Variant, string> = {
  // Superfície elevada + texto no acento + fio de luz no topo (btn-lit)
  primary:
    'btn-lit bg-gradient-to-b from-surface-2 to-surface border border-line-strong text-primary ' +
    'hover:from-surface-3 hover:to-surface-2 hover:border-primary/40 active:from-surface-2 active:to-surface',
  // Secundário: mesma silhueta, sem o fio e com texto neutro
  outline:
    'bg-transparent border border-line-strong text-ink hover:bg-surface-2 hover:border-line-strong active:bg-surface-3',
  // Fantasma: só texto, sem caixa em repouso
  ghost: 'border border-transparent text-ink-soft hover:bg-surface-2 hover:text-ink active:bg-surface-3',
  // Discreto no acento (ações secundárias dentro de cards)
  soft: 'btn-lit bg-primary-soft border border-primary/25 text-primary hover:bg-primary/20 active:bg-primary/25',
  // Destrutivo: área sólida de propósito (ver cabeçalho)
  danger:
    'bg-neg border border-neg text-white hover:brightness-110 active:brightness-95 ' +
    'shadow-[0_1px_2px_rgba(0,0,0,0.25)]',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-[9px]',
  md: 'h-9.5 px-4 text-sm rounded-[11px]',
  lg: 'h-11 px-5 text-[15px] rounded-[13px]',
  icon: 'h-9.5 w-9.5 rounded-[11px]',
}

/** Espaçamento entre ícone e rótulo — vive no conteúdo, não na caixa. */
const GAPS: Record<Size, string> = {
  sm: 'gap-1.5',
  md: 'gap-2',
  lg: 'gap-2',
  icon: 'gap-0',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type, loading = false, disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(
        /**
         * `inline-grid` com tudo na MESMA célula, e não `relative` + spinner
         * `absolute`. A versão com `relative` quebrou os chamadores que passam
         * `absolute` pelo className: as duas são utilitárias de `position` e
         * quem vence é a ordem no CSS gerado, não a ordem no atributo — o
         * botão "Editar" de Ganhos saiu do canto do card e foi parar embaixo
         * do cabeçalho. Empilhando por grid, o botão não declara posição
         * nenhuma e o chamador continua mandando na dele.
         */
        'inline-grid place-items-center font-medium select-none whitespace-nowrap',
        'transition-all duration-150 cursor-pointer',
        // hover eleva 1px (§6) — só transform, de graça na GPU
        'hover:-translate-y-px active:translate-y-0',
        'disabled:opacity-45 disabled:pointer-events-none disabled:translate-y-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && (
        <span aria-hidden="true" className="[grid-area:1/1] inline-flex items-center justify-center">
          <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent opacity-70 anim-spin" />
        </span>
      )}
      {/* Durante o carregamento o rótulo some da vista mas continua no DOM:
          sumir com ele mudaria a largura do botão no meio da ação. */}
      <span
        className={cn(
          '[grid-area:1/1] inline-flex items-center justify-center',
          GAPS[size],
          loading && 'invisible',
        )}
      >
        {children}
      </span>
    </button>
  )
})
