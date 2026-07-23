import { useState, type ReactNode } from 'react'
import { useChartColors } from './useChartColors'
import { formatPercent } from '@/engine/money'
import { useBRL } from '@/design/money'
import { cn } from '@/lib/cn'
import { RingCenter, FitValue } from '@/design/RingCenter'
import { innerRadiusPx } from '@/design/ringGeometry'

export interface DonutSlice {
  id: string
  label: string
  value: number
  color: string
}

/**
 * Rosca interativa com legenda (valor e %) — hover destaca a fatia
 * tanto no anel quanto na legenda.
 */
export function Donut({
  slices,
  size = 190,
  thickness = 22,
  centerTitle,
  centerCents,
}: {
  slices: DonutSlice[]
  size?: number
  thickness?: number
  centerTitle?: string
  /**
   * Valor do miolo em CENTAVOS (não pré-formatado): assim ele passa pela mesma
   * cascata de magnitude do valor de hover — encolhe/compacta em vez de vazar —
   * e o glifo `R$` é omitido dentro do anel (ver `FitValue hideCurrency`).
   */
  centerCents?: number
}): ReactNode {
  const colors = useChartColors()
  const brl = useBRL()
  const [hover, setHover] = useState<string | null>(null)
  // legenda clicável isola a fatia (M3 §Gráficos): o clique "prende" o destaque
  const [pinned, setPinned] = useState<string | null>(null)
  const active = hover ?? pinned

  const total = slices.reduce((a, s) => a + s.value, 0)
  const R = 50 - thickness / 4
  const C = 2 * Math.PI * R
  let offset = 0

  const hovered = slices.find((s) => s.id === active)

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Composição">
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={colors.surface2}
            strokeWidth={thickness / 2}
          />
          {total > 0 &&
            slices.map((s) => {
              const frac = s.value / total
              const dash = frac * C
              const el = (
                <circle
                  key={s.id}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={active === s.id ? thickness / 2 + 3 : thickness / 2}
                  strokeDasharray={`${Math.max(0, dash - 2)} ${C - dash + 2}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  transform="rotate(-90 50 50)"
                  opacity={active === null || active === s.id ? 1 : 0.35}
                  style={{ transition: 'opacity 150ms, stroke-width 150ms', cursor: 'pointer' }}
                  onMouseEnter={() => setHover(s.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setPinned((p) => (p === s.id ? null : s.id))}
                />
              )
              offset += dash
              return el
            })}
        </svg>
        {/**
         * ── O MIOLO É DIMENSIONADO PELO PIOR CASO, NÃO PELO REPOUSO ────────
         * Aqui morava um `px-6`: uma largura chutada de 142px que, por acaso,
         * cabia no limite de 142,7px de um bloco de DUAS linhas. No hover o
         * bloco vira TRÊS (rótulo + valor + %), o limite cai para ~136px e a
         * caixa continuava com 142 — era exatamente aí que o número vazava por
         * cima do anel.
         *
         * Agora quem manda é `<RingCenter>`, que mede a altura real e aplica a
         * corda `2·√(r² − (h/2)²)`. E a linha da porcentagem existe SEMPRE,
         * apenas invisível no repouso: assim a altura medida já é a do pior
         * caso, e passar o mouse não muda o tamanho de nada.
         */}
        <RingCenter innerRadius={innerRadiusPx(size, thickness / 2)}>
          <span className="text-[11px] text-ink-faint leading-tight max-w-full truncate">
            {hovered ? hovered.label : centerTitle}
          </span>
          {hovered ? (
            <FitValue cents={hovered.value} fontPx={15} weight={700} hideCurrency className="text-ink mt-0.5" />
          ) : centerCents !== undefined ? (
            // Antes era um <span> de tamanho fixo — fora da cascata, então um
            // total grande vazava. Agora é FitValue, igual ao valor de hover
            // (peso 700 pela prop; a família mono vem do `.tnum` do FitValue —
            // NÃO passar `font-display` aqui, senão ele briga com o `.tnum` pela
            // família e o número perde o alinhamento tabular).
            <FitValue cents={centerCents} fontPx={15} weight={700} hideCurrency className="text-ink mt-0.5" />
          ) : null}
          {/* Reserva permanente da 3ª linha — ver o comentário acima. */}
          <span
            className={cn('text-[11px] text-ink-soft tnum', !(hovered && total > 0) && 'invisible')}
            aria-hidden={!(hovered && total > 0)}
          >
            {hovered && total > 0 ? formatPercent(hovered.value / total, 1) : '0%'}
          </span>
        </RingCenter>
      </div>

      {/* Legenda: valor e % */}
      <ul className="flex flex-col gap-1.5 min-w-0 flex-1">
        {slices.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              aria-pressed={pinned === s.id}
              className={cn(
                'w-full flex items-center gap-2 text-[12.5px] rounded-[7px] px-1.5 py-1 cursor-pointer transition-colors',
                active === s.id ? 'bg-surface-2' : 'hover:bg-surface-2',
                active !== null && active !== s.id && 'opacity-40',
              )}
              onMouseEnter={() => setHover(s.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setPinned((p) => (p === s.id ? null : s.id))}
            >
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-ink truncate">{s.label}</span>
              <span className="ml-auto text-ink font-semibold tnum shrink-0">{brl(s.value)}</span>
              <span className="text-ink-faint tnum w-11 text-right shrink-0">
                {total > 0 ? formatPercent(s.value / total, 0) : '—'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
