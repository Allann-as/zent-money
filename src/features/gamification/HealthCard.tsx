import { useMemo, useState, type ReactNode } from 'react'
import { Flame, Plus, Trophy, X } from 'lucide-react'
import { Card } from '@/design/components/Card'
import { ProgressRing } from '@/design/charts/ProgressRing'
import { useZentData } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import { cancelChallenge } from '@/store/gamificationActions'
import { buildScoreCache, scoreAction, scoreForMonth } from '@/engine/score'
import { currentStreak, streakMilestone } from '@/engine/streak'
import { challengeActual, challengeProgress, challengeTarget } from '@/engine/challenge'
import { currentYm, daysInYm, todayIso } from '@/engine/dates'
import { useBRL } from '@/design/money'
import { cn } from '@/lib/cn'
import { scoreTone } from './medals'
import { ScoreDetailModal } from './ScoreDetailModal'
import { ChallengeModal } from './ChallengeModal'

/**
 * Card de Saúde Financeira (M4) — o hub da gamificação, logo abaixo do hero:
 * anel do score (mês ativo), streak e o desafio do mês. Sóbrio, sem confete.
 */
export function HealthCard(): ReactNode {
  const data = useZentData()
  const ym = useUiStore((s) => s.activeYm)
  const brl = useBRL()
  const [detailOpen, setDetailOpen] = useState(false)
  const [challengeOpen, setChallengeOpen] = useState(false)

  // Cache do score: uma passada pelos gastos por mudança de dados; navegar meses
  // não re-varre os lançamentos (perf 50k).
  const cache = useMemo(() => buildScoreCache(data), [data])
  const result = useMemo(() => scoreForMonth(data, ym, cache), [data, ym, cache])
  const action = useMemo(() => (result ? scoreAction(data, ym, cache) : null), [data, ym, cache, result])
  const streak = useMemo(() => currentStreak(data, currentYm()), [data])
  const milestone = streakMilestone(streak)

  const challenge = data.gamification.activeChallenge
  const chal = useMemo(() => {
    if (!challenge) return null
    return {
      target: challengeTarget(challenge, data),
      actual: challengeActual(challenge, data),
      progress: challengeProgress(challenge, data),
      name: data.categories.find((c) => c.id === challenge.categoryId)?.name ?? 'Categoria',
    }
  }, [challenge, data])

  const daysLeft = ym === currentYm() ? daysInYm(ym) - Number(todayIso().slice(8, 10)) : 0
  const tone = result ? scoreTone(result.score) : null

  return (
    <Card className="card-topline p-6 mb-5">
      <div className="flex flex-col md:flex-row md:items-center gap-6">
        {/* ── Anel do score ─────────────────────────────── */}
        <div className="flex items-center gap-4 shrink-0">
          <ProgressRing ratio={result ? result.score / 100 : 0} size={104} thickness={9} {...(tone ? { color: tone.color } : {})}>
            {result ? (
              <>
                <span className="font-display text-[30px] font-bold text-ink tnum leading-none">{result.score}</span>
                <span className="text-[10px] text-ink-faint">/100</span>
              </>
            ) : (
              <span className="text-[11px] text-ink-faint text-center px-2 leading-tight">sem score ainda</span>
            )}
          </ProgressRing>
          <div className="min-w-0">
            <p className="label-caps">Saúde financeira</p>
            {result ? (
              <>
                <p className="text-[13px] text-ink-soft mt-1 capitalize">{tone?.label}</p>
                <button
                  type="button"
                  onClick={() => setDetailOpen(true)}
                  className="text-[12.5px] text-primary hover:underline mt-1 cursor-pointer"
                >
                  Ver detalhamento
                </button>
              </>
            ) : (
              <p className="text-[12.5px] text-ink-faint mt-1 max-w-[16rem] leading-snug">
                Registre entradas e gastos do mês para calcular seu score.
              </p>
            )}
          </div>
        </div>

        {/* ── Streak ─────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 md:border-l md:border-line md:pl-6 shrink-0">
          <span
            className={cn(
              'h-9 w-9 rounded-full inline-flex items-center justify-center shrink-0',
              streak > 0 ? 'bg-primary-soft text-primary' : 'bg-surface-2 text-ink-faint',
            )}
          >
            <Flame size={18} strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-display font-semibold text-ink tnum leading-tight">
              {streak} {streak === 1 ? 'mês' : 'meses'} no azul
            </p>
            <p className="text-[11.5px] text-ink-faint leading-snug">
              {milestone ? `Marco de ${milestone} alcançado` : streak === 0 ? 'Feche o mês no positivo' : 'Continue assim'}
            </p>
          </div>
        </div>

        {/* ── Desafio do mês ─────────────────────────────── */}
        <div className="flex-1 min-w-0 md:border-l md:border-line md:pl-6">
          {chal && challenge ? (
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12.5px] font-semibold text-ink truncate">
                  {challenge.kind === 'cap'
                    ? `Máx ${brl(challenge.capAmount)} em ${chal.name}`
                    : `${challenge.reducePercent}% menos em ${chal.name}`}
                </p>
                <button
                  type="button"
                  onClick={cancelChallenge}
                  aria-label="Cancelar desafio"
                  className="h-6 w-6 rounded-md inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer shrink-0"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden mt-2">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.round(chal.progress * 100)}%`,
                    background: chal.actual > chal.target ? 'var(--neg)' : 'var(--primary)',
                  }}
                />
              </div>
              <p className="text-[11.5px] text-ink-faint tnum mt-1.5">
                {brl(chal.actual)} de {brl(chal.target)}
                {daysLeft > 0 && ` · ${daysLeft} ${daysLeft === 1 ? 'dia restante' : 'dias restantes'}`}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2">
              <div className="flex items-center gap-2 text-ink-soft">
                <Trophy size={16} className="text-ink-faint" />
                <span className="text-[12.5px]">Nenhum desafio ativo</span>
              </div>
              <button
                type="button"
                onClick={() => setChallengeOpen(true)}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline cursor-pointer"
              >
                <Plus size={14} /> Propor um desafio
              </button>
            </div>
          )}
        </div>
      </div>

      {result && (
        <ScoreDetailModal open={detailOpen} onClose={() => setDetailOpen(false)} result={result} action={action} ym={ym} />
      )}
      <ChallengeModal open={challengeOpen} onClose={() => setChallengeOpen(false)} />
    </Card>
  )
}
