import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ChartLine,
  CreditCard,
  Eye,
  Gift,
  Landmark,
  Layers,
  PanelLeft,
  PiggyBank,
  Plus,
  ReceiptText,
  Search,
  SunMoon,
  Tags,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useUiStore, type ViewId } from '@/store/uiStore'
import { useZentData } from '@/store/dataStore'
import { useBRL } from '@/design/money'
import { formatDateBR, ymOfDate } from '@/engine/dates'

interface SearchResult {
  id: string
  icon: LucideIcon
  title: string
  subtitle: string
  view?: ViewId
  /** Mês para posicionar a navegação (itens datados). */
  ym?: string
  /** Ação rápida da paleta de comandos (executada no lugar da navegação). */
  run?: () => void
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

const SECTION_ENTRIES: { view: ViewId; label: string; icon: LucideIcon }[] = [
  { view: 'overview', label: 'Visão geral', icon: Search },
  { view: 'income', label: 'Ganhos', icon: Gift },
  { view: 'expenses', label: 'Gastos', icon: ReceiptText },
  { view: 'banks', label: 'Bancos & Cartões', icon: Landmark },
  { view: 'installments', label: 'Parcelas', icon: Layers },
  { view: 'investments', label: 'Carteira', icon: ChartLine },
  { view: 'boxes', label: 'Caixinhas', icon: PiggyBank },
  { view: 'timeline', label: 'Linha do tempo', icon: Search },
]

/**
 * Busca global (Ctrl+K): encontra lançamentos, ativos, caixinhas, cartões,
 * bancos, categorias e seções; navegar seleciona a seção (e o mês, para
 * itens datados).
 */
export function GlobalSearch({ open, onClose }: { open: boolean; onClose(): void }): ReactNode {
  const data = useZentData()
  const setView = useUiStore((s) => s.setView)
  const setYm = useUiStore((s) => s.setYm)
  const setPendingAction = useUiStore((s) => s.setPendingAction)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const togglePrivacy = useUiStore((s) => s.togglePrivacy)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const brl = useBRL()

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const results = useMemo<SearchResult[]>(() => {
    const q = normalize(query.trim())

    // Paleta de comandos: ações rápidas (mostradas quando vazio; filtráveis)
    const actions: SearchResult[] = [
      {
        id: 'act-new-expense',
        icon: Plus,
        title: 'Novo gasto',
        subtitle: 'Ação · abre o formulário em Gastos',
        view: 'expenses',
        run: () => setPendingAction('new-expense'),
      },
      {
        id: 'act-new-income',
        icon: Plus,
        title: 'Novo ganho extra',
        subtitle: 'Ação · abre o formulário em Ganhos',
        view: 'income',
        run: () => setPendingAction('new-income'),
      },
      {
        id: 'act-new-asset',
        icon: Plus,
        title: 'Novo ativo',
        subtitle: 'Ação · abre o formulário na Carteira',
        view: 'investments',
        run: () => setPendingAction('new-asset'),
      },
      {
        id: 'act-new-box',
        icon: Plus,
        title: 'Nova caixinha',
        subtitle: 'Ação · abre o formulário em Caixinhas',
        view: 'boxes',
        run: () => setPendingAction('new-box'),
      },
      { id: 'act-theme', icon: SunMoon, title: 'Alternar tema claro/escuro', subtitle: 'Ação', run: toggleTheme },
      { id: 'act-privacy', icon: Eye, title: 'Alternar modo privacidade', subtitle: 'Ação · borra os valores', run: togglePrivacy },
      { id: 'act-sidebar', icon: PanelLeft, title: 'Recolher / expandir menu', subtitle: 'Ação', run: toggleSidebar },
    ]
    const matchedActions = actions.filter((a) => q === '' || normalize(a.title).includes(q))

    if (q === '') return matchedActions
    const out: SearchResult[] = [...matchedActions]
    const catById = new Map(data.categories.map((c) => [c.id, c]))
    const bankById = new Map(data.banks.map((b) => [b.id, b]))

    for (const s of SECTION_ENTRIES) {
      if (normalize(s.label).includes(q)) {
        out.push({ id: `sec-${s.view}`, icon: s.icon, title: s.label, subtitle: 'Seção', view: s.view })
      }
    }
    for (const c of data.categories) {
      if (normalize(c.name).includes(q)) {
        out.push({
          id: `cat-${c.id}`,
          icon: Tags,
          title: c.name,
          subtitle: 'Categoria de gastos',
          view: 'expenses',
        })
      }
    }
    for (const b of data.banks) {
      if (normalize(b.name).includes(q)) {
        out.push({ id: `bank-${b.id}`, icon: Landmark, title: b.name, subtitle: 'Banco', view: 'banks' })
      }
    }
    for (const c of data.cards) {
      if (normalize(c.name).includes(q)) {
        out.push({
          id: `card-${c.id}`,
          icon: CreditCard,
          title: c.name,
          subtitle: `Cartão · ${bankById.get(c.bankId)?.name ?? ''}`,
          view: 'banks',
        })
      }
    }
    for (const p of data.purchases) {
      if (normalize(p.name).includes(q)) {
        out.push({
          id: `pur-${p.id}`,
          icon: Layers,
          title: p.name,
          subtitle: `Compra parcelada · ${brl(p.installmentAmount)}/mês`,
          view: 'installments',
        })
      }
    }
    for (const i of data.investments) {
      if (normalize(i.name).includes(q)) {
        out.push({
          id: `inv-${i.id}`,
          icon: ChartLine,
          title: i.name,
          subtitle: `Ativo · ${bankById.get(i.bankId)?.name ?? ''}`,
          view: 'investments',
        })
      }
    }
    for (const b of data.boxes) {
      if (normalize(b.name).includes(q)) {
        out.push({
          id: `box-${b.id}`,
          icon: PiggyBank,
          title: b.name,
          subtitle: `Caixinha · alvo ${brl(b.target)}`,
          view: 'boxes',
        })
      }
    }
    // lançamentos (mais recentes primeiro, até 12 de cada)
    const expenses = [...data.expenses]
      .filter(
        (e) =>
          normalize(e.description).includes(q) ||
          normalize(catById.get(e.categoryId)?.name ?? '').includes(q),
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 12)
    for (const e of expenses) {
      out.push({
        id: `exp-${e.id}`,
        icon: ReceiptText,
        title: e.description || catById.get(e.categoryId)?.name || 'Gasto',
        subtitle: `Gasto · ${formatDateBR(e.date)} · ${brl(e.amount)}`,
        view: 'expenses',
        ym: ymOfDate(e.date),
      })
    }
    const extras = [...data.extraIncomes]
      .filter((e) => normalize(e.description).includes(q))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 12)
    for (const e of extras) {
      out.push({
        id: `inc-${e.id}`,
        icon: Gift,
        title: e.description,
        subtitle: `Ganho extra · ${formatDateBR(e.date)} · ${brl(e.amount)}`,
        view: 'income',
        ym: ymOfDate(e.date),
      })
    }
    return out.slice(0, 20)
  }, [query, data, setPendingAction, toggleTheme, togglePrivacy, toggleSidebar, brl])

