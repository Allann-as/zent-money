import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Modal } from '@/design/components/Modal'
import { cn } from '@/lib/cn'
import { ACHIEVEMENTS } from '@/engine/achievements'
import { useZentData } from '@/store/dataStore'
import { MEDAL_ICONS } from './medals'

/**
 * Estante de conquistas (§ M4): medalha desbloqueada em COR, bloqueada em
 * silhueta com o critério. Sóbrio — traço fino, sem confete.
 */
export function AchievementsModal({ open, onClose }: { open: boolean; onClose(): void }): ReactNode {
  const data = useZentData()
  const unlocked = new Set(data.gamification.achievements.map((a) => a.id))
  const count = unlocked.size

  return (
    <Modal open={open} onClose={onClose} title="Conquistas" width={560}>
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] text-ink-soft">
          {count} de {ACHIEVEMENTS.length} desbloqueadas.
        </p>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ACHIEVEMENTS.map((a) => {
            const on = unlocked.has(a.id)
            const Icon = MEDAL_ICONS[a.icon]
            return (
              <li
                key={a.id}
                className={cn(
                  'flex flex-col items-center text-center gap-2 rounded-[14px] border p-4 transition-colors',
                  on ? 'border-line-strong bg-surface-2' : 'border-line bg-surface',
                )}
              >
                <span
                  className={cn(
                    'relative h-12 w-12 rounded-full inline-flex items-center justify-center',
                    on ? 'chip-glow bg-primary-soft' : 'bg-surface-2',
                  )}
                >
                  <Icon size={22} className={on ? 'text-primary' : 'text-ink-faint/50'} strokeWidth={1.7} />
                  {!on && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-surface border border-line inline-flex items-center justify-center">
                      <Lock size={11} className="text-ink-faint" />
                    </span>
                  )}
                </span>
                <span className={cn('text-[12.5px] font-semibold leading-tight', on ? 'text-ink' : 'text-ink-soft')}>
                  {a.title}
                </span>
                <span className="text-[11px] text-ink-faint leading-snug">{a.hint}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}
