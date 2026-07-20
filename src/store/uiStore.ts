import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { currentYm, type Ym } from '@/engine/dates'

export type ViewId =
  | 'today'
  | 'overview'
  | 'income'
  | 'expenses'
  | 'banks'
  | 'credit'
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
  /**
   * "Fechar minimiza para a bandeja" (M5): o X esconde o app na bandeja em vez
   * de encerrar, mantendo o ícone e o atalho global vivos. Default ligado.
   */
  minimizeToTray: boolean
  pendingAction: PendingAction
  /**
   * Teto diário configurável (v2.1 §2), em centavos. É o FALLBACK do anel da
   * tela Hoje quando nenhuma categoria tem limite (a fórmula principal usa o
   * orçamento efetivo). null = sem teto → o anel mostra só o gasto do dia, sem
   * denominador (nunca se inventa um teto). Preferência de UI, em localStorage.
   */
  dailyCapCents: number | null
  setTheme(theme: Theme): void
  toggleTheme(): void
  toggleSidebar(): void
  setView(view: ViewId): void
  setYm(ym: Ym): void
  setSearchOpen(open: boolean): void
  togglePrivacy(): void
  setCategoryChartMode(mode: CategoryChartMode): void
  setLockInactivityMinutes(minutes: number | null): void
  setMinimizeToTray(on: boolean): void
  setPendingAction(action: PendingAction): void
  setDailyCapCents(cents: number | null): void
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
      // A tela "Hoje" é a porta de entrada do loop diário (v2.1 §2): é o que
      // faz abrir o app todo dia, então é a seção inicial padrão. `activeView`
      // persiste, então quem já usava reabre onde estava.
      activeView: 'today',
      activeYm: currentYm(),
      bankDetailId: null,
      openBankDetail: (bankDetailId) => set({ activeView: 'banks', bankDetailId }),
      closeBankDetail: () => set({ bankDetailId: null }),
      searchOpen: false,
      privacy: false,
      categoryChartMode: 'bars',
      lockInactivityMinutes: null,
      minimizeToTray: true,
      pendingAction: null,
      dailyCapCents: null,
      setDailyCapCents: (dailyCapCents) => set({ dailyCapCents }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setCategoryChartMode: (categoryChartMode) => set({ categoryChartMode }),
      setLockInactivityMinutes: (lockInactivityMinutes) => set({ lockInactivityMinutes }),
      setMinimizeToTray: (minimizeToTray) => set({ minimizeToTray }),
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
      // `activeView` persiste: fechar e reabrir volta à seção onde eu estava,
      // igual ao re-lock por inatividade (que mantém a seção porque o store não
      // é resetado). `activeYm` segue de sessão de propósito — reabrir no mês
      // corrente é o comportamento esperado; `bankDetailId` também não persiste,
      // então uma seção 'banks' reabre na lista, não num drill-down órfão.
      partialize: (s) => ({
        theme: s.theme,
        sidebarCollapsed: s.sidebarCollapsed,
        activeView: s.activeView,
        privacy: s.privacy,
        categoryChartMode: s.categoryChartMode,
        lockInactivityMinutes: s.lockInactivityMinutes,
        minimizeToTray: s.minimizeToTray,
        dailyCapCents: s.dailyCapCents,
      }),
      onRehydrateStorage: () => (state) => {
        applyTheme(state?.theme ?? 'dark')
        applyPrivacy(state?.privacy ?? false)
      },
    },
  ),
)
