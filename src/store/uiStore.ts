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

/** Como o "Resumo por categoria" (Gastos) é desenhado (M1 §b, preferência persistida). */
export type CategoryChartMode = 'bars' | 'donut'

/** Ação rápida disparada pela paleta de comandos, consumida pela seção alvo. */
export type PendingAction = 'new-expense' | 'new-income' | 'new-asset' | 'new-box' | null

interface UiState {
  theme: Theme
  sidebarCollapsed: boolean
  activeView: ViewId
  /** Mês ativo compartilhado pelas seções com navegação ‹ › . */
  activeYm: Ym
  /**
   * Banco aberto no drill-down (R3 §3.3) — rota filha de 'banks': quando
   * preenchido, a seção Bancos & Cartões mostra a página do banco no lugar da
   * lista. Trocar de seção volta para a lista.
   */
  bankDetailId: string | null
  openBankDetail(bankId: string): void
  closeBankDetail(): void
  /** Busca global / paleta de comandos (Ctrl+K). */
  searchOpen: boolean
  /** Modo privacidade: borra todos os valores monetários (persistido). */
  privacy: boolean
  /** Preferência de visualização do "Resumo por categoria" (Gastos). */
  categoryChartMode: CategoryChartMode
  /**
   * Auto-bloqueio por inatividade (M2 §b): minutos sem interação até re-bloquear.
   * null = só bloqueia ao abrir o app (padrão). Só tem efeito com PIN definido.
   */
  lockInactivityMinutes: number | null
  pendingAction: PendingAction
  setTheme(theme: Theme): void
  toggleTheme(): void
  toggleSidebar(): void
  setView(view: ViewId): void
  setYm(ym: Ym): void
  setSearchOpen(open: boolean): void
  togglePrivacy(): void
  setCategoryChartMode(mode: CategoryChartMode): void
  setLockInactivityMinutes(minutes: number | null): void
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
      bankDetailId: null,
      openBankDetail: (bankDetailId) => set({ activeView: 'banks', bankDetailId }),
      closeBankDetail: () => set({ bankDetailId: null }),
      searchOpen: false,
      privacy: false,
      categoryChartMode: 'bars',
      lockInactivityMinutes: null,
      pendingAction: null,
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setCategoryChartMode: (categoryChartMode) => set({ categoryChartMode }),
      setLockInactivityMinutes: (lockInactivityMinutes) => set({ lockInactivityMinutes }),
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
      // sair da seção fecha o drill-down: voltar a Bancos mostra a lista
      setView: (activeView) => set({ activeView, bankDetailId: null }),
      setYm: (activeYm) => set({ activeYm }),
    }),
    {
      name: 'zent-ui',
      // activeView/activeYm são de sessão; tema, sidebar e privacidade persistem
      partialize: (s) => ({
        theme: s.theme,
        sidebarCollapsed: s.sidebarCollapsed,
        privacy: s.privacy,
        categoryChartMode: s.categoryChartMode,
        lockInactivityMinutes: s.lockInactivityMinutes,
      }),
      onRehydrateStorage: () => (state) => {
        applyTheme(state?.theme ?? 'dark')
        applyPrivacy(state?.privacy ?? false)
      },
    },
  ),
)
