import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
  WalletCards,
  PanelLeftClose,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useUiStore, type ViewId } from '@/store/uiStore'
import { useZentData } from '@/store/dataStore'
import { Tooltip } from '@/design/components/Tooltip'
import { ZentWordmark } from '@/design/ZentLogo'
import { formatTodayLong, todayIso } from '@/engine/dates'
import { dailyStreak } from '@/engine/today'
import { remainingInstallments } from '@/engine/cards'
import { boxStoredAmount } from '@/engine/ledger'
import { ProfileMenu } from './ProfileMenu'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MENU "BORDA VIVA" (R10 §4)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Recolhido, o menu não é uma coluna de ícones: é um FIO de 3px pulsando na
 * borda esquerda. Aproximar o cursor da zona quente de 34px desliza o painel de
 * 214px por cima do conteúdo; afastar recolhe. Ctrl+B (ou clicar no fio) TRAVA
 * o painel aberto, e aí ele volta a empurrar o conteúdo como um menu normal.
 *
 * ── O ESTADO CONTINUA SENDO UM SÓ (`sidebarCollapsed`) ──────────────────
 * "Recolhido" virou "não fixado". Reaproveitar o mesmo estado (em vez de
 * inventar um `pinned`) mantém a persistência, o Ctrl+B e os rótulos de
 * acessibilidade existentes valendo — inclusive o "Recolher menu"/"Expandir
 * menu" de que o E2E depende.
 *
 * ── POR QUE O PAINEL VIVE DENTRO DO <aside> ─────────────────────────────
 * Fixado, o <aside> mede 214px e empurra o conteúdo. Solto, ele mede 3px (o
 * fio) e o painel flutua sobre a página, ancorado nele. Manter os dois no mesmo
 * elemento é o que faz `aside >> text="Gastos"` continuar significando "o item
 * Gastos do menu" — o seletor que a suíte E2E inteira usa para navegar.
 */

interface NavItem {
  id: ViewId
  label: string
  icon: LucideIcon
  /**
   * Contador discreto à direita (§4) — null quando não há o que dizer.
   * `value` é o que aparece; `hint` é o que ele SIGNIFICA, e vai para o title.
   */
  counter?: (c: NavCounters) => { value: string; hint: string } | null
}

/** Números que o menu mostra sem que ninguém precise abrir a seção. */
interface NavCounters {
  streak: number
  todayExpenses: number
  activeInstallments: number
  goalRatio: number | null
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Dia a dia',
    items: [
      {
        id: 'today',
        label: 'Hoje',
        icon: Flame,
        counter: (c) =>
          c.streak > 0
            ? { value: `${c.streak}d`, hint: `${c.streak} ${c.streak === 1 ? 'dia' : 'dias'} de sequência` }
            : null,
      },
      { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
      { id: 'income', label: 'Ganhos', icon: TrendingUp },
      {
        id: 'expenses',
        label: 'Gastos',
        icon: ReceiptText,
        counter: (c) =>
          c.todayExpenses > 0
            ? {
                value: String(c.todayExpenses),
                hint: `${c.todayExpenses} ${c.todayExpenses === 1 ? 'gasto' : 'gastos'} hoje`,
              }
            : null,
      },
    ],
  },
  {
    label: 'Crédito',
    items: [
      { id: 'banks', label: 'Bancos & Cartões', icon: CreditCard },
      { id: 'credit', label: 'Crédito', icon: WalletCards },
      {
        id: 'installments',
        label: 'Parcelas',
        icon: Layers,
        counter: (c) =>
          c.activeInstallments > 0
            ? {
                value: String(c.activeInstallments),
                hint: `${c.activeInstallments} ${c.activeInstallments === 1 ? 'compra ativa' : 'compras ativas'}`,
              }
            : null,
      },
    ],
  },
  {
    label: 'Patrimônio',
    items: [
      { id: 'investments', label: 'Carteira', icon: ChartLine },
      {
        id: 'boxes',
        label: 'Caixinhas',
        icon: PiggyBank,
        counter: (c) =>
          c.goalRatio === null
            ? null
            : { value: `${Math.round(c.goalRatio * 100)}%`, hint: `${Math.round(c.goalRatio * 100)}% das metas` },
      },
      { id: 'timeline', label: 'Linha do tempo', icon: History },
    ],
  },
]

/** Largura do painel aberto (§4). */
const PANEL = 214
/** Largura do fio vivo quando o menu está solto. */
const THREAD = 3
/** Zona quente que revela o painel ao aproximar o cursor (§4). */
const HOT_ZONE = 34

