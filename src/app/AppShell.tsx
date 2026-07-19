import { useEffect, useState, type ReactNode } from 'react'
import { useUiStore, type ViewId } from '@/store/uiStore'
import { toast } from '@/design/components/toast'
import { ShortcutsOverlay } from '@/features/common/ShortcutsOverlay'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { IncomePage } from '@/features/income/IncomePage'
import { ExpensesPage } from '@/features/expenses/ExpensesPage'
import { BanksPage } from '@/features/banks/BanksPage'
import { InstallmentsPage } from '@/features/installments/InstallmentsPage'
import { InvestmentsPage } from '@/features/investments/InvestmentsPage'
import { BoxesPage } from '@/features/boxes/BoxesPage'
import { TimelinePage } from '@/features/timeline/TimelinePage'
import { GlobalSearch } from '@/features/search/GlobalSearch'
import { Backdrop } from '@/design/Backdrop'

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

const MONEY_RE = /-?R\$\s?[\d.]+,\d{2}/

export function AppShell(): ReactNode {
  const activeView = useUiStore((s) => s.activeView)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const searchOpen = useUiStore((s) => s.searchOpen)
  const setSearchOpen = useUiStore((s) => s.setSearchOpen)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  // Atalhos globais: Ctrl+B sidebar · Ctrl+K busca · ? atalhos
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleSidebar()
      } else if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(!useUiStore.getState().searchOpen)
      } else if (e.key === '?' && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
        e.preventDefault()
        setShortcutsOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSidebar, setSearchOpen])

  // Clique em valor monetário copia para a área de transferência (§8).
  // Elementos interativos (botões/links/inputs) mantêm sua ação original.
  useEffect(() => {
    function onClick(e: MouseEvent): void {
      const target = e.target as HTMLElement | null
      if (!target) return
      const tnum = target.closest('.tnum')
      if (!tnum || tnum.closest('button, a, input, select, textarea, [role="tab"], [role="switch"]')) return
      if (useUiStore.getState().privacy) return
      const match = MONEY_RE.exec(tnum.textContent ?? '')
      if (!match) return
      void navigator.clipboard.writeText(match[0].replace(/\u00a0/g, ' ')).then(() => {
        toast.info('Valor copiado', match[0].replace(/\u00a0/g, ' '))
      })
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [])

  const View = VIEWS[activeView]

  // Fundo em 4 camadas (M3): o <Backdrop> full-viewport pinta base + glows por
  // seção + geometria assinatura + malha; o conteúdo vive acima dele (z-10).
  return (
    <div className="relative h-full flex flex-col theme-transition">
      <Backdrop section={activeView} />
      <div className="relative z-10 flex flex-col h-full min-h-0">
        <TitleBar />
        <div className="flex-1 min-h-0 flex">
          <Sidebar />
          <main className="flex-1 min-w-0 overflow-y-auto">
            {/* key força remontagem ao trocar de view — renderiza apenas a ativa;
                entrada com fade+slide e stagger sutil nos blocos (§5) */}
            <div
              key={activeView}
              className="page-enter stagger-children max-w-[1200px] mx-auto px-7 py-6 min-h-full"
            >
              <View />
            </div>
          </main>
        </div>
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}
