import { useEffect, useState, type ReactNode } from 'react'
import {
  Flame,
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
  Sun,
  Moon,
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

/** Sidebar em 3 grupos (M3): Dia a dia · Crédito · Patrimônio. */
const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Dia a dia',
    items: [
      { id: 'today', label: 'Hoje', icon: Flame },
      { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
      { id: 'income', label: 'Ganhos', icon: TrendingUp },
      { id: 'expenses', label: 'Gastos', icon: ReceiptText },
    ],
  },
  {
    label: 'Crédito',
    items: [
      { id: 'banks', label: 'Bancos & Cartões', icon: CreditCard },
      { id: 'installments', label: 'Parcelas', icon: Layers },
    ],
  },
  {
    label: 'Patrimônio',
    items: [
      { id: 'investments', label: 'Carteira', icon: ChartLine },
      { id: 'boxes', label: 'Caixinhas', icon: PiggyBank },
      { id: 'timeline', label: 'Linha do tempo', icon: History },
    ],
  },
]

export function Sidebar(): ReactNode {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const activeView = useUiStore((s) => s.activeView)
  const setView = useUiStore((s) => s.setView)
  const setSearchOpen = useUiStore((s) => s.setSearchOpen)
  const privacy = useUiStore((s) => s.privacy)
  const togglePrivacy = useUiStore((s) => s.togglePrivacy)
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const data = useZentData()
  const [profileOpen, setProfileOpen] = useState(false)
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.zent.getVersion().then(setVersion)
  }, [])

  const initial = (data.profile.name.trim().charAt(0) || 'A').toUpperCase()

  return (
    <aside
      className={cn(
        'relative h-full shrink-0 flex flex-col border-r border-line bg-surface theme-transition',
        'transition-[width] duration-[240ms] [transition-timing-function:var(--ease-out-quint)]',
      )}
      style={{ width: collapsed ? 76 : 252 }}
    >
      {/* ── Hambúrguer + wordmark ──────────────────────────── */}
      <div className={cn('flex items-center pt-4 pb-1', collapsed ? 'px-0 justify-center' : 'gap-2 px-4')}>
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
      </div>

      {/* ── Perfil: colapsado = logo com halo · expandido = monograma "A" ── */}
      <div className={cn('pt-2 pb-4', collapsed ? 'px-0 flex justify-center' : 'px-4')}>
        {collapsed ? (
          <Tooltip label={`Olá, ${data.profile.name}`} side="right">
            <button
              type="button"
              aria-label="Abrir menu de perfil"
              onClick={() => setProfileOpen(true)}
              className="relative rounded-[12px] cursor-pointer transition-transform duration-150 hover:scale-105"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 -m-1.5 rounded-full blur-lg opacity-40"
                style={{ background: 'var(--primary)' }}
              />
              <span className="relative block">
                <ZentLogo size={38} />
              </span>
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="group flex items-center gap-2.5 cursor-pointer max-w-full anim-fade-in"
          >
            <Monogram initial={initial} />
            <div className="min-w-0 text-left">
              <span className="flex items-center gap-1">
                <span className="font-display text-[15px] font-semibold text-ink truncate group-hover:text-primary transition-colors">
                  Olá, {data.profile.name}
                </span>
                <ChevronDown size={13} className="text-ink-faint group-hover:text-primary transition-colors shrink-0" />
              </span>
              <p className="text-[11.5px] text-ink-faint leading-snug mt-0.5 first-letter:uppercase">
                {formatTodayLong()}
              </p>
            </div>
          </button>
        )}
      </div>

      <ProfileMenu open={profileOpen} onClose={() => setProfileOpen(false)} collapsed={collapsed} />

      {/* ── Navegação em 3 grupos ──────────────────────────── */}
      <nav className="flex-1 flex flex-col gap-0.5 px-3 overflow-y-auto overflow-x-hidden" aria-label="Seções">
        {GROUPS.map((group, gi) => (
          <div key={group.label} className="flex flex-col gap-1">
            {/* divisor 1px entre grupos (colapsado) · micro-rótulo caps (expandido) */}
            {gi > 0 && collapsed && <div aria-hidden="true" className="mx-3 my-2 h-px bg-line" />}
            {!collapsed && (
              <div className={cn('px-3.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint/80', gi === 0 ? 'pt-1' : 'pt-3')}>
                {group.label}
              </div>
            )}
            {group.items.map((item, idx) => {
              const active = item.id === activeView
              const Icon = item.icon
              const btn = (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center h-10 w-full transition-all duration-150 cursor-pointer',
                    collapsed ? 'justify-center rounded-[12px]' : 'gap-3 px-3.5 rounded-full',
                    active
                      ? 'bg-primary-soft text-primary'
                      : 'text-ink-soft hover:bg-surface-2 hover:text-ink active:bg-surface-3',
                  )}
                >
                  {/* barra lateral 2px no acento com glow (item ativo) */}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute left-1 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-full bg-primary"
                      style={{ boxShadow: '0 0 8px 1px var(--primary)' }}
                    />
                  )}
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.7} className="shrink-0" />
                  {!collapsed && (
                    <span
                      className={cn('text-[13.5px] truncate anim-fade-in', active ? 'font-semibold' : 'font-medium')}
                      style={{ animationDelay: `${idx * 15}ms` }}
                    >
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
          </div>
        ))}
      </nav>

      {/* ── Cluster inferior: busca · privacidade · tema ────── */}
      <div className={cn('mt-1 pt-3 border-t border-line', collapsed ? 'px-0' : 'px-3')}>
        <div className={cn('flex', collapsed ? 'flex-col items-center gap-1' : 'items-center gap-1 px-1')}>
          <Tooltip label="Buscar (Ctrl+K)" side="right" disabled={!collapsed}>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Buscar em tudo"
              title={collapsed ? undefined : 'Buscar (Ctrl+K)'}
              className="h-9 w-9 rounded-[10px] inline-flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 active:bg-surface-3 transition-colors cursor-pointer shrink-0"
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
                privacy ? 'text-primary bg-primary-soft' : 'text-ink-soft hover:text-ink hover:bg-surface-2 active:bg-surface-3',
              )}
            >
              {privacy ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </Tooltip>
          <Tooltip label={theme === 'dark' ? 'Tema claro' : 'Tema escuro'} side="right" disabled={!collapsed}>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              title={collapsed ? undefined : theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
              className="h-9 w-9 rounded-[10px] inline-flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 active:bg-surface-3 transition-colors cursor-pointer shrink-0"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </Tooltip>
        </div>

        {/* ── Rodapé com versão ────────────────────────────── */}
        <div className={cn('pt-2 pb-3', collapsed ? 'text-center' : 'px-2.5')}>
          <span className="text-[10.5px] text-ink-faint/70 tracking-wide tabular-nums">
            {collapsed ? (version ? `v${version}` : '') : version ? `Zent Money · v${version}` : 'Zent Money'}
          </span>
        </div>
      </div>
    </aside>
  )
}

/** Monograma "A" em círculo com anel (perfil expandido, M3). */
function Monogram({ initial }: { initial: string }): ReactNode {
  return (
    <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft">
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full"
        style={{ boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--primary) 45%, transparent)' }}
      />
      <span className="absolute inset-[3px] rounded-full border border-line-strong/60" />
      <span className="relative font-display text-[15px] font-bold text-primary">{initial}</span>
    </span>
  )
}