  useEffect(() => {
    setSelected(0)
  }, [results.length])

  function go(r: SearchResult): void {
    if (r.ym) setYm(r.ym)
    if (r.view) setView(r.view)
    r.run?.()
    onClose()
  }

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-6 anim-fade-in"
      style={{ background: 'var(--backdrop)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-label="Busca global"
        className="w-full max-w-[540px] bg-surface border border-line rounded-card shadow-pop anim-pop-in overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 border-b border-line h-[52px]">
          <Search size={16} className="text-ink-faint shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelected((s) => Math.min(results.length - 1, s + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelected((s) => Math.max(0, s - 1))
              } else if (e.key === 'Enter') {
                const r = results[selected]
                if (r) go(r)
              }
            }}
            placeholder="Buscar gastos, ativos, cartões, caixinhas…"
            aria-label="Buscar em tudo"
            className="flex-1 bg-transparent outline-none text-[14px] text-ink placeholder:text-ink-faint"
          />
          <kbd className="text-[10.5px] text-ink-faint border border-line rounded px-1.5 py-0.5 font-sans shrink-0">
            Esc
          </kbd>
        </div>

        {results.length === 0 && query.trim() === '' ? (
          <p className="px-4 py-5 text-[12.5px] text-ink-faint">
            Digite para buscar em lançamentos, ativos, cartões, caixinhas, bancos, categorias e seções.
          </p>
        ) : results.length === 0 ? (
          <p className="px-4 py-5 text-[12.5px] text-ink-faint">
            Nada encontrado para “{query.trim()}”.
          </p>
        ) : (
          <ul ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5" role="listbox">
            {results.map((r, i) => {
              const Icon = r.icon
              return (
                <li key={r.id} role="option" aria-selected={i === selected}>
                  <button
                    type="button"
                    onClick={() => go(r)}
                    onMouseEnter={() => setSelected(i)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 h-11 rounded-[10px] text-left cursor-pointer transition-colors',
                      i === selected ? 'bg-primary-soft' : 'hover:bg-surface-2',
                    )}
                  >
                    <span className="h-7.5 w-7.5 rounded-[9px] bg-primary-soft inline-flex items-center justify-center shrink-0">
                      <Icon size={14} className="text-primary" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-ink truncate">{r.title}</span>
                      <span className="block text-[11.5px] text-ink-faint truncate tnum">
                        {r.subtitle}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  )
}
