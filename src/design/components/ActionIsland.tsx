import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Search, Eye, EyeOff, Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useUiStore } from '@/store/uiStore'
import { Tooltip } from '@/design/components/Tooltip'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ILHA DE AÇÕES (R10 §5) — busca · privacidade · tema
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Saiu do rodapé do menu e virou uma ilha flutuante no canto inferior direito:
 * 42% de opacidade em repouso, 100% no hover ou no foco por teclado. Com o menu
 * agora recolhido a um fio (§4), essas três ações precisavam de uma casa que
 * não dependesse do painel estar aberto.
 *
 * ── "NÃO PODE FICAR NA FRENTE DE NADA" É RESOLVIDO EM DOIS LUGARES ──────
 * 1. AQUI: a ilha some quando existe qualquer diálogo por cima (modal, menu de
 *    perfil, busca) — flutuar sobre um backdrop escurecido seria exatamente
 *    "ficar na frente".
 * 2. NO CONTEÚDO: o container de rolagem reserva a altura da ilha no padding
 *    inferior (ver AppShell). Esconder é reação; reservar é garantia — sem a
 *    reserva, bastaria uma página comprida em qualquer resolução para o último
 *    card terminar embaixo da ilha.
 *
 * A detecção de diálogo é um observador do `document.body`: todos os overlays
 * do app entram por `createPortal` como filhos diretos dele e todos marcam
 * `role="dialog"`. Observar o DOM em vez de pedir para cada overlay avisar
 * mantém a ilha correta para overlays que ainda nem existem.
 */

/**
 * Altura reservada para a ilha no rodapé das páginas (px).
 *
 * A ilha ocupa ~42px e fica a 16px da borda, então 58px já bastariam para não
 * haver sobreposição. São 88 porque "não ficar na frente" não é só não
 * encostar: com a reserva anterior (68), o último card da Carteira parava a
 * 10px da ilha a 1366×768 — tecnicamente descoberto, visualmente espremido. A
 * folga extra é o que faz a ilha parecer flutuar sobre a página em vez de
 * disputar espaço com ela. Medido por scripts/verify-island.mjs.
 */
export const ISLAND_SAFE_AREA = 88

function useOverlayOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const check = (): void => setOpen(document.querySelector('[role="dialog"]') !== null)
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  return open
}

/** Canto de reaproximação: aproximar o cursor daqui traz a ilha de volta. */
const HOT_CORNER = { w: 200, h: 120 }

/**
 * A ilha some quando há conteúdo EMBAIXO dela — e volta ao aproximar o cursor.
 *
 * ── POR QUE ISTO PRECISOU EXISTIR ───────────────────────────────────────
 * A reserva de padding no rodapé (ISLAND_SAFE_AREA) garante que o FIM da
 * página nunca termine sob a ilha. Mas uma página que rola tem meio, não só
 * fim: parada na metade da lista de orçamento, a ilha ficava por cima de
 * "R$ 200,00". Translúcida a 42%, mas por cima — e o § é categórico: ela não
 * pode ficar na frente de NADA, em nenhuma resolução.
 *
 * A checagem é um teste de acerto em 3 pontos do retângulo da ilha, feito só
 * quando a rolagem para (não a cada evento de scroll) e usando
 * `elementsFromPoint`, que devolve a pilha inteira — assim dá para ignorar a
 * própria ilha e olhar o que está de fato atrás dela.
 *
 * O canto quente é o que impede a cura de virar doença: sem ele, quem parasse
 * de rolar no meio de uma lista comprida ficaria sem busca, sem privacidade e
 * sem troca de tema até rolar de novo.
 */
