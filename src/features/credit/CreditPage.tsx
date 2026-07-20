import { useMemo, useState, type ReactNode } from 'react'
import { CreditCard, Receipt } from 'lucide-react'
import { PageHeader } from '@/features/common/PageHeader'
import { Card, CardTitle } from '@/design/components/Card'
import { Button } from '@/design/components/Button'
import { EmptyState } from '@/design/components/EmptyState'
import { BankLogo } from '@/features/banks/BankLogo'
import { PayInvoiceDialog } from '@/features/banks/ledgerDialogs'
import { useZentData } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import { useBRL } from '@/design/money'
import { availableLimit, totalInvoices } from '@/engine/cards'
import { creditHealthReading } from '@/engine/credit'
import { scoreForMonth } from '@/engine/score'
import { incomeByMonth } from '@/engine/aggregations'
import { currentYm } from '@/engine/dates'
import { cn } from '@/lib/cn'

/**
 * TELA DE CRÉDITO (§6) — o hub dos cartões. Mostra, com peso igual, o limite
 * USADO e o DISPONÍVEL de cada cartão; soma as faturas em "a pagar" (sem dupla
 * contagem — é o mesmo `totalInvoices` de Compromissos) e lê a saúde financeira
 * (o mesmo score do M4). Pagar a fatura devolve o limite ao cartão.
 */
export function CreditPage(): ReactNode {
  const data = useZentData()
  const setView = useUiStore((s) => s.setView)
  const brl = useBRL()
  const [payOpen, setPayOpen] = useState(false)

  const ym = currentYm()
  const cards = data.cards
  const invoicesTotal = totalInvoices(cards)
  const usedTotal = useMemo(
    () => cards.reduce((a, c) => a + (c.limit - availableLimit(c, data.purchases)), 0),
    [cards, data.purchases],
  )
  const availableTotal = useMemo(
    () => cards.reduce((a, c) => a + availableLimit(c, data.purchases), 0),
    [cards, data.purchases],
  )
  const score = scoreForMonth(data, ym)?.score ?? null
  const income = incomeByMonth(data.salaryHistory, data.extraIncomes, [ym]).get(ym) ?? 0

  if (cards.length === 0) {
    return (
      <>
        <PageHeader title="Crédito" subtitle="O hub dos seus cartões" />
        <EmptyState
          icon={CreditCard}
          title="Nenhum cartão ainda"
          description="Cadastre um cartão em Bancos & Cartões para acompanhar limite, fatura e saúde de crédito aqui."
          action={<Button onClick={() => setView('banks')}>Ir para Bancos & Cartões</Button>}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Crédito"
        subtitle="Limite usado × disponível de cada cartão"
        actions={
          <Button onClick={() => setPayOpen(true)}>
            <Receipt size={14} /> Pagar fatura
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
        {/* Cartões */}
        <Card className="p-5">
          <CardTitle className="mb-4">Todos os cartões</CardTitle>
          <div className="flex flex-col gap-3">
            {cards.map((c) => {
              const bank = data.banks.find((b) => b.id === c.bankId)
              const free = availableLimit(c, data.purchases)
              const used = c.limit - free
              const usedPct = c.limit > 0 ? Math.max(0, Math.min(100, (used / c.limit) * 100)) : 0
              return (
                <div key={c.id} className="rounded-[16px] border border-line bg-surface-2 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <BankLogo name={bank?.name ?? c.name} color={bank?.color ?? '#888'} size={32} />
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-ink truncate">{bank?.name ?? 'Cartão'}</p>
                      <p className="text-[12px] text-ink-soft truncate">{c.name}</p>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-[color:var(--void,#0a140f)] overflow-hidden" style={{ background: 'color-mix(in srgb, var(--neg) 8%, var(--surface))' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${usedPct}%`,
                        background: 'linear-gradient(90deg, color-mix(in srgb, var(--neg) 55%, transparent), var(--neg))',
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5 tnum text-[12px]">
                    <span className="text-neg">usado {brl(used)}</span>
                    <span className="text-pos">livre {brl(free)}</span>
                  </div>
                  <div className="flex justify-between mt-3 pt-3 border-t border-line text-[12.5px]">
                    <span className="text-ink-soft">
                      limite total <strong className="tnum text-ink font-semibold">{brl(c.limit)}</strong>
                    </span>
                    <span className="text-ink-soft">
                      fatura <strong className="tnum font-semibold text-neg">{brl(c.invoice)}</strong>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Resumo de crédito */}
        <Card className="p-5">
          <CardTitle className="mb-4">Resumo — a pagar</CardTitle>
          <div className="flex flex-col gap-3">
            <div className="rounded-[14px] border border-line bg-surface-2 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">Fatura total do mês</p>
              <p className="tnum text-[24px] font-extrabold text-neg mt-1">{brl(invoicesTotal)}</p>
              <p className="text-[12px] text-ink-faint mt-0.5">soma das faturas abertas — entra em "a pagar"</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Limite usado" value={brl(usedTotal)} />
              <Stat label="Disponível" value={brl(availableTotal)} tone="text-pos" />
            </div>
            {score !== null && (
              <div className="rounded-[14px] border border-line bg-surface-2 p-4 flex items-center gap-3.5">
                <HealthRing score={score} />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft">Saúde financeira</p>
                  <p className="text-[12.5px] text-ink-soft mt-1 leading-snug">
                    {creditHealthReading(invoicesTotal, income)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <PayInvoiceDialog open={payOpen} onClose={() => setPayOpen(false)} />
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }): ReactNode {
  return (
    <div className="rounded-[14px] border border-line bg-surface-2 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{label}</p>
      <p className={cn('tnum text-[18px] font-extrabold mt-1', tone ?? 'text-ink')}>{value}</p>
    </div>
  )
}

function HealthRing({ score }: { score: number }): ReactNode {
  const R = 23
  const C = 2 * Math.PI * R
  const ratio = Math.max(0, Math.min(1, score / 100))
  const color = score >= 70 ? 'var(--pos)' : score >= 40 ? 'var(--primary)' : 'var(--neg)'
  return (
    <div className="relative shrink-0" style={{ width: 56, height: 56 }}>
      <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx="28" cy="28" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="5" />
        <circle
          cx="28"
          cy="28"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - ratio)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center tnum text-[15px] font-extrabold" style={{ color }}>
        {score}
      </span>
    </div>
  )
}