/**
 * Contadores do menu. São LEITURAS de dados que já existem — nenhuma conta
 * financeira nova nasce aqui, como manda a regra permanente da release.
 * O ratio das caixinhas é o consolidado (guardado total ÷ soma das metas), e
 * não a média dos ratios: uma caixinha de R$ 50 batida não pode empatar com
 * uma de R$ 20 mil pela metade.
 */
function useNavCounters(): NavCounters {
  const data = useZentData()
  return useMemo(() => {
    const today = todayIso()
    let todayExpenses = 0
    for (const e of data.expenses) if (e.date === today) todayExpenses++
    let activeInstallments = 0
    for (const p of data.purchases) if (remainingInstallments(p) > 0) activeInstallments++
    let saved = 0
    let target = 0
    for (const b of data.boxes) {
      // Só caixinhas MANUAIS entram: a de investimento exige projetar o saldo
      // do ativo, conta cara demais para um contador de menu que roda a cada
      // render. Quem quer o número exato abre a seção.
      if (b.investmentId) continue
      saved += boxStoredAmount(b.id, b.manualAmount, data.boxTransfers)
      target += b.target
    }
    return {
      streak: dailyStreak(data, today),
      todayExpenses,
      activeInstallments,
      goalRatio: target > 0 ? Math.min(1, saved / target) : null,
    }
  }, [data])
}

