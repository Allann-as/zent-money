/**
 * ═══════════════════════════════════════════════════════════════════════
 * ROBUSTEZ DE MAGNITUDE — geometria e cascata de adaptação
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Regra permanente: **nenhum número pode transbordar seu container em nenhuma
 * magnitude.** O app tem de aguentar um patrimônio de R$ 100.000.000,00 sem
 * quebrar em lugar nenhum.
 *
 * ── A LARGURA ÚTIL DENTRO DE UM ANEL NÃO É O DIÂMETRO ───────────────────
 * Para um bloco de texto de altura `h` centrado num círculo de raio interno
 * `r`, a largura máxima é a CORDA na borda do bloco:
 *
 *     largura = 2·√(r² − (h/2)²)
 *
 * Usar uma fração chutada do diâmetro (um `px-6` qualquer) é o que produz o
 * bug clássico: o texto "cabe na largura" no meio do círculo e mesmo assim
 * encosta no anel nas quebras de cima e de baixo, onde o círculo é mais
 * estreito.
 *
 * ── `h` É O PIOR CASO, NÃO O ESTADO ATUAL (refinamento do Allan) ────────
 * O vazamento original do Donut veio exatamente daqui: dimensionado pelo
 * repouso (2 linhas, limite 142,7px) e usado no hover (3 linhas, limite
 * ~136px). Dimensionar pelo estado atual é dimensionar para o estado errado.
 *
 * Por isso a disciplina de quem usa `RingCenter` é RESERVAR sempre o conteúdo
 * mais alto que o componente pode assumir — as linhas do hover existem no DOM
 * desde o repouso, invisíveis. Assim a altura medida JÁ É o pior caso, a
 * fórmula fica correta por construção, e o layout não muda de tamanho entre
 * estados (nenhum reflow ao passar o mouse).
 *
 * ── FOLGA PROPORCIONAL, NÃO MARGEM SIMBÓLICA (refinamento do Allan) ──────
 * A margem fixa de 4px "continha" o texto mas o deixava RENTE ao anel — cabia
 * pela matemática e encostava aos olhos. Junto de uma curva o olho precisa de
 * mais espaço do que a geometria exige, e num anel grande esse respiro tem de
 * crescer com ele. Por isso a folga passou a ser `max(10px, 8% do raio)` e é
 * aplicada REDUZINDO O RAIO antes da corda — ver `ringSafeWidth`.
 */

/**
 * Área de respiro entre o texto e o anel (px): proporcional ao raio, com piso.
 * Geometricamente correto ≠ opticamente confortável.
 */
export function ringBreathing(radius: number): number {
  return Math.max(10, 0.08 * radius)
}

/** Piso de legibilidade da cascata: nunca reduzir a fonte abaixo disto (px). */
export const MIN_FONT_PX = 13

/** Espessura mínima de anel: abaixo disto ele deixa de ler como anel (px). */
export const MIN_RING_THICKNESS = 14

/**
 * Largura útil para um bloco de altura `h` centrado num círculo de raio `r`,
 * com uma área de respiro `folga` até o anel. Devolve 0 quando não sobra espaço.
 *
 * ── POR QUE A FOLGA REDUZ O RAIO, E NÃO A LARGURA ───────────────────────
 * A versão antiga subtraía `2·margem` da corda medida no raio CHEIO. Isso dava
 * folga só na horizontal, na altura do bloco; o CANTO do bloco (lá em cima,
 * onde o círculo é mais estreito) ficava mais perto do anel do que a margem
 * pedida. Reduzindo o raio para `r − folga` ANTES da corda, todo canto do bloco
 * passa a morar na circunferência de raio `r − folga` — ou seja, a **distância
 * radial** de qualquer canto até a borda interna do anel é ≥ `folga`, por
 * construção. É essa a garantia que o teste de estresse afere (distância, não
 * pertencimento).
 */
export function ringSafeWidth(
  radius: number,
  blockHeight: number,
  breathing = ringBreathing(radius),
): number {
  const effR = radius - breathing
  const half = blockHeight / 2
  if (half >= effR) return 0
  return 2 * Math.sqrt(effR * effR - half * half)
}

/**
 * Raio interno (px) de um anel desenhado em viewBox 0–100.
 *
 * `ProgressRing` e o anel de Hoje usam `r = 50 − thickness/2` com
 * `strokeWidth = thickness`, então a borda interna do traço fica em
 * `50 − thickness`. O `Donut` usa `r = 50 − thickness/4` com
 * `strokeWidth = thickness/2`, e sua borda interna fica em `50 − thickness/2`.
 */
