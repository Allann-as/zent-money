import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { inputClass } from './Input'
import { addDaysIso, daysInYm, todayIso, weekdayOfIso, ymOfDate } from '@/engine/dates'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CALENDÁRIO PRÓPRIO (R10 §8) — substitui o `<input type="date">` nativo
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Popover ancorado de 252px, células de 28px, grade simétrica, cabeçalho com
 * mês e setas, PONTOS nos dias que já têm lançamento, dia selecionado na
 * primária, hoje com contorno no positivo, atalhos `hoje · ontem · −7d`,
 * Esc/clique fora fecham, setas + Enter navegam pelo teclado.
 *
 * ── O CAMPO CONTINUA ACEITANDO DIGITAÇÃO (exigência do Allan) ───────────
 * Trocar o nativo por um popover só de clique custaria velocidade e
 * acessibilidade: quem sabe a data digita `0507` e segue. Aqui o campo é um
 * texto comum em dd/mm/aaaa — digitável, colável, navegável por teclado — e o
 * calendário é um AUXÍLIO ao lado, não o único caminho. A máscara é aplicada
 * enquanto se digita e a data só é confirmada quando forma um dia real.
 *
 * ── O VALOR EXTERNO NUNCA DEIXA DE SER ISO ──────────────────────────────
 * `value`/`onChange` falam `YYYY-MM-DD`, igual ao nativo que este componente
 * substituiu. É o que permitiu trocar o campo em seis formulários sem tocar em
 * nenhuma lógica de dados: o dd/mm/aaaa existe só entre o olho e o teclado.
 */

const CELL = 28
const PANEL_W = 252
const WEEKDAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']
const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** ISO → "dd/mm/aaaa" (vazio se não for uma data). */
export function isoToBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m === null ? '' : `${m[3]}/${m[2]}/${m[1]}`
}

/** "dd/mm/aaaa" → ISO, ou null se o dia não existir (31/02, 00/13…). */
export function brToIso(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br)
  if (m === null) return null
  const [, dd, mm, yyyy] = m
  const month = Number(mm)
  const day = Number(dd)
  if (month < 1 || month > 12 || day < 1) return null
  if (day > daysInYm(`${yyyy}-${mm}`)) return null
  return `${yyyy}-${mm}-${dd}`
}