function useIslandClear(ref: React.RefObject<HTMLDivElement | null>, watch: unknown[]): boolean {
  const [blocked, setBlocked] = useState(false)
  const [nearCorner, setNearCorner] = useState(false)

  useEffect(() => {
    let idle: ReturnType<typeof setTimeout>

    function measure(): void {
      const el = ref.current
      if (el === null) return
      const r = el.getBoundingClientRect()
      /**
       * Amostra uma grade sobre o retângulo da ilha DILATADO por `HALO`.
       *
       * O halo é a diferença entre "não cobre" e "não incomoda": um card que
       * para a 4px da ilha está tecnicamente descoberto e visualmente
       * espremido. O mesmo valor está em scripts/verify-island.mjs de
       * propósito — o app tem de esconder a ilha exatamente nos casos que o
       * verificador reprova, senão um dos dois está medindo outra coisa.
       */
      const HALO = 8
      const xs = [r.left - HALO, r.left, r.left + r.width / 2, r.right, r.right + HALO]
      const ys = [r.top - HALO, r.top, r.top + r.height / 2, r.bottom, r.bottom + HALO]
      const points: [number, number][] = []
      for (const x of xs) {
        for (const y of ys) {
          if (x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight) {
            points.push([x, y])
          }
        }
      }
      const covered = points.some(([x, y]) =>
        document.elementsFromPoint(x, y).some((node) => {
          if (el.contains(node)) return false // a própria ilha não conta
          if (node.matches('main, aside, body, html, canvas')) return false
          const style = getComputedStyle(node)
          if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') return true
          return Array.from(node.childNodes).some(
            (n) => n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim() !== '',
          )
        }),
      )
      setBlocked(covered)
    }

    function onScroll(): void {
      // Some na hora que a rolagem começa; só remede quando ela para.
      setBlocked(true)
      clearTimeout(idle)
      idle = setTimeout(measure, 220)
    }

    function onMove(e: MouseEvent): void {
      setNearCorner(
        e.clientX > window.innerWidth - HOT_CORNER.w && e.clientY > window.innerHeight - HOT_CORNER.h,
      )
    }

    /**
     * Remedir na TROCA DE SEÇÃO e quando o conteúdo muda de altura, não só ao
     * rolar. A primeira versão só media no scroll, e por isso uma seção que
     * ABRIA já com conteúdo sob a ilha (janela pequena, menu solto) nascia com
     * a ilha por cima — ninguém tinha rolado ainda. Foram 18 casos assim que o
     * verificador pegou depois de passar a medir em 5 posições de rolagem.
     *
     * O ResizeObserver cobre o resto: lançar um gasto, filtrar uma lista ou
     * abrir um acordeão muda a altura da página sem nenhum evento de rolagem.
     */
    const raf = requestAnimationFrame(measure)
    const content = document.querySelector('main > div')
    const ro = new ResizeObserver(() => {
      clearTimeout(idle)
      idle = setTimeout(measure, 120)
    })
    if (content !== null) ro.observe(content)

    // `capture` porque a rolagem acontece no <main>, que não borbulha scroll.
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('resize', measure, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(idle)
      ro.disconnect()
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', measure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...watch])

  return nearCorner || !blocked
}

export function ActionIsland(): ReactNode {
  const setSearchOpen = useUiStore((s) => s.setSearchOpen)
  const privacy = useUiStore((s) => s.privacy)
  const togglePrivacy = useUiStore((s) => s.togglePrivacy)
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const overlayOpen = useOverlayOpen()
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const activeView = useUiStore((s) => s.activeView)
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const clear = useIslandClear(ref, [activeView, sidebarCollapsed])
  /**
   * Dois "sumiços" diferentes, de propósito.
   *
   * Com um DIÁLOGO por cima ela some e deixa de receber cliques — não há nada
   * que ela deva fazer enquanto um modal está aberto.
   *
   * Com CONTEÚDO atrás ela some, mas continua clicável. Invisível-e-morta seria
   * trocar um problema por outro pior: a privacidade e a busca ficariam
   * inalcançáveis toda vez que a página parasse numa posição ruim. Como o canto
   * quente (200×120) a revela bem antes de o cursor chegar nela, a janela em que
   * ela está invisível e ainda assim clicável é praticamente inexistente na
   * prática — e o teclado a traz de volta pelo foco.
   */
  const hidden = overlayOpen || (!clear && !focused)

  return (
    <div
      ref={ref}
      className={cn(
        'fixed bottom-4 right-5 z-30 flex items-center gap-1 p-1',
        'rounded-[13px] border border-line shadow-card',
        'bg-[color-mix(in_srgb,var(--surface)_88%,transparent)]',
        'transition-opacity duration-200',
        /**
         * UMA classe de opacidade por vez, escolhida aqui em cascata.
         * Empilhar `opacity-[0.42]` com um `opacity-0` condicional não funciona:
         * as duas são utilitárias da MESMA propriedade e quem vence é a ordem
         * no CSS gerado, não a ordem no atributo — a arbitrária ganhava e a
         * ilha continuava visível por cima do modal. É a mesma armadilha que
         * tirou o botão "Editar" do lugar no ①.
         */
        overlayOpen
          ? 'opacity-0 pointer-events-none'
          : hidden
            ? 'opacity-0'
            : focused
              ? 'opacity-100'
              : 'opacity-[0.42] hover:opacity-100',
      )}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      /**
       * `role="group"` com nome: a ilha é um agrupamento de controles soltos no
       * canto da tela, e sem nome ela chega ao leitor de tela como três botões
       * órfãos. De quebra, dá à suíte e ao verificador do §5 uma âncora estável
       * — melhor que caçar o container por classe utilitária, que muda a cada
       * ajuste de estilo.
       */
      role="group"
      aria-label="Ações rápidas"
      /**
       * `aria-hidden` SÓ quando há diálogo por cima. Estava valendo também para
       * o sumiço por conteúdo atrás — e isso apaga a ilha inteira da árvore de
       * acessibilidade: leitor de tela e teclado perdiam busca, privacidade e
       * tema sem nenhum aviso, exatamente nas páginas compridas. Recuar por
       * causa do fundo é assunto VISUAL; a ilha continua existindo.
       */
      aria-hidden={overlayOpen || undefined}
    >
      <Tooltip label="Buscar (Ctrl+K)" side="top">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Buscar em tudo"
          className="h-8 w-8 rounded-[9px] inline-flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 active:bg-surface-3 transition-colors cursor-pointer"
        >
          <Search size={15} />
        </button>
      </Tooltip>
      <Tooltip label={privacy ? 'Mostrar valores' : 'Modo privacidade'} side="top">
        <button
          type="button"
          onClick={togglePrivacy}
          aria-label={privacy ? 'Mostrar valores' : 'Ocultar valores (modo privacidade)'}
          aria-pressed={privacy}
          className={cn(
            'h-8 w-8 rounded-[9px] inline-flex items-center justify-center transition-colors cursor-pointer',
            privacy
              ? 'text-primary bg-primary-soft'
              : 'text-ink-soft hover:text-ink hover:bg-surface-2 active:bg-surface-3',
          )}
        >
          {privacy ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </Tooltip>
      <Tooltip label={theme === 'dark' ? 'Tema claro' : 'Tema escuro'} side="top">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          className="h-8 w-8 rounded-[9px] inline-flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 active:bg-surface-3 transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </Tooltip>
    </div>
  )
}
