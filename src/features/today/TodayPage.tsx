import { useMemo, useState, type ReactNode } from 'react'
import { Flame, Plus, SlidersHorizontal } from 'lucide-react'
import { Card } from '@/design/components/Card'
import { Button } from '@/design/components/Button'
import { Modal } from '@/design/components/Modal'
import { Field, MoneyInput } from '@/design/components/Input'
import { PageHeader } from '@/features/common/PageHeader'
import { ExpenseDialog, type ExpenseDialogState } from '@/features/expenses/ExpenseDialog'
import { useZentData } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import { useBRL } from '@/design/money'
import { RingCenter, FitValue, RingLabel } from '@/design/RingCenter'
import { innerRadiusPx } from '@/design/ringGeometry'
import { formatTodayLong, todayIso } from '@/engine/dates'
import {
  dailyConsumption,
  dailyStreak,
  daySummary,
  weekRibbon,
  type WeekDay,
} from '@/engine/today'
import { XP, xpBreakdown } from '@/engine/xp'
import { cn } from '@/lib/cn'

/**
 * TELA "HOJE" (v2.1 §2) — o loop diário: anel do dia, frase viva, fita da
 * semana, ignição (streak diário) e combustível (XP). Ao registrar um gasto
 * pela FAB, o anel e a fita reagem sozinhos (leem o store) — a micro-recompensa
 * é o próprio feedback imediato do loop; o toast com "+XP" vem do ExpenseDialog.
 * Tudo derivado (engine/today + engine/xp), nada gravado.
 */
export function TodayPage(): ReactNode {
  const data = useZentData()
  const setView = useUiStore((s) => s.setView)
  const dailyCap = useUiStore((s) => s.dailyCapCents)
  const brl = useBRL()
  const [dialog, setDialog] = useState<ExpenseDialogState>('closed')
  const [capOpen, setCapOpen] = useState(false)

  const iso = todayIso()
  const consumption = useMemo(() => dailyConsumption(data, iso, dailyCap), [data, iso, dailyCap])
  const week = useMemo(() => weekRibbon(data, iso), [data, iso])
  const streak = useMemo(() => dailyStreak(data, iso), [data, iso])
  const xp = useMemo(() => xpBreakdown(data, iso), [data, iso])
  const summary = useMemo(() => daySummary(data, iso), [data, iso])

  const hasCategories = data.categories.length > 0

  function openLaunch(): void {
    if (hasCategories) setDialog('new')
    else setView('expenses') // sem categorias: manda criar antes
  }

  return (
    <>
      <PageHeader
        title="Hoje"
        subtitle={formatTodayLong()}
        actions={
          <Button onClick={openLaunch}>
            <Plus size={15} /> Lançar gasto
          </Button>
        }
      />

      <Card className="card-topline p-6 mb-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-8">
          {/* ── ESQUERDA: anel + frase + fita ─────────────────── */}
          <div>
            <h2 className="font-display text-[15px] font-semibold text-ink tracking-tight">Seu dia</h2>
            <p className="text-[12.5px] text-ink-soft mb-2">quanto do limite diário já foi</p>

            <div className="flex justify-center py-2">
              <DayRing
                spentCents={consumption.spentToday}
                limitCents={consumption.limit}
                ratio={consumption.ratio}
                over={consumption.over}
                hasLimit={consumption.limit !== null}
              />
            </div>

            <LivePhrase consumption={consumption} streak={streak} brl={brl} />

            {consumption.source !== 'budget' && (
              <button
                type="button"
                onClick={() => setCapOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-ink-soft hover:text-primary transition-colors cursor-pointer"
              >
                <SlidersHorizontal size={13} />
                {consumption.source === 'cap' ? 'Ajustar teto diário' : 'Definir um teto diário'}
              </button>
            )}

            <div className="mt-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint mb-2.5">
                sua semana
              </p>
              <div className="grid grid-cols-7 gap-2">
                {week.map((wd) => (
                  <WeekCell key={wd.iso} wd={wd} />
                ))}
              </div>
            </div>
          </div>

          {/* ── DIREITA: ignição + combustível + resumo ───────── */}
          <div className="flex flex-col gap-3.5">
            <IgnitionBlock week={week} streak={streak} />
            <FuelBlock xp={xp} />
            <SummaryBlock inToday={brl(summary.inToday)} outToday={brl(summary.outToday)} caber={consumption.remaining} brl={brl} />
          </div>
        </div>
      </Card>

      <ExpenseDialog
        state={dialog}
        onClose={() => setDialog('closed')}
        onReallocate={() => setView('expenses')}
      />
      <DailyCapModal open={capOpen} onClose={() => setCapOpen(false)} />
    </>
  )
}

/** Anel do dia — gradiente ciano→âmbar; coral quando estoura. */
function DayRing({
  spentCents,
  limitCents,
  ratio,
  over,
  hasLimit,
}: {
  /** Em CENTAVOS, e não pré-formatado: a cascata de magnitude precisa do
      número para decidir fonte e notação (ver design/ringGeometry). */
  spentCents: number
  limitCents: number | null
  ratio: number
  over: boolean
  hasLimit: boolean
}): ReactNode {
  const brlPlain = useBRL()
  const size = 210
  const thickness = 15
  const R = 50 - thickness / 2
  const C = 2 * Math.PI * R
  const clamped = Math.max(0, Math.min(1, ratio))
  const stroke = over ? 'var(--neg)' : 'url(#todayRingGrad)'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id="todayRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--pos)" />
            <stop offset="1" stopColor="var(--primary)" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {hasLimit && (
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={stroke}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - clamped)}
            transform="rotate(-90 50 50)"
            style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
        )}
      </svg>
      <RingCenter innerRadius={innerRadiusPx(size, thickness)}>
        {/**
          * 22px, e não os 30px de antes.
          *
          * Num anel de 210px com três linhas, a corda útil é ~123px — e
          * "R$ 150,00" a 30px mede ~162px. Ou seja: o tamanho antigo NUNCA
          * coube; ele só não parecia quebrado porque o texto transbordava por
          * cima do anel sem ninguém reclamar. 22px é o maior tamanho em que um
          * valor do dia-a-dia cabe junto com os rótulos.
          */}
        <FitValue
          cents={spentCents}
          fontPx={22}
          weight={800}
          className={cn('hero-num', over ? 'text-neg' : 'text-primary')}
        />
        {/* "gasto hoje" é o rótulo secundário: é ele que cede espaço primeiro
            quando o valor cresce (etapa `a` da cascata). */}
        <RingLabel className="text-[10px] uppercase tracking-[0.14em] text-ink-soft mt-1.5">
          gasto hoje
        </RingLabel>
        <RingLabel className="tnum text-[12px] text-ink-faint mt-1">
          {limitCents === null ? 'sem teto' : `de ${brlPlain(limitCents)}`}
        </RingLabel>
      </RingCenter>
    </div>
  )
}

