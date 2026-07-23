import { type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { MoneyInput, type MoneyInputProps } from './Input'
import { formatBRL } from '@/engine/money'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CAMPO DE VALOR REDUZIDO (R10 §7)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * O campo de dinheiro dos formulários: altura de 44px, número em ~1,45rem,
 * prefixo `R$` discreto e uma fileira de atalhos embaixo (`+10 +50 +100` e
 * "último valor").
 *
 * ── POR QUE "REDUZIDO" E NÃO "GIGANTE" ──────────────────────────────────
 * A tentação num formulário de dinheiro é fazer do valor um número-herói de
 * 3rem. Só que este campo divide a tela com data, categoria e origem: um valor
 * enorme rouba a hierarquia do formulário inteiro e faz os outros campos
 * parecerem opcionais. 44px de altura com 1,45rem é o ponto em que o valor
 * ainda é claramente o campo mais importante sem apagar os demais.
 *
 * ── OS ATALHOS SOMAM, o "último valor" SUBSTITUI ────────────────────────
 * `+10/+50/+100` acumulam sobre o que já está no campo — é como se conta
 * dinheiro na cabeça ("cinquenta... mais dez"). "Último valor" é outra
 * operação: repete um lançamento parecido, então SUBSTITUI. Misturar as duas
 * semânticas no mesmo lugar seria a receita para um lançamento errado.
 */

export interface MoneyFieldProps extends MoneyInputProps {
  /**
   * Valor do lançamento anterior deste mesmo formulário, em centavos.
   * `null`/ausente esconde o atalho — um botão "último valor" que não tem
   * valor nenhum para oferecer é só ruído.
   */
  lastValue?: number | null
}

const QUICK = [1000, 5000, 10000] // +10 · +50 · +100, em centavos

export function MoneyField({ lastValue, className, ...rest }: MoneyFieldProps): ReactNode {
  const { value, onChange } = rest
  return (
    <div className="flex flex-col gap-1.5">
      <MoneyInput
        {...rest}
        className={cn('h-11 pl-10 text-[1.45rem] font-semibold', className)}
      />
      <div className="flex items-center gap-1.5">
        {QUICK.map((cents) => (
          <button
            key={cents}
            type="button"
            // Somar sobre o que já existe; campo vazio conta como zero.
            onClick={() => onChange((value ?? 0) + cents)}
            className="h-7 px-2.5 rounded-[8px] text-[11.5px] font-medium tnum text-ink-soft bg-surface-2 border border-line hover:text-primary hover:border-primary/40 transition-colors cursor-pointer"
          >
            +{cents / 100}
          </button>
        ))}
        {typeof lastValue === 'number' && lastValue > 0 && (
          <button
            type="button"
            onClick={() => onChange(lastValue)}
            title={`Repetir ${formatBRL(lastValue)}`}
            className="h-7 px-2.5 ml-auto rounded-[8px] text-[11.5px] text-ink-faint hover:text-primary hover:bg-primary-soft transition-colors cursor-pointer"
          >
            último valor
          </button>
        )}
      </div>
    </div>
  )
}