export function innerRadiusPx(size: number, thicknessViewBox: number): number {
  return ((50 - thicknessViewBox) / 100) * size
}

// ── Medição de texto sem reflow ─────────────────────────────────────────

let ctx: CanvasRenderingContext2D | null = null
let monoFamily = 'monospace'

/**
 * Mede texto num canvas fora de tela em vez de escrever no DOM e ler de volta.
 *
 * A cascata precisa testar várias hipóteses (fonte menor, prefixo menor,
 * compacto) antes de decidir. Fazer isso escrevendo no DOM significaria um
 * ciclo de layout por hipótese e um piscar visível a cada re-render. No canvas
 * é uma conta, e o resultado sai antes do primeiro paint.
 */
export function measureText(text: string, fontPx: number, weight = 700): number {
  if (ctx === null) {
    const canvas = document.createElement('canvas')
    ctx = canvas.getContext('2d')
    // A família real vem do token, para a medida bater com o que é pintado.
    const declared = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim()
    if (declared !== '') monoFamily = declared
  }
  if (ctx === null) return text.length * fontPx * 0.6 // fallback grosseiro
  ctx.font = `${weight} ${fontPx}px ${monoFamily}`
  return ctx.measureText(text).width
}

// ── Cascata de adaptação ────────────────────────────────────────────────

export interface FitInput {
  /** Texto completo e exato (ex.: "R$ 100.000.000,00"). */
  text: string
  /** Versão compacta (ex.: "R$ 100 mi"), ou null se compactar for proibido. */
  compact: string | null
  /** Largura disponível, em px. */
  available: number
  /** Tamanho de fonte desejado, em px. */
  fontPx: number
  weight?: number
}

export interface FitResult {
  /** Texto a renderizar (exato ou compacto). */
  text: string
  /** Tamanho de fonte final, em px. */
  fontPx: number
  /** true quando o valor exibido é o COMPACTO — exige valor exato no title/aria. */
  compacted: boolean
  /** true quando nem o compacto no piso coube: quem chama precisa abrir espaço. */
  overflow: boolean
}

/**
 * Cascata de adaptação (ordem exata da spec):
 *   a) reduzir/ocultar o rótulo secundário — feito por quem chama, ANTES daqui;
 *   b) `R$` vira prefixo menor — feito na renderização (ver <FitValue>);
 *   c) auto-ajuste da fonte até o piso de 13px;
 *   d) engrossar menos o anel — feito por quem desenha o anel, se puder;
 *   e) só então notação compacta.
 *
 * A ordem importa: compactar é a única etapa que PERDE informação, então é a
 * última. Reduzir a fonte não mente sobre o número; "R$ 10,4 mi" mente sobre os
 * centavos — por isso, quando ela acontece, o valor exato tem de continuar
 * disponível no `title` e no `aria-label`.
 */
export function fitValue({ text, compact, available, fontPx, weight = 700 }: FitInput): FitResult {
  if (available <= 0) return { text, fontPx, compacted: false, overflow: true }

  // (c) encolhe a fonte, de 0,5 em 0,5px, até caber ou bater no piso
  for (let size = fontPx; size >= MIN_FONT_PX; size -= 0.5) {
    if (measureText(text, size, weight) <= available) {
      return { text, fontPx: size, compacted: false, overflow: false }
    }
  }

  // (e) no piso e ainda não coube: compactar, se for permitido aqui
  if (compact !== null) {
    for (let size = fontPx; size >= MIN_FONT_PX; size -= 0.5) {
      if (measureText(compact, size, weight) <= available) {
        return { text: compact, fontPx: size, compacted: true, overflow: false }
      }
    }
    // Nem o compacto no piso coube — devolve compacto e avisa o transbordo,
    // em vez de devolver o exato (que seria ainda mais largo).
    return { text: compact, fontPx: MIN_FONT_PX, compacted: true, overflow: true }
  }

  return { text, fontPx: MIN_FONT_PX, compacted: false, overflow: true }
}

/**
 * Espessura de anel que a cascata pede (etapa d), em unidades de viewBox.
 *
 * Só há o que fazer quando o anel é mais grosso que o mínimo: um anel que já
 * nasce com 9px não pode "afinar para abrir o miolo" sem deixar de ser anel.
 * Devolve a espessura original quando não há folga.
 */
export function thinnedThickness(thickness: number, size: number): number {
  const px = (thickness / 100) * size
  if (px <= MIN_RING_THICKNESS) return thickness
  return (MIN_RING_THICKNESS / size) * 100
}
