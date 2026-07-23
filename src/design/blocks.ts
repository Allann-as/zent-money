import { useLayoutEffect } from 'react'
import type { BackdropSection } from './Backdrop'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * BLOCOS DE COR (R10 §2) — quatro paletas, um app só.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Cada área do app tem sua cor primária, seu subtom de fundo/painel e sua cor
 * de céu. O que NÃO muda: a escala neutra (ink/soft/faint), as cores de
 * categoria, o alerta e as sombras — é essa parte idêntica que impede a
 * sensação de estar usando quatro aplicativos diferentes.
 *
 * A troca inteira é UM atributo no <html>. Nenhum componente sabe que blocos
 * existem: todos leem token, e o token muda de valor. A interpolação de 450ms
 * vem do `transition` no `:root` de tokens.css (custom properties registradas
 * com @property), então nem a transição precisa de código React.
 */

export type BlockId = 1 | 2 | 3 | 4

/** Bloco de cada seção do app (§2). O bloqueio e a 1ª execução são Bloco 1. */
export const BLOCK_OF: Record<BackdropSection, BlockId> = {
  // ① Comando — Petróleo & Aço
  today: 1,
  overview: 1,
  lock: 1,
  // ② Fluxo — Grafite & Esmeralda
  income: 2,
  expenses: 2,
  // ③ Crédito — Meia-noite & Prata
  banks: 3,
  credit: 3,
  installments: 3,
  // ④ Patrimônio — Índigo & Gelo
  investments: 4,
  boxes: 4,
  timeline: 4,
}

/** Duração da travessia entre blocos. Fonte única: CSS e céu leem daqui. */
export const BLOCK_TRANSITION_MS = 450

type Listener = (block: BlockId) => void
const listeners = new Set<Listener>()

/**
 * Avisa quem precisa reagir à troca de bloco fora do CSS — hoje o céu (que
 * passa a amostrar `--sky` durante a travessia, garantindo que canvas e CSS
 * troquem de cor pela MESMA curva) e a faixa de título (que repinta os botões
 * nativos do Windows, os únicos pixels do app que o CSS não alcança).
 */
export function onBlockChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

let applied = false

/**
 * Aplica o bloco ao <html>. A PRIMEIRA aplicação é sem transição de propósito:
 * quem reabre o app numa seção do Bloco 4 veria um fade de 450ms saindo do
 * Bloco 1 (o default do CSS) — o estado inicial tem de nascer pronto, não
 * chegar animando.
 */
export function applyBlock(block: BlockId): void {
  const el = document.documentElement
  if (el.dataset['block'] === String(block)) return
  if (!applied) {
    applied = true
    el.style.transition = 'none'
    el.dataset['block'] = String(block)
    void el.offsetWidth // força o reflow ANTES de devolver a transição
    el.style.transition = ''
  } else {
    el.dataset['block'] = String(block)
  }
  for (const fn of listeners) fn(block)
}

/** Mantém o <html> no bloco da seção ativa enquanto o componente viver. */
export function useColorBlock(section: BackdropSection): void {
  useLayoutEffect(() => {
    applyBlock(BLOCK_OF[section])
  }, [section])
}
