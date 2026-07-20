import type { ReactNode } from 'react'
import type { ViewId } from '@/store/uiStore'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * BACKDROP — sistema de fundo em 4 camadas (M3 §Fundo), full-viewport.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Uma única fonte para o fundo do app E da tela de bloqueio. É um elemento
 * `position: fixed; inset: 0` que **pinta a base ele mesmo** (não depende do
 * `background-attachment: fixed` do body) — foi essa dependência que deixava a
 * tela de PIN com um terço inferior "morto" (a faixa preta da QA do M2). Aqui a
 * base cobre 100% da altura em qualquer resolução, por construção.
 *
 * ── CUSTO ZERO DE FPS (lição da 2ª passada do loop M3) ──────────────────
 * Os glows são **radial-gradients estáticos** compostos pela GPU numa passada,
 * NÃO divs com `blur()`. A 1ª passada usava `blur-3xl` (raio 48px) em divs de
 * 900px por seção — isso derrubou o FPS a ponto de o E2E lentificar 6× e os
 * timers dos toasts atrasarem. É exatamente a razão pela qual o fundo da R3 era
 * um só pseudo-elemento com gradientes e "sem blur de área gigante" (DECISOES).
 *
 * Camadas (compostas de baixo para cima), `pointer-events: none`:
 *   ① gradiente base (--bg-grad) + fallback sólido (--bg)
 *   ② dois glows radiais POR SEÇÃO — acento a ~8% ~900px numa posição distinta
 *      por seção (mapa abaixo) + azul-profundo a ~9% no canto oposto
 *   ③ geometria assinatura por seção — SVG line-art estático, stroke 1px,
 *      ~4,8% de opacidade, 500–800px, SEMPRE cortada pela borda
 *   ④ malha pontilhada + vinheta discretas
 *
 * ── MAPA DE GLOWS (centro do acento → canto oposto do azul) ─────────────
 *   overview     topo-centro    → base-direita
 *   income       topo-direita   → base-esquerda
 *   expenses     topo-esquerda  → base-direita
 *   banks        centro-direita → topo-esquerda
 *   installments base-direita   → topo-esquerda
 *   investments  base-esquerda  → topo-direita
 *   boxes        topo-direita   → base-esquerda
 *   timeline     centro-esquerda→ base-direita
 *   lock         topo-centro    → base-centro (fecha a composição embaixo)
 */

export type BackdropSection = ViewId | 'lock'

/** Centro (posição CSS) de cada glow por seção — fora da borda = cortado. */
const GLOWS: Record<BackdropSection, { accent: string; deep: string }> = {
  today: { accent: '50% -14%', deep: '112% 118%' },
  overview: { accent: '50% -12%', deep: '114% 116%' },
  income: { accent: '112% -10%', deep: '-12% 116%' },
  expenses: { accent: '-12% -10%', deep: '114% 116%' },
  banks: { accent: '116% 46%', deep: '-12% -12%' },
  credit: { accent: '112% 40%', deep: '-12% 110%' },
  installments: { accent: '115% 116%', deep: '-12% -12%' },
  investments: { accent: '-14% 116%', deep: '112% -10%' },
  boxes: { accent: '112% -6%', deep: '-12% 116%' },
  timeline: { accent: '-14% 50%', deep: '114% 116%' },
  lock: { accent: '50% -6%', deep: '50% 120%' },
}

/** Camadas de fundo (base + glows + malha + vinheta) como UM background-image. */
function layersFor(section: BackdropSection): React.CSSProperties {
  const g = GLOWS[section]
  return {
    background: 'var(--bg)',
    backgroundImage: [
      // ② glow de acento (~8%) e azul-profundo (~9%), cortados pela borda
      `radial-gradient(900px 900px at ${g.accent}, color-mix(in srgb, var(--primary) 8%, transparent) 0%, transparent 58%)`,
      `radial-gradient(640px 640px at ${g.deep}, color-mix(in srgb, var(--chart-4) 9%, transparent) 0%, transparent 60%)`,
      // ④ malha pontilhada + vinheta
      `radial-gradient(circle at 1px 1px, var(--bg-mesh) 1px, transparent 0)`,
      `radial-gradient(120% 100% at 50% 50%, transparent 58%, var(--bg-vignette) 100%)`,
      // ① base
      `var(--bg-grad)`,
    ].join(', '),
    backgroundSize: '100% 100%, 100% 100%, 24px 24px, 100% 100%, 100% 100%',
    backgroundRepeat: 'no-repeat, no-repeat, repeat, no-repeat, no-repeat',
  }
}

