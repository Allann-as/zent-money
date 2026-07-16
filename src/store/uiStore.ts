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

interface UiState {
  theme: Theme
  sidebarCollapsed: boolean
  activeView: ViewId
  /** Mês ativo compartilhado pelas seções com navegação ‹ › . */
  activeYm: Ym
  /** Busca global (Ctrl+K). */
  searchOpen: boolean
  setTheme(theme: Theme): void
  toggleTheme(): void
  toggleSidebar(): void
  setView(view: ViewId): void
  setYm(ym: Ym): void
  setSearchOpen(open: boolean): void
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      activeView: 'overview',
      activeYm: currentYm(),
      searchOpen: false,
      setSearchOpen: (searchOpen) => set({ searchOpen }),
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
      // activeView/activeYm são de sessão; só tema e sidebar persistem
      partialize: (s) => ({ theme: s.theme, sidebarCollapsed: s.sidebarCollapsed }),
      onRehydrateStorage: () => (state) => {
        applyTheme(state?.theme ?? 'dark')
      },
    },
  ),
)
