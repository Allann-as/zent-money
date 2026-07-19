import { useDataStore } from './dataStore'
import { toast } from '@/design/components/toast'
import { ACHIEVEMENTS, evaluateAchievements } from '@/engine/achievements'
import { challengeIsOver, evaluateChallenge } from '@/engine/challenge'
import { currentYm, todayIso } from '@/engine/dates'
import { formatBRL } from '@/engine/money'
import { newId } from '@/lib/id'
import type { Challenge } from '@/data/schema'

/**
 * Ações da gamificação (M4). Score e streak são derivados (não há ação para
 * eles); aqui vivem só as escritas do que persiste: desbloqueio de conquistas e
 * o ciclo do desafio.
 */

// Guarda de reentrância: `evaluateAndUnlock` é chamado por uma subscription ao
// vivo (App) e por si mesmo chama `mutate` (que dispara a subscription). Sem
// isto, a gravação do desbloqueio reentraria na avaliação.
let evaluating = false

/**
 * Avalia conquistas e desbloqueia as satisfeitas (idempotente). `silent` no 1º
 * boot (retroativo): grava sem toast. Depois, cada novo desbloqueio ganha um
 * toast sóbrio. Só grava quando há novidade — sem novidade, não re-renderiza.
 */
export function evaluateAndUnlock(silent: boolean): void {
  if (evaluating) return
  const data = useDataStore.getState().data
  if (!data) return
  const { unlocked, newlyUnlocked } = evaluateAchievements(data, currentYm(), todayIso())
  if (newlyUnlocked.length === 0) return
  evaluating = true
  try {
    useDataStore.getState().mutate((d) => {
      d.gamification.achievements = unlocked
    })
  } finally {
    evaluating = false
  }
  if (silent) return
  // Toast COALESCIDO: um só, mesmo que várias caiam juntas (evita pilha de toasts
  // cobrindo botões — lição de perf/E2E do M3).
  if (newlyUnlocked.length === 1) {
    const def = ACHIEVEMENTS.find((a) => a.id === newlyUnlocked[0])
    if (def) toast.success('Conquista desbloqueada', def.title)
  } else {
    toast.success('Conquistas desbloqueadas', `${newlyUnlocked.length} novas medalhas na estante.`)
  }
}

// Avaliação AO VIVO com debounce: mutações em rajada (ex.: E2E, importar backup)
// coalescem numa avaliação só, ~1s após a última — sem enxurrada de toasts.
let liveTimer: ReturnType<typeof setTimeout> | undefined
export function scheduleAchievementEval(): void {
  if (liveTimer !== undefined) clearTimeout(liveTimer)
  liveTimer = setTimeout(() => {
    liveTimer = undefined
    evaluateAndUnlock(false)
  }, 1000)
}

/**
 * Rotina de boot da gamificação: (1) avalia o desafio na VIRADA (se o mês dele
 * já passou → resultado ao histórico, sem bronca) e (2) avalia conquistas —
 * **retroativas em silêncio** no 1º boot após o M4, ao vivo daí em diante.
 */
export function runGamificationBoot(): void {
  const data = useDataStore.getState().data
  if (!data) return

  const active = data.gamification.activeChallenge
  if (active && challengeIsOver(active, currentYm())) {
    const record = evaluateChallenge(active, data)
    useDataStore.getState().mutate((d) => {
      d.gamification.challengeHistory.push(record)
      d.gamification.activeChallenge = null
    })
    // Tom neutro: cumpriu ou não, sem julgamento.
    if (record.met) {
      toast.success('Desafio cumprido', `Você fechou dentro de ${formatBRL(record.target)}.`)
    } else {
      toast.info('Desafio encerrado', `Ficou em ${formatBRL(record.actual)} (alvo ${formatBRL(record.target)}). Bola pra frente.`)
    }
  }

  const firstBoot = !data.meta.gamificationOnboarded
  evaluateAndUnlock(firstBoot)
  if (firstBoot) {
    useDataStore.getState().mutate((d) => {
      d.meta.gamificationOnboarded = true
    })
  }
}

/** Omit que preserva os ramos da união discriminada (Omit direto os colapsa). */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never
export type ChallengeDraft = DistributiveOmit<Challenge, 'id' | 'ym'>

/** Cria/substitui o desafio ativo (um por vez). Sempre para o mês corrente. */
export function setChallenge(input: ChallengeDraft): void {
  const challenge = { ...input, id: newId(), ym: currentYm() } as Challenge
  useDataStore.getState().mutate((d) => {
    d.gamification.activeChallenge = challenge
  })
}

/** Cancela o desafio ativo sem registrar resultado (desistência mid-mês). */
export function cancelChallenge(): void {
  useDataStore.getState().mutate((d) => {
    d.gamification.activeChallenge = null
  })
}