export function Sidebar(): ReactNode {
  const pinned = !useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const activeView = useUiStore((s) => s.activeView)
  const setView = useUiStore((s) => s.setView)
  const data = useZentData()
  const counters = useNavCounters()
  const [profileOpen, setProfileOpen] = useState(false)
  const [peeking, setPeeking] = useState(false)
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.zent.getVersion().then(setVersion)
  }, [])

  // Fixar o menu encerra qualquer espiada em andamento — senão o painel ficaria
  // "aberto por hover" e "aberto por fixação" ao mesmo tempo, e sair com o
  // mouse tentaria fechar o que está travado.
  useEffect(() => {
    if (pinned) setPeeking(false)
  }, [pinned])

  const open = pinned || peeking
  const initial = (data.profile.name.trim().charAt(0) || 'A').toUpperCase()

  return (
    <aside
      className="relative h-full shrink-0"
      style={{
        width: pinned ? PANEL : THREAD,
        transition: 'width 300ms cubic-bezier(.22,1,.36,1)',
      }}
      /**
       * O gatilho da espiada mora no <aside>, não na zona quente.
       * `mouseenter` não borbulha entre IRMÃOS, e o fio de 3px fica por cima da
       * zona quente: entrando pelo fio — que é o caminho natural, já que ele é
       * a única coisa visível — o `onMouseEnter` da zona nunca disparava e o
       * painel não abria. No <aside>, entrar em qualquer descendente conta:
       * fio, zona quente ou o próprio painel.
       */
      onMouseEnter={() => {
        if (!pinned) setPeeking(true)
      }}
      onMouseLeave={() => setPeeking(false)}
    >
      {/* ── Fio vivo + zona quente (só com o menu solto) ────────────────── */}
      {!pinned && (
        <>
          {/* A zona quente é invisível e mais larga que o fio: o alvo de mira
              tem 34px (§4) mesmo o desenho tendo 3px. Ela não escuta evento
              nenhum — só estende a área que pertence ao <aside>. */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 z-20"
            style={{ width: HOT_ZONE }}
          />
          <button
            type="button"
            onClick={toggleSidebar}
            onFocus={() => setPeeking(true)}
            aria-label="Expandir menu"
            title="Fixar menu (Ctrl+B)"
            className="absolute inset-y-0 left-0 z-20 cursor-pointer anim-thread"
            style={{ width: THREAD, background: 'var(--primary)' }}
          />
        </>
      )}

      {/* ── Painel ──────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'absolute inset-y-0 left-0 z-30 flex flex-col border-r border-line',
          // Solto, o painel flutua SOBRE a página: aí ele precisa de sombra e de
          // um fundo mais opaco que o dos cards, ou o conteúdo apareceria por
          // baixo das letras do menu.
          pinned ? 'bg-surface' : 'bg-surface shadow-pop',
        )}
        style={{
          width: PANEL,
          transform: open ? 'translateX(0)' : `translateX(-${PANEL}px)`,
          transition: 'transform 300ms cubic-bezier(.22,1,.36,1)',
        }}
        onMouseEnter={() => {
          if (!pinned) setPeeking(true)
        }}
      >
        {/* ── Marca + fixar/soltar ──────────────────────────── */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-1">
          <ZentWordmark />
          <Tooltip label="Recolher (Ctrl+B)" side="right">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Recolher menu"
              className="ml-auto h-8 w-8 rounded-[9px] inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 active:bg-surface-3 transition-colors cursor-pointer shrink-0"
            >
              <PanelLeftClose size={16} />
            </button>
          </Tooltip>
        </div>

        {/* ── Perfil ────────────────────────────────────────── */}
        <div className="px-4 pt-2 pb-4">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="group flex items-center gap-2.5 cursor-pointer max-w-full"
          >
            <Monogram initial={initial} />
            <div className="min-w-0 text-left">
              <span className="flex items-center gap-1">
                <span className="font-display text-[14.5px] font-semibold text-ink truncate group-hover:text-primary transition-colors">
                  Olá, {data.profile.name}
                </span>
                <ChevronDown size={13} className="text-ink-faint group-hover:text-primary transition-colors shrink-0" />
              </span>
              <p className="text-[11px] text-ink-faint leading-snug mt-0.5 first-letter:uppercase">
                {formatTodayLong()}
              </p>
            </div>
          </button>
        </div>

        <ProfileMenu open={profileOpen} onClose={() => setProfileOpen(false)} collapsed={false} />

        {/* ── Navegação em 3 grupos, com contadores ─────────── */}
        <nav className="flex-1 flex flex-col gap-0.5 px-3 overflow-y-auto overflow-x-hidden" aria-label="Seções">
          {GROUPS.map((group, gi) => (
            <div key={group.label} className="flex flex-col gap-1">
              <div
                className={cn(
                  'px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint/80',
                  gi === 0 ? 'pt-1' : 'pt-3',
                )}
              >
                {group.label}
              </div>
              {group.items.map((item) => {
                const active = item.id === activeView
                const Icon = item.icon
                const badge = item.counter ? item.counter(counters) : null
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setView(item.id)}
                    aria-current={active ? 'page' : undefined}
                    title={badge === null ? undefined : `${item.label} · ${badge.hint}`}
                    className={cn(
                      // Raio 11px, a mesma gramática dos botões (§6): o menu
                      // deixou de usar pílula oval junto com eles.
                      'relative flex items-center gap-3 h-9.5 w-full pl-3.5 pr-2.5 rounded-[11px]',
                      'transition-colors duration-150 cursor-pointer text-left',
                      active
                        ? 'bg-primary-soft text-primary'
                        : 'text-ink-soft hover:bg-surface-2 hover:text-ink active:bg-surface-3',
                    )}
                  >
                    {/* barra lateral 2,5px no acento com glow (item ativo) */}
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0.5 top-1/2 -translate-y-1/2 h-5 w-[2.5px] rounded-full bg-primary"
                        style={{ boxShadow: '0 0 8px 1px var(--primary)' }}
                      />
                    )}
                    <Icon size={17} strokeWidth={active ? 2.2 : 1.7} className="shrink-0" />
                    <span className={cn('text-[13px] truncate', active ? 'font-semibold' : 'font-medium')}>
                      {item.label}
                    </span>
                    {/**
                      * O contador é `aria-hidden` de propósito: sem isso, o nome
                      * ACESSÍVEL do item vira "Gastos 3" e passa a depender do
                      * dado do dia — qualquer navegação por nome (leitor de tela
                      * ou teste) quebra sozinha quando o número aparece. O
                      * significado não se perde: vai no `title` do botão, que
                      * diz "Gastos · 3 gastos hoje" em vez do número solto.
                      */}
                    {badge !== null && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'ml-auto shrink-0 tnum text-[10.5px] tabular-nums',
                          active ? 'text-primary/80' : 'text-ink-faint',
                        )}
                      >
                        {badge.value}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* ── Rodapé com versão ──────────────────────────────
            Busca, privacidade e tema saíram daqui: viraram a ilha de ações
            flutuante (§5, ver design/components/ActionIsland). */}
        <div className="px-4 pt-3 pb-3 border-t border-line">
          <span className="text-[10.5px] text-ink-faint/70 tracking-wide tabular-nums">
            {version ? `Zent Money · v${version}` : 'Zent Money'}
          </span>
        </div>
      </div>
    </aside>
  )
}

/** Monograma "A" em círculo com anel (perfil). */
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
