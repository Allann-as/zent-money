import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TOOLTIP COM DETECÇÃO DE COLISÃO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Portal (não é clipado por overflow) + posicionamento que RESPEITA a janela.
 *
 * ── POR QUE A CORREÇÃO É NO COMPONENTE, NÃO NO CHAMADOR ─────────────────
 * A versão antiga calculava a posição a partir do lado pedido e pronto: o
 * tooltip do "Recolher (Ctrl+B)", que fica colado no topo da sidebar, era
 * desenhado ACIMA da âncora e saía da janela, cobrindo a marca. Consertar
 * aquele caso trocando o `side` só empurraria o mesmo defeito para o próximo
 * tooltip perto de uma borda. Então quem resolve é o componente: mede a si
 * mesmo, VIRA para o lado oposto quando não há espaço, e por fim GRAMPEIA nas
 * bordas — nenhum tooltip ultrapassa a janela, em nenhum canto.
 *
 * A medida acontece em `useLayoutEffect` (antes da pintura), então o tooltip
 * nunca aparece na posição errada e "pula" para a certa.
 */

/** Distância entre a âncora e o tooltip. */
const OFFSET = 8
/** Folga mínima até a borda da janela. */
const EDGE = 6

type Side = 'right' | 'top' | 'bottom'

export function Tooltip({
  label,
  side = 'right',
  disabled = false,
  children,
}: {
  /** Texto simples (sidebar) ou conteúdo rico (ex.: discriminação de Compromissos). */
  label: ReactNode
  /** Lado PREFERIDO. Se não couber, o componente vira para o oposto sozinho. */
  side?: Side
  disabled?: boolean
  children: ReactNode
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  /** Retângulo da âncora no momento do hover; null = escondido. */
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  /** Canto superior esquerdo final, já virado e grampeado. */
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  /**
   * O retângulo da ÂNCORA — medido no primeiro filho, não no invólucro.
   *
   * ── A CAUSA-RAIZ DO TOOLTIP NO CANTO ────────────────────────────────
   * O invólucro usa `display: contents` (para não injetar uma caixa no layout
   * de quem chama). Um elemento `contents` NÃO GERA CAIXA, então o seu
   * `getBoundingClientRect()` devolve tudo zero — e todo tooltip era
   * posicionado a partir de (0,0), indo parar no canto superior esquerdo, sobre
   * a marca. Era isso o "tooltip mal posicionado", não o lado escolhido.
   *
   * O filho (o botão) tem caixa de verdade: é dele que sai a medida. Assim o
   * invólucro segue invisível para o layout e a âncora volta a ser a real.
   */
  function anchorRect(): DOMRect | null {
    const host = ref.current
    if (host === null) return null
    const child = host.firstElementChild
    return (child ?? host).getBoundingClientRect()
  }

  function show(): void {
    if (disabled) return
    const r = anchorRect()
    if (r === null) return
    setAnchor(r)
    setPos(null) // recalcula no layout effect, com o tamanho real do tooltip
  }

  function hide(): void {
    setAnchor(null)
    setPos(null)
  }

  useLayoutEffect(() => {
    if (anchor === null) return
    const tip = tipRef.current
    if (tip === null) return
    const { width: tw, height: th } = tip.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let x: number
    let y: number

    if (side === 'right') {
      // vira para a esquerda quando não cabe à direita
      x = anchor.right + OFFSET
      if (x + tw > vw - EDGE) x = anchor.left - OFFSET - tw
      y = anchor.top + anchor.height / 2 - th / 2
    } else {
      x = anchor.left + anchor.width / 2 - tw / 2
      if (side === 'top') {
        // vira para baixo quando não há espaço acima (o caso do "Recolher")
        y = anchor.top - OFFSET - th
        if (y < EDGE) y = anchor.bottom + OFFSET
      } else {
        y = anchor.bottom + OFFSET
        if (y + th > vh - EDGE) y = anchor.top - OFFSET - th
      }
    }

    // Grampo final: mesmo depois de virar, nada ultrapassa a janela.
    x = Math.max(EDGE, Math.min(x, vw - tw - EDGE))
    y = Math.max(EDGE, Math.min(y, vh - th - EDGE))
    setPos({ x, y })
  }, [anchor, side])

  return (
    <div
      ref={ref}
      className="contents"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {anchor && !disabled
        ? createPortal(
            <div
              ref={tipRef}
              role="tooltip"
              data-tooltip
              className="fixed z-[80] px-2.5 py-1.5 text-[12px] font-medium text-ink bg-surface-3 border border-line-strong rounded-[8px] shadow-pop whitespace-nowrap pointer-events-none anim-fade-in"
              /**
               * Enquanto `pos` é null o tooltip já está montado (para poder ser
               * medido) mas invisível — assim ele nunca é pintado no lugar
               * errado. `left/top` são o canto superior esquerdo: sem
               * `transform`, o grampo nas bordas é aritmética direta.
               */
              style={{
                left: pos?.x ?? 0,
                top: pos?.y ?? 0,
                visibility: pos === null ? 'hidden' : 'visible',
              }}
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
