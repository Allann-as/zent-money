import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { currentYm, type Ym } from '@/engine/dates'

export type ViewId =
  | 'overview'
  | 'income'
  | 'expenses'
  | 'banks'
  | 'installments'
  | 'investments'
  | 'boxes'
  | 'timeline'

export type Theme = 'dark' | 'light'

/** Ação rápida disparada pela paleta de comandos, consumida pela seção alvo. */
export type PendingAction = 'new-expense' | 'new-income' | 'new-asset' | 'new-box' | null

interface UiState {
  theme: Theme
  sidebarCollapsed: boolean
  activeView: ViewId
  /** Mês ativo compartilhado pelas seções com navegação ‹ › . */
  activeYm: Ym
  /** Busca global / paleta de comandos (Ctrl+K). */
  searchOpen: boolean
  /** Modo privacidade: borra todos os valores monetários (persistido). */
  privacy: boolean
  pendingAction: PendingAction
  setTheme(theme: Theme): void
  toggleTheme(): void
  toggleSidebar(): void
  setView(view: ViewId): void
  setYm(ym: Ym): void
  setSearchOpen(open: boolean): void
  togglePrivacy(): void
  setPendingAction(action: PendingAction): void
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme
}

function applyPrivacy(on: boolean): void {
  document.documentElement.dataset['privacy'] = on ? 'on' : 'off'
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      activeView: 'overview',
      activeYm: currentYm(),
      searchOpen: false,
      privacy: false,
      pendingAction: null,
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      togglePrivacy: () => {
        const next = !get().privacy
        applyPrivacy(next)
        set({ privacy: next })
      },
      setPendingAction: (pendingAction) => set({ pendingAction }),
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setView: (activeView) => set({ activeView }),
      setYm: (activeYm) => set({ activeYm }),
    }),
    {
      name: 'zent-ui',
      // activeView/activeYm são de sessão; tema, sidebar e privacidade persistem
      partialize: (s) => ({
        theme: s.theme,
        sidebarCollapsed: s.sidebarCollapsed,
        privacy: s.privacy,
      }),
      onRehydrateStorage: () => (state) => {
        applyTheme(state?.theme ?? 'dark')
        applyPrivacy(state?.privacy ?? false)
      },
    },
  ),
)
