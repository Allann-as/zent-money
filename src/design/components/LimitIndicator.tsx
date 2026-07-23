import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useBRL } from '@/design/money'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * INDICADOR DE LIMITE (R10 §9) — um bloco, três usos
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Nome (com a bolinha da cor) · `R$ 264,00 de R$ 400,00` · barra de progresso ·
 * linha de apoio (`restam R$ 136,00 · este gasto usaria R$ 86,40`).
 *
 * Faixas: positivo abaixo de 80%, alerta entre 80% e 99%, negativo em 100% ou
 * mais. As três aparecem na mesma ordem em orçamento, meta e compromissos —
 * é o mesmo desenho reaproveitado, e não três variações parecidas, para "estou
 * perto do limite" ter sempre a mesma cara em qualquer tela.
 *
 * ── `preview` É O QUE O ESTE LANÇAMENTO AINDA VAI CONSUMIR ──────────────
 * A barra ganha um trecho listrado à frente do gasto atual quando há um valor
 * sendo digitado. É a diferença entre "você está em 66%" e "com este gasto
 * você fica em 88%" — a segunda é a que muda a decisão, e é a única hora em
 * que ela importa: enquanto o formulário está aberto.
 */

export type LimitTone = 'ok' | 'near' | 'over'

/**
 * ≥100% negativo · ≥80% alerta · abaixo, normal.
 *
 * É a regra do Orçamento 2.0 (M1 §c) movida para cá — antes ela vivia dentro
 * do BudgetPanel como `statusOf`, e meta e compromissos teriam de repeti-la
 * para combinar. Uma cópia a mais é uma chance a mais de duas telas
 * discordarem sobre o que é "perto do limite".
 */
export function limitTone(used: number, limit: number): LimitTone {
  if (limit <= 0) return used > 0 ? 'over' : 'ok'
  const ratio = used / limit
  if (ratio >= 1) return 'over'
  if (ratio >= 0.8) return 'near'
  return 'ok'
}

export interface LimitIndicatorProps {
  /** Nome do que está sendo limitado (categoria, meta, compromisso). */
  label: string
  /** Cor da bolinha — a cor real da categoria, quando houver. */
  dotColor?: string
  /** Já consumido, em centavos. */
  used: number
  /** Teto, em centavos. */
  limit: number
  /**
   * Valor que ESTE lançamento ainda consumiria, em centavos. Desenha o trecho
   * de prévia na barra e a segunda metade da linha de apoio.
   */
  preview?: number | null
  className?: string
}

export function LimitIndicator({
  label,
  dotColor,
  used,
  limit,
  preview,
  className,
}: LimitIndicatorProps): ReactNode {
  const brl = useBRL()
  const tone = limitTone(used + (preview ?? 0), limit)
  const available = Math.max(0, limit - used)
  const usedPct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  // A prévia é limitada ao que ainda cabe na barra: o estouro é dito em texto,
  // não desenhado saindo pela borda.
  const previewPct =
    limit > 0 && preview ? Math.max(0, Math.min(100 - usedPct, (preview / limit) * 100)) : 0

  const toneText = tone === 'over' ? 'text-neg' : tone === 'near' ? 'text-warn' : 'text-ink-faint'
  const toneBar = tone === 'over' ? 'bg-neg' : tone === 'near' ? 'bg-warn' : 'bg-pos'

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 min-w-0">
          {dotColor !== undefined && (
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full shrink-0"
              style={{ background: dotColor }}
            />
          )}
          <span className="text-[13px] text-ink truncate">{label}</span>
        </span>
        <span className="tnum text-[12.5px] shrink-0">
          <span className={tone === 'over' ? 'text-neg font-semibold' : 'text-ink'}>{brl(used)}</span>
          <span className="text-ink-faint"> de {brl(limit)}</span>
        </span>
      </div>

      <div className="h-2 rounded-full bg-surface-2 overflow-hidden flex">
        <div className={cn('h-full transition-[width] duration-300', toneBar)} style={{ width: `${usedPct}%` }} />
        {previewPct > 0 && (
          <div
            className="h-full opacity-50"
            style={{
              width: `${previewPct}%`,
              // Listrado: diz "ainda não aconteceu" sem precisar de legenda.
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--warn) 0 4px, transparent 4px 8px)',
            }}
          />
        )}
      </div>

      <p className={cn('text-[11.5px]', toneText)}>
        {tone === 'over' ? (
          <>
            Limite atingido — <span className="tnum">{brl(used + (preview ?? 0) - limit)}</span> acima do
            planejado
          </>
        ) : (
          <>
            restam <span className="tnum">{brl(available)}</span>
            {preview ? (
              <>
                {' · '}este gasto usaria <span className="tnum">{brl(preview)}</span>
              </>
            ) : null}
          </>
        )}
      </p>
    </div>
  )
}
