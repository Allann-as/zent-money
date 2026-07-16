import { useEffect, type ReactNode } from 'react'
import { useUiStore, type ViewId } from '@/store/uiStore'
import { Sidebar } from './Sidebar'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { IncomePage } from '@/features/income/IncomePage'
import { ExpensesPage } from '@/features/expenses/ExpensesPage'
import { BanksPage } from '@/features/banks/BanksPage'
import { InstallmentsPage } from '@/features/installments/InstallmentsPage'
import { InvestmentsPage } from '@/features/investments/InvestmentsPage'
import { BoxesPage } from '@/features/boxes/BoxesPage'
import { TimelinePage } from '@/features/timeline/TimelinePage'
import { GlobalSearch } from '@/features/search/GlobalSearch'

const VIEWS: Record<ViewId, () => ReactNode> = {
  overview: OverviewPage,
  income: IncomePage,
  expenses: ExpensesPage,
  banks: BanksPage,
  installments: InstallmentsPage,
  investments: InvestmentsPage,
  boxes: BoxesPage,
  timeline: TimelinePage,
}

export function AppShell(): ReactNode {
  const activeView = useUiStore((s) => s.activeView)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const searchOpen = useUiStore((s) => s.searchOpen)
  const setSearchOpen = useUiStore((s) => s.setSearchOpen)

  // Atalhos globais: Ctrl+B alterna a sidebar · Ctrl+K abre a busca
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleSidebar()
      } else if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(!useUiStore.getState().searchOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSidebar, setSearchOpen])

  const View = VIEWS[activeView]

  return (
    <div className="h-full flex bg-bg theme-transition" style={{ background: 'var(--bg-grad)' }}>
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* key força remontagem ao trocar de view — renderiza apenas a ativa */}
        <div key={activeView} className="anim-fade-in max-w-[1200px] mx-auto px-7 py-6 min-h-full">
          <View />
        </div>
      </main>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
