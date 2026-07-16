import { useState, type ReactNode } from 'react'
import {
  LayoutDashboard,
  TrendingUp,
  ReceiptText,
  CreditCard,
  ChartLine,
  PiggyBank,
  History,
  Layers,
  Menu,
  Search,
  Eye,
  EyeOff,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useUiStore, type ViewId } from '@/store/uiStore'
import { useZentData } from '@/store/dataStore'
import { Tooltip } from '@/design/components/Tooltip'
import { ZentLogo, ZentWordmark } from '@/design/ZentLogo'
import { formatTodayLong } from '@/engine/dates'
import { ProfileMenu } from './ProfileMenu'

interface NavItem {
  id: ViewId
  label: string
  icon: LucideIcon
}

const NAV: NavItem[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'income', label: 'Ganhos', icon: TrendingUp },
  { id: 'expenses', label: 'Gastos', icon: ReceiptText },
  { id: 'banks', label: 'Bancos & Cartões', icon: CreditCard },
  { id: 'installments', label: 'Parcelas', icon: Layers },
  { id: 'investments', label: 'Carteira', icon: ChartLine },
  { id: 'boxes', label: 'Caixinhas', icon: PiggyBank },
  { id: 'timeline', label: 'Linha do tempo', icon: History },
]

export function Sidebar(): ReactNode {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const activeView = useUiStore((s) => s.activeView)
  const setView = useUiStore((s) => s.setView)
  const setSearchOpen = useUiStore((s) => s.setSearchOpen)
  const privacy = useUiStore((s) => s.privacy)
  const togglePrivacy = useUiStore((s) => s.togglePrivacy)
  const data = useZentData()
  const [profileOpen, setProfileOpen] = useState(false)

  return (
    <aside
      className={cn(
        'relative h-full shrink-0 flex flex-col border-r border-line bg-surface theme-transition',
        'transition-[width] duration-250 [transition-timing-function:var(--ease-out-quint)]',
      )}
      style={{ width: collapsed ? 76 : 252 }}
    >
      {/* ── Hambúrguer + logo ─────────────────────────────── */}
      <div
        className={cn(
          'flex items-center pt-4 pb-1',
          collapsed ? 'flex-col gap-2 px-0 justify-center' : 'gap-2 px-4',
        )}
      >
        <Tooltip label={collapsed ? 'Expandir (Ctrl+B)' : 'Recolher (Ctrl+B)'} side="right" disabled={!collapsed}>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? undefined : 'Recolher (Ctrl+B)'}
            className="h-9 w-9 rounded-[10px] inline-flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 active:bg-surface-3 transition-colors cursor-pointer shrink-0"
          >
            <Menu size={18} />
          </button>
        </Tooltip>
        {!collapsed && <ZentWordmark className="anim-fade-in" />}
        <Tooltip label="Buscar (Ctrl+K)" side="right" disabled={!collapsed}>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Buscar em tudo"
            title={collapsed ? undefined : 'Buscar (Ctrl+K)'}
            className={cn(
              'h-9 w-9 rounded-[10px] inline-flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 active:bg-surface-3 transition-colors cursor-pointer shrink-0',
              !collapsed && 'ml-auto',
            )}
          >
            <Search size={16} />
          </button>
        </Tooltip>
        <Tooltip label={privacy ? 'Mostrar valores' : 'Modo privacidade'} side="right" disabled={!collapsed}>
          <button
            type="button"
            onClick={togglePrivacy}
            aria-label={privacy ? 'Mostrar valores' : 'Ocultar valores (modo privacidade)'}
            aria-pressed={privacy}
            title={collapsed ? undefined : privacy ? 'Mostrar valores' : 'Modo privacidade'}
            className={cn(
              'h-9 w-9 rounded-[10px] inline-flex items-center justify-center transition-colors cursor-pointer shrink-0',
              privacy
                ? 'text-primary bg-primary-soft'
                : 'text-ink-soft hover:text-ink hover:bg-surface-2 active:bg-surface-3',
            )}
          >
            {privacy ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </Tooltip>
      </div>

      {/* ── Perfil ─────────────────────────────────────────── */}
      <div className={cn('pt-2 pb-4', collapsed ? 'px-0 flex justify-center' : 'px-4')}>
        {collapsed ? (
          <Tooltip label={`Olá, ${data.profile.name}`} side="right">
            <button
              type="button"
              aria-label="Abrir menu de perfil"
              onClick={() => setProfileOpen(true)}
              className="rounded-[12px] cursor-pointer transition-transform duration-150 hover:scale-105"
            >
              <ZentLogo size={38} />
            </button>
          </Tooltip>
        ) : (
          <div className="min-w-0 anim-fade-in">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="group flex items-center gap-1 cursor-pointer max-w-full"
            >
              <span className="font-display text-[15px] font-semibold text-ink truncate group-hover:text-primary transition-colors">
                Olá, {data.profile.name}
              </span>
              <ChevronDown
                size={13}
                className="text-ink-faint group-hover:text-primary transition-colors shrink-0"
              />
            </button>
            <p className="text-[11.5px] text-ink-faint leading-snug mt-0.5 first-letter:uppercase">
              {formatTodayLong()}
            </p>
          </div>
        )}
      </div>

      <ProfileMenu open={profileOpen} onClose={() => setProfileOpen(false)} collapsed={collapsed} />

      {/* ── Navegação (item ativo em pílula) ───────────────── */}
      <nav className="flex-1 flex flex-col gap-1 px-3 overflow-y-auto" aria-label="Seções">
        {NAV.map((item) => {
          const active = item.id === activeView
          const Icon = item.icon
          const btn = (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center h-10 w-full transition-all duration-150 cursor-pointer',
                collapsed ? 'justify-center rounded-[12px]' : 'gap-3 px-3.5 rounded-full',
                active
                  ? 'bg-primary-soft text-primary'
                  : 'text-ink-soft hover:bg-surface-2 hover:text-ink active:bg-surface-3',
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.2 : 1.7} className="shrink-0" />
              {!collapsed && (
                <span className={cn('text-[13.5px] truncate', active ? 'font-semibold' : 'font-medium')}>
                  {item.label}
                </span>
              )}
            </button>
          )
          return collapsed ? (
            <Tooltip key={item.id} label={item.label} side="right">
              {btn}
            </Tooltip>
          ) : (
            btn
          )
        })}
      </nav>

    </aside>
  )
}