/**
 * ⓪ Grid de instrumento (v2.1) — a textura que dá o nome à direção "Painel de
 * Bordo". Linhas a ~4% (token `--bg-grid`, calibrado por tema) com máscara
 * radial ancorada no topo: presente onde o olho entra, dissolvido antes de
 * chegar ao conteúdo denso da base. Não depende da seção — é a moldura fixa do
 * app, ao contrário dos glows e da geometria, que mudam de lugar a cada tela.
 */
const gridLayer: React.CSSProperties = {
  backgroundImage: [
    `linear-gradient(var(--bg-grid) 1px, transparent 1px)`,
    `linear-gradient(90deg, var(--bg-grid) 1px, transparent 1px)`,
  ].join(', '),
  backgroundSize: '46px 46px, 46px 46px',
  maskImage: 'radial-gradient(circle at 50% 15%, #000 25%, transparent 80%)',
  WebkitMaskImage: 'radial-gradient(circle at 50% 15%, #000 25%, transparent 80%)',
}

/**
 * Geometria assinatura por seção — line-art estático, `stroke="var(--primary)"`
 * (segue o tema), sempre posicionado para ser CORTADO pela borda da viewport.
 */
function Geometry({ section }: { section: BackdropSection }): ReactNode {
  switch (section) {
    // Hoje — anel do dia ecoado no fundo: dois círculos concêntricos no topo,
    // como a assinatura do loop diário, cortados pela borda.
    case 'today':
      return (
        <svg className="absolute -top-52 left-1/2 -translate-x-1/2" width="760" height="760" viewBox="0 0 760 760" fill="none" stroke="var(--primary)" strokeWidth="1">
          <circle cx="380" cy="380" r="250" strokeDasharray="200 60" />
          <circle cx="380" cy="380" r="330" />
        </svg>
      )
    // Visão geral / lock — 3 arcos concêntricos, descentralizados e cortados
    case 'overview':
    case 'lock':
      return (
        <svg className="absolute -top-40 left-1/2 -translate-x-[42%]" width="820" height="820" viewBox="0 0 820 820" fill="none" stroke="var(--primary)" strokeWidth="1">
          <circle cx="410" cy="410" r="220" />
          <circle cx="410" cy="410" r="310" />
          <circle cx="410" cy="410" r="400" />
        </svg>
      )
    // Ganhos — feixe de linhas ascendentes
    case 'income':
      return (
        <svg className="absolute -bottom-24 -left-16" width="760" height="620" viewBox="0 0 760 620" fill="none" stroke="var(--primary)" strokeWidth="1">
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={i} x1={0} y1={620 - i * 18} x2={760} y2={430 - i * 46} />
          ))}
        </svg>
      )
    // Gastos — trilha de recibos (retângulos com serrilha na base)
    case 'expenses':
      return (
        <svg className="absolute -bottom-28 -right-16" width="720" height="640" viewBox="0 0 720 640" fill="none" stroke="var(--primary)" strokeWidth="1">
          {Array.from({ length: 4 }).map((_, i) => {
            const x = 40 + i * 168
            const y = 60 + (i % 2) * 70
            const w = 132
            const h = 380
            const teeth = Array.from({ length: 9 })
              .map((_, t) => `${x + (t * w) / 8},${y + h} ${x + (t * w) / 8 + w / 16},${y + h + 16}`)
              .join(' ')
            return (
              <g key={i}>
                <path d={`M${x} ${y + h} V${y} H${x + w} V${y + h}`} />
                <polyline points={`${teeth} ${x + w},${y + h}`} />
                <line x1={x + 20} y1={y + 70} x2={x + w - 20} y2={y + 70} />
                <line x1={x + 20} y1={y + 130} x2={x + w - 20} y2={y + 130} />
                <line x1={x + 20} y1={y + 190} x2={x + w - 40} y2={y + 190} />
              </g>
            )
          })}
        </svg>
      )
    // Bancos & Cartões — grade de retângulos arredondados sobrepostos
    // Bancos & Crédito — grade de cartões arredondados sobrepostos
    case 'banks':
    case 'credit':
      return (
        <svg className="absolute -top-20 -right-20" width="700" height="640" viewBox="0 0 700 640" fill="none" stroke="var(--primary)" strokeWidth="1">
          {Array.from({ length: 5 }).map((_, i) => (
            <rect key={i} x={60 + i * 84} y={40 + i * 74} width="360" height="220" rx="26" />
          ))}
        </svg>
      )
    // Parcelas — anel fragmentado (arcos com lacunas)
    case 'installments':
      return (
        <svg className="absolute -bottom-40 -right-24" width="720" height="720" viewBox="0 0 720 720" fill="none" stroke="var(--primary)" strokeWidth="1">
          <circle cx="360" cy="360" r="300" strokeDasharray="120 46" />
          <circle cx="360" cy="360" r="240" strokeDasharray="70 60" />
          <circle cx="360" cy="360" r="180" strokeDasharray="150 40" />
        </svg>
      )
    // Carteira — curvas de gráfico entrelaçadas
    case 'investments':
      return (
        <svg className="absolute -bottom-24 -left-20" width="780" height="600" viewBox="0 0 780 600" fill="none" stroke="var(--primary)" strokeWidth="1">
          <path d="M0 480 C 160 300, 260 520, 420 340 S 660 200, 780 300" />
          <path d="M0 560 C 180 420, 300 560, 460 420 S 680 320, 780 400" />
          <path d="M0 400 C 140 260, 300 420, 440 260 S 640 120, 780 220" />
        </svg>
      )
    // Caixinhas — círculos orbitais
    case 'boxes':
      return (
        <svg className="absolute -top-28 -right-16" width="720" height="720" viewBox="0 0 720 720" fill="none" stroke="var(--primary)" strokeWidth="1">
          <ellipse cx="360" cy="360" rx="320" ry="150" />
          <ellipse cx="360" cy="360" rx="320" ry="150" transform="rotate(60 360 360)" />
          <ellipse cx="360" cy="360" rx="320" ry="150" transform="rotate(120 360 360)" />
          <circle cx="360" cy="360" r="46" />
        </svg>
      )
    // Linha do tempo — régua de traços com espaçamento crescente
    case 'timeline':
      return (
        <svg className="absolute top-1/2 -translate-y-1/2 -left-16" width="760" height="520" viewBox="0 0 760 520" fill="none" stroke="var(--primary)" strokeWidth="1">
          <line x1="0" y1="260" x2="760" y2="260" />
          {(() => {
            const ticks: ReactNode[] = []
            let x = 20
            let gap = 14
            let i = 0
            while (x < 760) {
              const long = i % 4 === 0
              ticks.push(<line key={i} x1={x} y1={260 - (long ? 40 : 20)} x2={x} y2={260 + (long ? 40 : 20)} />)
              x += gap
              gap += 4
              i += 1
            }
            return ticks
          })()}
        </svg>
      )
  }
}

/**
 * Fundo full-viewport de uma seção. Renderizado como PRIMEIRO filho do container
 * relativo (AppShell / LockScreen) com `z-0`; o conteúdo fica em `z-10`.
 */
export function Backdrop({ section }: { section: BackdropSection }): ReactNode {
  return (
    <div aria-hidden="true" className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
      {/* ①②④ base + glows + malha + vinheta — UM único layer composto */}
      <div className="absolute inset-0" style={layersFor(section)} />
      {/* ⓪ GRID DE INSTRUMENTO (v2.1) — duas linhas retas de 46px com máscara
          radial no topo. É `linear-gradient` estático + `mask-image`: composto
          pela GPU numa passada, mesma disciplina dos glows (nada de blur). */}
      <div className="absolute inset-0" style={gridLayer} />
      {/* ③ geometria assinatura — ~4,8% (abaixo do teto de 5% do §), cortada pela borda */}
      <div className="absolute inset-0 opacity-[0.048]">
        <Geometry section={section} />
      </div>
    </div>
  )
}