/** Aplica a máscara dd/mm/aaaa conforme se digita, sem atrapalhar o apagar. */
export function maskBr(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

export interface DateFieldProps {
  /** Data em ISO `YYYY-MM-DD`. */
  value: string
  onChange(iso: string): void
  /** Dias que já têm lançamento — ganham um ponto no calendário (§8). */
  markedDates?: ReadonlySet<string>
  autoFocus?: boolean
  className?: string
  'aria-label'?: string
}

export function DateField({
  value,
  onChange,
  markedDates,
  autoFocus,
  className,
  'aria-label': ariaLabel = 'Data',
}: DateFieldProps): ReactNode {
  const [text, setText] = useState(() => isoToBr(value))
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const id = useId()

  // O valor pode mudar por fora (abrir o formulário de novo, atalho do
  // calendário): o texto acompanha, mas só quando de fato divergem — senão
  // reescrever o campo a cada tecla mataria a digitação parcial.
  useEffect(() => {
    const asIso = brToIso(text)
    if (asIso !== value) setText(isoToBr(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function commit(next: string): void {
    setText(next)
    const iso = brToIso(next)
    if (iso !== null) onChange(iso)
  }

  function place(): void {
    const el = wrapRef.current
    if (el === null) return
    const r = el.getBoundingClientRect()
    // Abre para baixo; se não couber, para cima. O popover vai num portal para
    // não ser cortado pelo `overflow` do corpo do modal.
    const below = window.innerHeight - r.bottom
    const height = 300
    const top = below > height ? r.bottom + 6 : Math.max(8, r.top - height - 6)
    const left = Math.min(Math.max(8, r.left), window.innerWidth - PANEL_W - 8)
    setAnchor({ top, left })
  }

  useEffect(() => {
    if (!open) return
    place()
    function onDown(e: MouseEvent): void {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) === true) return
      if (panelRef.current?.contains(t) === true) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.stopPropagation() // não fecha o modal junto
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  return (
    <div ref={wrapRef} className={cn('relative flex items-center gap-1.5', className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        placeholder="dd/mm/aaaa"
        value={text}
        onChange={(e) => commit(maskBr(e.target.value))}
        onBlur={() => {
          // Texto incompleto ao sair volta ao último valor válido, em vez de
          // deixar o campo num estado que não é data nenhuma.
          if (brToIso(text) === null) setText(isoToBr(value))
        }}
        className={cn(inputClass, 'tnum')}
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Fechar calendário' : 'Abrir calendário'}
        aria-expanded={open}
        className={cn(
          'h-9.5 w-9.5 shrink-0 rounded-control inline-flex items-center justify-center',
          'border border-line bg-surface-2 transition-colors cursor-pointer',
          open ? 'text-primary border-primary/40' : 'text-ink-soft hover:text-ink hover:border-line-strong',
        )}
      >
        <CalendarDays size={16} />
      </button>

      {open && anchor !== null
        ? createPortal(
            <CalendarPanel
              panelRef={panelRef}
              top={anchor.top}
              left={anchor.left}
              value={brToIso(text) ?? value}
              markedDates={markedDates}
              onPick={(iso) => {
                setText(isoToBr(iso))
                onChange(iso)
                setOpen(false)
              }}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </div>
  )
}

interface PanelProps {
  top: number
  left: number
  value: string
  markedDates: ReadonlySet<string> | undefined
  onPick(iso: string): void
  onClose(): void
}

function CalendarPanel({
  panelRef,
  top,
  left,
  value,
  markedDates,
  onPick,
  onClose,
}: PanelProps & { panelRef: React.RefObject<HTMLDivElement> }): ReactNode {
  const today = todayIso()
  const [cursor, setCursor] = useState(() => (value !== '' ? value : today))
  const ym = ymOfDate(cursor)
  const gridRef = useRef<HTMLDivElement>(null)

  // Foca a grade ao abrir para as setas funcionarem sem clique prévio.
  useEffect(() => {
    gridRef.current?.focus()
  }, [])

  const cells = useMemo(() => {
    const first = `${ym}-01`
    // weekdayOfIso: 0=domingo. A grade começa na SEGUNDA, então domingo é o 7º.
    const lead = (weekdayOfIso(first) + 6) % 7
    const total = daysInYm(ym)
    const out: (string | null)[] = []
    for (let i = 0; i < lead; i++) out.push(null)
    for (let d = 1; d <= total; d++) out.push(`${ym}-${String(d).padStart(2, '0')}`)
    // Completa a última linha para a grade ficar simétrica (§8).
    while (out.length % 7 !== 0) out.push(null)
    return out
  }, [ym])

  function move(days: number): void {
    setCursor((c) => addDaysIso(c, days))
  }

  function onKey(e: React.KeyboardEvent): void {
    const map: Record<string, number> = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
    }
    const delta = map[e.key]
    if (delta !== undefined) {
      e.preventDefault()
      move(delta)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick(cursor)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const [yyyy, mm] = ym.split('-') as [string, string]

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Escolher data"
      className="fixed z-[70] rounded-card border border-line bg-surface shadow-pop anim-pop-in p-2.5"
      style={{ top, left, width: PANEL_W }}
    >
      {/* Cabeçalho: mês e setas */}
      <div className="flex items-center justify-between mb-1.5">
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={() => setCursor(addDaysIso(`${ym}-01`, -1))}
          className="h-7 w-7 rounded-[8px] inline-flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 cursor-pointer"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-[12.5px] font-semibold text-ink first-letter:uppercase">
          {MONTHS[Number(mm) - 1]} <span className="tnum text-ink-soft">{yyyy}</span>
        </span>
        <button
          type="button"
          aria-label="Próximo mês"
          onClick={() => setCursor(addDaysIso(`${ym}-${String(daysInYm(ym)).padStart(2, '0')}`, 1))}
          className="h-7 w-7 rounded-[8px] inline-flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 cursor-pointer"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Cabeçalho dos dias da semana */}
      <div className="grid grid-cols-7 mb-0.5">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="text-[10px] font-semibold text-ink-faint text-center" style={{ height: 18 }}>
            {w}
          </span>
        ))}
      </div>

      {/* Grade — um único alvo de teclado (roving focus na própria grade) */}
      <div
        ref={gridRef}
        tabIndex={0}
        role="grid"
        aria-label="Dias do mês"
        onKeyDown={onKey}
        className="grid grid-cols-7 gap-y-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-[8px]"
      >
        {cells.map((iso, i) => {
          if (iso === null) return <span key={`x${i}`} style={{ height: CELL }} />
          const day = Number(iso.slice(8))
          const selected = iso === value
          const isToday = iso === today
          const focused = iso === cursor
          const marked = markedDates?.has(iso) === true
          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              aria-selected={selected}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => onPick(iso)}
              className={cn(
                'relative mx-auto inline-flex items-center justify-center rounded-[8px] tnum text-[12px] cursor-pointer',
                'transition-colors duration-100',
                selected
                  ? 'bg-primary text-on-primary font-semibold'
                  : focused
                    ? 'bg-surface-3 text-ink'
                    : 'text-ink-soft hover:bg-surface-2 hover:text-ink',
                // hoje ganha CONTORNO no positivo — nunca preenchimento, para
                // não competir com o dia selecionado (§8)
                isToday && !selected && 'ring-1 ring-pos',
              )}
              style={{ height: CELL, width: CELL }}
            >
              {day}
              {marked && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute bottom-[3px] left-1/2 -translate-x-1/2 h-[3px] w-[3px] rounded-full',
                    selected ? 'bg-on-primary' : 'bg-primary',
                  )}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Atalhos (§8) */}
      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-line">
        {[
          { label: 'hoje', iso: today },
          { label: 'ontem', iso: addDaysIso(today, -1) },
          { label: '−7d', iso: addDaysIso(today, -7) },
        ].map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.iso)}
            className="flex-1 h-7 rounded-[8px] text-[11.5px] text-ink-soft hover:text-primary hover:bg-primary-soft transition-colors cursor-pointer"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