/** Frase viva do dia — linguagem dos balões, valores mascaráveis. */
function LivePhrase({
  consumption,
  streak,
  brl,
}: {
  consumption: ReturnType<typeof dailyConsumption>
  streak: number
  brl: (c: number) => string
}): ReactNode {
  const { remaining, over, countToday, limit } = consumption
  let body: ReactNode
  if (over) {
    body = (
      <>
        Você passou do limite de hoje — <b className="text-ink font-bold">amanhã é novo</b>. {countToday}{' '}
        {countToday === 1 ? 'lançamento' : 'lançamentos'} hoje.
      </>
    )
  } else if (limit !== null && remaining !== null) {
    body = (
      <>
        Ainda <b className="text-primary font-bold">cabem <span className="tnum">{brl(remaining)}</span></b> hoje.{' '}
        {countToday > 0 ? (
          <>
            Você registrou <b className="text-ink font-bold">{countToday} {countToday === 1 ? 'lançamento' : 'lançamentos'}</b> — a sequência segue{' '}
            <b className="text-pos font-bold">acesa</b>.
          </>
        ) : (
          <>
            Nada lançado ainda —{' '}
            {streak > 0 ? (
              <>não quebre os <b className="text-pos font-bold">{streak} dias</b> seguidos.</>
            ) : (
              <>que tal começar a sequência?</>
            )}
          </>
        )}
      </>
    )
  } else {
    body = (
      <>
        {countToday > 0 ? (
          <>Você registrou <b className="text-ink font-bold">{countToday} {countToday === 1 ? 'lançamento' : 'lançamentos'}</b> hoje.</>
        ) : (
          <>Nada lançado hoje ainda.</>
        )}{' '}
        Defina um teto diário para acompanhar o quanto ainda cabe.
      </>
    )
  }
  return <p className="text-[14.5px] leading-relaxed text-ink-soft mt-1">{body}</p>
}

/** Uma célula da fita da semana. */
function WeekCell({ wd }: { wd: WeekDay }): ReactNode {
  const isToday = wd.state === 'today'
  const done = wd.state === 'done'
  const future = wd.state === 'future'
  return (
    <div
      className={cn(
        'rounded-[14px] border px-1 py-2.5 text-center transition-colors',
        isToday
          ? 'border-primary'
          : done
            ? 'border-line bg-surface-2'
            : 'border-line bg-surface-2',
        future && 'opacity-35',
      )}
      style={isToday ? { boxShadow: '0 0 22px -8px color-mix(in srgb, var(--primary) 60%, transparent)' } : undefined}
    >
      <div className={cn('text-[10px] font-bold uppercase tracking-wide', isToday ? 'text-primary' : 'text-ink-faint')}>
        {wd.label}
      </div>
      <div
        aria-hidden="true"
        className={cn('mx-auto my-2 h-2.5 w-2.5 rounded-full', done ? 'bg-pos' : isToday ? 'bg-primary' : 'bg-surface-3')}
        style={
          done
            ? { boxShadow: '0 0 10px color-mix(in srgb, var(--pos) 60%, transparent)' }
            : isToday
              ? { boxShadow: '0 0 10px color-mix(in srgb, var(--primary) 70%, transparent)' }
              : undefined
        }
      />
      <div className={cn('tnum text-[13px] font-bold', done || isToday ? 'text-ink' : 'text-ink-soft')}>{wd.day}</div>
    </div>
  )
}

