import { useMemo, type ReactNode } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Flag,
  Receipt,
  Scale,
  ShoppingBag,
  Undo2,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardTitle } from '@/design/components/Card'
import { EmptyState } from '@/design/components/EmptyState'
import { toast } from '@/design/components/toast'
import { undoSalaryCredit } from '@/store/ledgerActions'
import { formatBRL } from '@/engine/money'
import { formatDateShort } from '@/engine/dates'
import type { Movement, MovementKind } from '@/engine/ledger'
import { cn } from '@/lib/cn'

const ICONS: Record<MovementKind, LucideIcon> = {
  opening: Flag,
  salary: Wallet,
  extra: ArrowDownLeft,
  expense: ShoppingBag,
  'transfer-in': ArrowDownLeft,
  'transfer-out': ArrowUpRight,
  invoice: Receipt,
  adjustment: Scale,
}

/**
 * Histórico de uma conta (R4 §1) — a prova visível de que o saldo é derivado.
 *
 * A coluna da direita é o **saldo corrido**: cada linha mostra em quanto a conta
 * ficou depois daquele movimento, e a linha do topo (a mais recente) bate com o
 * saldo do cabeçalho. É o que o checklist chama de "o histórico fecha a conta" —
 * se um dia não fechar, a tela denuncia sozinha em vez de esconder.
 */
export function AccountHistory({
  movements,
  balance,
}: {
  movements: readonly Movement[]
  /** Saldo derivado da conta — deve bater com o corrido da linha mais recente. */
  balance: number
}): ReactNode {
  // Movimentos chegam do mais recente para o mais antigo; o corrido é somado do
  // mais antigo para o mais novo e reexibido na ordem original.
  const rows = useMemo(() => {
    const oldestFirst = [...movements].reverse()
    let running = 0
    const withRunning = oldestFirst.map((m) => {
      running += m.amount
      return { movement: m, running }
    })
    return withRunning.reverse()
  }, [movements])

  return (
    <Card>
      <div className="flex items-baseline justify-between px-5 pt-4 pb-3">
        <CardTitle>Histórico da conta</CardTitle>
        <span className="text-[12px] text-ink-faint">
          {rows.length === 1 ? '1 movimento' : `${rows.length} movimentos`}
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhum movimento nesta conta"
          description="Vincule o salário, marque “Pago com” nos gastos ou registre uma transferência para o saldo se mover sozinho."
        />
      ) : (
        <ul className="px-2 pb-2" aria-label="Movimentos da conta">
          {rows.map(({ movement: m, running }) => {
            const Icon = ICONS[m.kind]
            const incoming = m.amount >= 0
            return (
              <li
                key={m.id}
                className="group flex items-center gap-3 px-3 h-12 rounded-[10px] hover:bg-surface-2 transition-colors"
              >
                <span
                  className={cn(
                    'h-7 w-7 rounded-[8px] inline-flex items-center justify-center shrink-0',
                    incoming ? 'bg-pos-soft text-pos' : 'bg-surface-3 text-ink-soft',
                  )}
                >
                  <Icon size={13.5} />
                </span>
                <span className="text-[12px] text-ink-faint tnum w-14 shrink-0">
                  {formatDateShort(m.date)}
                </span>
                <span className="flex-1 text-[13.5px] text-ink truncate">
                  {m.kind === 'adjustment' ? (
                    <>
                      {m.description}:{' '}
                      <span className="tnum">
                        {m.amount >= 0 ? '+' : '−'}
                        {formatBRL(Math.abs(m.amount))}
                      </span>
                    </>
                  ) : (
                    m.description
                  )}
                </span>
                {m.kind === 'salary' && (
                  <button
                    type="button"
                    aria-label={`Desfazer crédito de salário de ${formatDateShort(m.date)}`}
                    title="Desfazer este crédito"
                    onClick={() => {
                      undoSalaryCredit(m.sourceId)
                      toast.success('Crédito desfeito', 'O salário deste mês saiu da conta.')
                    }}
                    className="h-7 w-7 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-3 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Undo2 size={13} />
                  </button>
                )}
                <span
                  className={cn(
                    'text-[13.5px] font-semibold tnum w-28 text-right shrink-0',
                    m.kind === 'opening' ? 'text-ink-soft' : incoming ? 'text-pos' : 'text-neg',
                  )}
                >
                  {m.kind === 'opening' ? '' : incoming ? '+' : '−'}
                  {formatBRL(Math.abs(m.amount))}
                </span>
                <span className="text-[12px] text-ink-faint tnum w-28 text-right shrink-0 hidden xl:block">
                  {formatBRL(running)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {rows.length > 0 && (
        <div className="px-5 py-3 border-t border-line flex items-baseline justify-between">
          <span className="text-[12.5px] text-ink-soft">Saldo atual da conta</span>
          <span className={cn('text-[14px] font-semibold tnum', balance < 0 ? 'text-neg' : 'text-ink')}>
            {formatBRL(balance)}
          </span>
        </div>
      )}
    </Card>
  )
}
