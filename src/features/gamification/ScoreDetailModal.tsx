import { ArrowRight, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { Modal } from '@/design/components/Modal'
import { formatYmLong } from '@/engine/dates'
import type { ScoreAction, ScoreResult } from '@/engine/score'
import type { Ym } from '@/engine/dates'

interface Row {
  label: string
  /** Nota 0–100 do componente (null = não medível — redistribuído). */
  value: number | null
  /** Peso efetivo aplicado. */
  weight: number
  hint: string
}

/**
 * Detalhamento do score (§ M4): nota por componente com o peso, a contribuição
 * em pontos e UMA ação concreta. Transparente de propósito — o número não é uma
 * caixa-preta. Confirma que o histórico é RE-DERIVADO (determinístico), não um
 * snapshot gravado.
 */
export function ScoreDetailModal({
  open,
  onClose,
  result,
  action,
  ym,
}: {
  open: boolean
  onClose(): void
  result: ScoreResult
  action: ScoreAction | null
  ym: Ym
}): ReactNode {
  const { components, weights, score, redistributed } = result
  const rows: Row[] = [
    { label: 'Poupança', value: components.savings, weight: weights.savings, hint: 'Quanto da renda sobrou (30%+ = nota cheia)' },
    { label: 'Categorias no limite', value: components.categories, weight: weights.categories, hint: 'Categorias com orçamento que fecharam dentro' },
    { label: 'Compromissos', value: components.commitments, weight: weights.commitments, hint: 'Faturas + parcelas sobre a renda (≤10% = nota cheia)' },
  ]

  return (
    <Modal open={open} onClose={onClose} title={`Saúde financeira — ${formatYmLong(ym)}`} width={460}>
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[34px] font-bold text-ink tnum leading-none">{score}</span>
          <span className="text-[13px] text-ink-soft">de 100</span>
        </div>

        <ul className="flex flex-col gap-3">
          {rows.map((r) => {
            const measurable = r.value !== null
            const contribution = measurable ? (r.value ?? 0) * r.weight : 0
            return (
              <li key={r.label} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-ink font-medium">{r.label}</span>
                  <span className="text-ink-soft tnum">
                    {measurable ? (
                      <>
                        {Math.round(r.value ?? 0)}/100 · peso {Math.round(r.weight * 100)}% ·{' '}
                        <strong className="text-ink">+{contribution.toFixed(1)} pts</strong>
                      </>
                    ) : (
                      <span className="text-ink-faint">sem categorias com limite</span>
                    )}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${measurable ? Math.round(r.value ?? 0) : 0}%`, background: 'var(--primary)' }}
                  />
                </div>
                <span className="text-[11.5px] text-ink-faint">{r.hint}</span>
              </li>
            )
          })}
        </ul>

        {redistributed && (
          <p className="flex items-start gap-1.5 text-[12px] text-ink-soft bg-surface-2 rounded-[10px] px-3 py-2">
            <Info size={13} className="mt-0.5 shrink-0 text-primary" />
            Sem categorias com limite neste mês, o peso de Categorias (30%) foi redistribuído
            proporcionalmente entre Poupança e Compromissos.
          </p>
        )}

        {action && (
          <div className="flex items-center gap-2 rounded-[12px] border border-primary/30 bg-primary-soft px-3.5 py-3">
            <ArrowRight size={16} className="text-primary shrink-0" />
            <span className="text-[13px] text-ink">
              {action.text}{' '}
              <strong className="text-primary tnum">→ +{action.points} pts</strong>
            </span>
          </div>
        )}

        <p className="text-[11.5px] text-ink-faint leading-relaxed">
          O score é re-derivado dos dados do mês toda vez que abre (determinístico) — nunca um
          número gravado. Meses passados na Linha do tempo usam a mesma fórmula.
        </p>
      </div>
    </Modal>
  )
}