/** Bloco de ignição (streak diário) — 7 células que acendem. */
function IgnitionBlock({ week, streak }: { week: WeekDay[]; streak: number }): ReactNode {
  return (
    <div className="rounded-[16px] border border-line bg-surface-2 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft inline-flex items-center gap-1.5">
          <Flame size={13} className="text-primary" /> sequência de ignição
        </span>
        <span className="tnum text-[20px] font-extrabold text-primary">
          {streak} {streak === 1 ? 'dia' : 'dias'}
        </span>
      </div>
      <div className="flex gap-1.5 mt-3">
        {week.map((wd) => {
          const lit = wd.state === 'done'
          const now = wd.state === 'today'
          return (
            <div
              key={wd.iso}
              className={cn(
                'flex-1 h-8 rounded-[7px] border inline-flex items-center justify-center tnum text-[11px] font-semibold',
                now
                  ? 'border-pos text-pos'
                  : lit
                    ? 'border-primary/40 text-primary'
                    : 'border-line text-ink-faint bg-surface',
              )}
              style={
                now
                  ? { boxShadow: '0 0 12px -3px color-mix(in srgb, var(--pos) 55%, transparent)' }
                  : lit
                    ? { background: 'color-mix(in srgb, var(--primary) 9%, transparent)' }
                    : undefined
              }
            >
              {wd.label.charAt(0)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Bloco de combustível (XP). */
function FuelBlock({ xp }: { xp: ReturnType<typeof xpBreakdown> }): ReactNode {
  const pct = Math.round((xp.intoLevel / XP.LEVEL_SIZE) * 100)
  return (
    <div className="rounded-[16px] border border-line bg-surface-2 p-4">
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-[14px] font-extrabold text-ink">
          Nível <span className="text-pos">{xp.level}</span>
        </span>
        <span className="tnum text-[12px] text-ink-soft">
          {xp.intoLevel} / {XP.LEVEL_SIZE} XP
        </span>
      </div>
      <div
        className="h-2.5 rounded-full overflow-hidden border"
        style={{ background: 'color-mix(in srgb, var(--pos) 6%, var(--surface))', borderColor: 'color-mix(in srgb, var(--pos) 14%, transparent)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, color-mix(in srgb, var(--pos) 45%, var(--surface)), var(--pos))',
            boxShadow: '0 0 12px color-mix(in srgb, var(--pos) 45%, transparent)',
            transition: 'width 500ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </div>
      <p className="text-[11.5px] text-ink-faint mt-2.5 leading-relaxed">
        XP vem de hábito e disciplina: registrar no dia (+{XP.HABIT_PER_DAY}), fechar o mês no azul (+
        {XP.BLUE_MONTH}), respeitar limites (+{XP.LIMIT_RESPECTED}), bater caixinha (+{XP.BOX_HIT}). Nunca
        por lançamento.
      </p>
    </div>
  )
}

/** Resumo do dia — entrou / saiu / cabe. */
function SummaryBlock({
  inToday,
  outToday,
  caber,
  brl,
}: {
  inToday: string
  outToday: string
  caber: number | null
  brl: (c: number) => string
}): ReactNode {
  return (
    <div className="rounded-[16px] border border-line bg-surface-2 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint mb-1.5">resumo do dia</p>
      <Row label="Entrou hoje" value={inToday} tone="text-pos" />
      <Row label="Saiu hoje" value={outToday} tone="text-neg" />
      {caber !== null && (
        <div className="flex items-center justify-between py-1.5 mt-1 border-t border-line">
          <span className="text-[13px] text-ink-soft">Cabe ainda hoje</span>
          <span className="tnum text-[13px] font-bold text-primary">{brl(caber)}</span>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone: string }): ReactNode {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[13px] text-ink-soft">{label}</span>
      <span className={cn('tnum text-[13px] font-bold', tone)}>{value}</span>
    </div>
  )
}

/** Modal para definir/ajustar o teto diário (fallback do anel). */
function DailyCapModal({ open, onClose }: { open: boolean; onClose(): void }): ReactNode {
  const current = useUiStore((s) => s.dailyCapCents)
  const setDailyCapCents = useUiStore((s) => s.setDailyCapCents)
  const [value, setValue] = useState<number | null>(current)

  function save(): void {
    setDailyCapCents(value !== null && value > 0 ? value : null)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Teto diário"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Salvar</Button>
        </>
      }
    >
      <p className="text-[13px] text-ink-soft leading-relaxed mb-4">
        Quando nenhuma categoria tem limite, o anel de hoje usa este teto como referência do quanto
        cabe por dia. Deixe em branco para não usar teto — aí o anel mostra só o gasto do dia.
      </p>
      <Field label="Quanto por dia">
        <MoneyInput id="daily-cap" value={value} onChange={setValue} autoFocus aria-label="Teto diário" />
      </Field>
    </Modal>
  )
}
