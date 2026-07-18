import { create } from 'zustand'

/**
 * Estado de bloqueio do app (M2 §b). NÃO é persistido de propósito: se houver
 * PIN, todo boot começa BLOQUEADO — o "auto-bloqueio ao abrir" é o padrão, e
 * persistir "desbloqueado" derrotaria o PIN. Se o app deve re-bloquear por
 * inatividade é uma preferência à parte (uiStore.lockInactivityMinutes).
 *
 * `hasPin` vem do processo main (`window.zent.hasPin()`), única fonte da verdade
 * sobre a existência do PIN — o renderer nunca vê o hash.
 */
interface SecurityState {
  /** null enquanto o boot ainda não perguntou ao main. */
  hasPin: boolean | null
  /** true = a tela de bloqueio está na frente de tudo. */
  locked: boolean
  /** `ZENT_NO_LOCK=1` (seam de teste): pula bloqueio E primeira execução. */
  bypassed: boolean
  /** Boot: descobre se há PIN e, se houver, começa bloqueado. */
  init(): Promise<void>
  /** Primeira execução concluída: o PIN acabou de ser definido. */
  markPinSet(): void
  /** PIN correto (ou primeira execução): libera o app. */
  unlock(): void
  /** Re-bloqueia (auto-bloqueio); no-op se não houver PIN. */
  lock(): void
  /** "Esqueci o PIN": some o PIN; o app segue aberto e sem bloqueio. */
  clearPin(): void
}

export const useSecurityStore = create<SecurityState>((set, get) => ({
  hasPin: null,
  locked: false,
  bypassed: false,
  init: async () => {
    if (window.zent.lockDisabled) {
      set({ bypassed: true, hasPin: false, locked: false })
      return
    }
    const has = await window.zent.hasPin()
    set({ hasPin: has, locked: has })
  },
  markPinSet: () => set({ hasPin: true, locked: false }),
  unlock: () => set({ locked: false }),
  lock: () => {
    if (get().hasPin) set({ locked: true })
  },
  clearPin: () => set({ hasPin: false, locked: false }),
}))
