import { useEffect, useRef, type ReactNode } from 'react'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CÉU DE GALÁXIA (R10 §1) — um canvas, o app inteiro.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * UM `<canvas>` 2D fixo cobrindo a viewport, atrás de todo o conteúdo: tela de
 * bloqueio, primeira execução, as 10 seções, modais e a mini-janela da bandeja.
 * Não existe um canvas por seção — é um céu só, contínuo, sem emenda. Trocar de
 * seção não recria nada: só muda a cor.
 *
 * Quatro camadas, do fundo para a frente:
 *   ① névoa que respira   ② constelação (linhas entre estrelas próximas)
 *   ③ estrelas piscando   ④ meteoro raro
 *
 * Duas ideias sustentam tudo: coordenadas normalizadas [0,1] (redimensionar
 * sai de graça) e UMA string de cor "R,G,B" que tinge as quatro camadas.
 *
 * ── AS CONSTANTES NUMÉRICAS SÃO A ESTÉTICA APROVADA ─────────────────────
 * Densidade (área/6500 + 40), os 4 raios até 1.9, o alfa entre .12 e .52, o
 * limiar de 84px da constelação com alfa (1-d/84)*.14*pulso, o `+i+j` que
 * dessincroniza cada par, a névoa respirando a sin(t*.33) entre ~.02 e ~.08 e o
 * meteoro a cada ~5–9s: nada disso é chute a ajustar. Não "melhore" um número
 * aqui sem pedido — cada um deles tem um porquê registrado no R10 §1.
 *
 * ── O QUE O PROTÓTIPO NÃO COBRIA (regras de produção) ───────────────────
 * 1. `prefers-reduced-motion`: UM frame estático, sem meteoro, sem rAF.
 * 2. Canvas único e fixo; a cor troca junto com os tokens (ver COR, abaixo).
 * 3. Pausa sem foco (`cancelAnimationFrame`) e retoma no foco — é o que
 *    impede o app minimizado de queimar bateria desenhando para ninguém.
 * 4. Cleanup no unmount: listeners e rAF, senão vazam loops.
 * 5. HiDPI: escala por devicePixelRatio; a matemática segue em px de CSS,
 *    então o limiar de 84px continua valendo o mesmo tanto de tela.
 * 6. 100% offline — é só matemática local.
 * 7. Legibilidade acima de tudo: se o texto sofrer, os CARDS ganham véu; o
 *    céu nunca sobe de intensidade.
 *
 * ── COR: por que o canvas LÊ o token em vez de interpolar sozinho ────────
 * A cor sai de `--sky`, que é uma custom property registrada e animada em
 * 450ms junto com o resto da paleta (tokens.css). Se o canvas interpolasse por
 * conta própria — mesmo com a mesma duração — bastaria a curva ser outra, ou o
 * início desencontrar por um frame, para o olho ver DUAS trocas de cor. Lendo o
 * valor já interpolado pelo próprio motor de CSS, canvas e interface trocam de
 * cor pela mesma curva, no mesmo instante, por construção.
 *
 * A leitura só acontece na JANELA da travessia (~500ms após o <html> mudar de
 * atributo), não a cada frame para sempre: `getComputedStyle` força recálculo de
 * estilo, e pagar isso 60×/s enquanto nada muda seria desperdício puro.
 */

/** Cor de partida caso o token ainda não exista (1º frame antes do CSS). */
const FALLBACK_RGB = '134,182,201'

/**
 * Telemetria do céu, lida por `scripts/perf-sky.mjs`.
 *
 * O §16 exige FPS do céu MEDIDO nas 10 seções e com 50k lançamentos — não
 * estimado. Sem um número que o app publique sobre si mesmo, a única medida
 * possível seria indireta (contar frames de fora e torcer para o custo ser o
 * do céu). São duas linhas no laço e transformam "acho que está barato" em
 * "custa X ms por frame nesta resolução, com N estrelas e P pares testados".
 */
declare global {
  interface Window {
    __zentSky?: {
      ms: number
      stars: number
      pairs: number
      /** Frames desenhados desde o mount. Sob reduced-motion, fica em 0. */
      frames: number
      /** Cor "R,G,B" com que o céu está pintando NESTE instante. */
      color: string
      /** false enquanto pausado por falta de foco. */
      running: boolean
    }
  }
}

/** Extrai "R,G,B" do valor computado de `--sky` (rgb(), rgba() ou hex). */
function parseRgb(value: string): string {
  const fn = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value)
  if (fn !== null) {
    return [fn[1], fn[2], fn[3]].map((c) => Math.round(Number(c))).join(',')
  }
  const hex = /^#?([0-9a-f]{6})$/i.exec(value.trim())
  if (hex !== null) {
    const n = parseInt(hex[1] ?? '', 16)
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
  }
  return FALLBACK_RGB
}

interface Star {
  x: number
  y: number
  r: number
  o: number
  p: number
  sp: number
  z: number
}

export function GalaxyField(): ReactNode {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const cv = ref.current
    if (cv === null) return
    const ctx = cv.getContext('2d')
    if (ctx === null) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Publicada já aqui (e não junto do laço) para que o verificador consiga
    // ler `frames === 0` sob reduced-motion — onde laço nenhum chega a existir.
    const telemetry = { ms: 0, stars: 0, pairs: 0, frames: 0, color: '', running: false }
    window.__zentSky = telemetry

    // ── Dimensões e HiDPI ────────────────────────────────────────────────
    // W/H ficam em px de CSS; o buffer é maior por dpr e o contexto é escalado.
    let W = window.innerWidth
    let H = window.innerHeight
    function fit(): void {
      const dpr = window.devicePixelRatio || 1
      W = window.innerWidth
      H = window.innerHeight
      cv!.width = Math.round(W * dpr)
      cv!.height = Math.round(H * dpr)
      cv!.style.width = `${W}px`
      cv!.style.height = `${H}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    fit()

    // ── Semeadura (constantes do §1) ─────────────────────────────────────
    const N = Math.round((W * H) / 6500) + 40
    const S: Star[] = []
    for (let i = 0; i < N; i++) {
      S.push({
        x: Math.random(),
        y: Math.random(),
        r: [0.6, 1, 1.5, 1.9][Math.floor(Math.random() * 4)]!,
        o: 0.12 + Math.random() * 0.4,
        p: Math.random() * 7,
        sp: 0.4 + Math.random() * 1.1,
        z: Math.random(),
      })
    }

    // ── Cor: lida do token, amostrada só durante a travessia ─────────────
    let color = FALLBACK_RGB
    function sampleColor(): void {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--sky')
      if (v.trim() !== '') color = parseRgb(v)
      telemetry.color = color
    }
    sampleColor()
    // Janela de amostragem: enquanto > 0, relê a cor a cada frame.
    let settleUntil = 0
    const observer = new MutationObserver(() => {
      // 500ms cobre os 450ms da transição com folga de um par de frames.
      settleUntil = performance.now() + 500
      if (reduced) {
        // Sem movimento não há loop para reamostrar: repinta o frame estático.
        sampleColor()
        draw(0)
      }
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-block', 'data-theme'],
    })

    /**
     * ── GRADE ESPACIAL PARA A CONSTELAÇÃO ────────────────────────────────
     * A constelação é o único trecho O(N²) do céu: a 1920×1080 são N≈359
     * estrelas, ou ~64 mil pares testados POR FRAME (a 1366×768 são ~20 mil —
     * a área triplica e o custo com ela). Como o limiar é 84px, qualquer par
     * mais distante que isso é trabalho jogado fora.
     *
     * A grade tem células de exatamente 84px: cada estrela só pode ter vizinho
     * dentro do limiar na própria célula ou nas 8 ao redor. O resultado
     * desenhado é IDÊNTICO ao laço ingênuo — mesmos pares, mesmos índices i/j
     * (o `+i+j` do seno depende deles), mesma ordem de pintura, porque a
     * varredura continua sendo por i crescente com j > i. Só somem as
     * comparações que nunca passariam no `if`.
     */
    const CELL = 84
    let cols = 1
    let rows = 1
    let buckets: number[][] = []
    function rebuildGrid(): void {
      cols = Math.max(1, Math.ceil(W / CELL))
      rows = Math.max(1, Math.ceil(H / CELL))
      if (buckets.length !== cols * rows) {
        buckets = new Array(cols * rows)
        for (let i = 0; i < buckets.length; i++) buckets[i] = []
      } else {
        for (let i = 0; i < buckets.length; i++) buckets[i]!.length = 0
      }
      for (let i = 0; i < S.length; i++) {
        const s = S[i]!
        const cx = Math.min(cols - 1, Math.max(0, Math.floor((s.x * W) / CELL)))
        const cy = Math.min(rows - 1, Math.max(0, Math.floor((s.y * H) / CELL)))
        buckets[cy * cols + cx]!.push(i)
      }
    }

    /** Pares efetivamente testados no último frame (telemetria). */
    let pairsTested = 0

    function drawConstellation(t: number): void {
      rebuildGrid()
      pairsTested = 0
      // Mesma economia das estrelas: a cor sólida entra uma vez e o alfa de
      // cada linha vai em `globalAlpha`, sem montar string por par.
      ctx!.strokeStyle = `rgb(${color})`
      ctx!.lineWidth = 0.6
      for (let i = 0; i < S.length; i++) {
        const a = S[i]!
        const cx = Math.min(cols - 1, Math.max(0, Math.floor((a.x * W) / CELL)))
        const cy = Math.min(rows - 1, Math.max(0, Math.floor((a.y * H) / CELL)))
        for (let gy = Math.max(0, cy - 1); gy <= Math.min(rows - 1, cy + 1); gy++) {
          for (let gx = Math.max(0, cx - 1); gx <= Math.min(cols - 1, cx + 1); gx++) {
            const bucket = buckets[gy * cols + gx]!
            for (let k = 0; k < bucket.length; k++) {
              const j = bucket[k]!
              if (j <= i) continue // cada par uma vez só, com i < j
              pairsTested++
              const b = S[j]!
              const dx = (a.x - b.x) * W
              const dy = (a.y - b.y) * H
              const d = Math.hypot(dx, dy)
              if (d < 84) {
                const pl = (Math.sin(t * 0.45 + i + j) + 1) / 2
                const o = (1 - d / 84) * 0.14 * pl
                if (o > 0.004) {
                  ctx!.globalAlpha = o
                  ctx!.beginPath()
                  ctx!.moveTo(a.x * W, a.y * H)
                  ctx!.lineTo(b.x * W, b.y * H)
                  ctx!.stroke()
                }
              }
            }
          }
        }
      }
      ctx!.globalAlpha = 1
    }

    // ── Meteoro ──────────────────────────────────────────────────────────
    let shooting: { x: number; y: number } | null = null
    let next = 90

    /**
     * ── NÉVOA PRÉ-RENDERIZADA (a otimização que salvou o orçamento) ──────
     * A névoa é um gradiente radial do tamanho da tela. Rasterizar 2 milhões de
     * pixels de degradê a cada frame era o item mais caro do céu inteiro — mais
     * que todos os pares da constelação somados. Mas ela só muda em ALFA: a
     * forma, o centro e o raio são constantes.
     *
     * Então ela é desenhada UMA vez num canvas fora de tela com o alfa de topo
     * `0.08` (o pico do respiro) e, a cada frame, entra como um blit com
     * `globalAlpha` proporcional. O resultado é matematicamente idêntico: num
     * degradê que vai de rgba(cor, a) até rgba(cor, 0), o alfa em cada ponto é
     * a·(1−p); multiplicar tudo por k dá a·k·(1−p), que é exatamente o degradê
     * de rgba(cor, a·k) até rgba(cor, 0). Nenhuma constante do §1 mudou —
     * mudou só quando a conta é feita.
     *
     * Refeita apenas quando a cor muda (troca de bloco/tema) ou no resize.
     */
    const NEBULA_PEAK = 0.08
    let nebula: HTMLCanvasElement | null = null
    let nebulaColor = ''
    function buildNebula(): void {
      const dpr = window.devicePixelRatio || 1
      const off = document.createElement('canvas')
      off.width = Math.max(1, Math.round(W * dpr))
      off.height = Math.max(1, Math.round(H * dpr))
      const octx = off.getContext('2d')
      if (octx === null) return
      octx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const g = octx.createRadialGradient(W * 0.82, H * 0.2, 10, W * 0.82, H * 0.2, Math.max(W, H) * 0.6)
      g.addColorStop(0, `rgba(${color},${NEBULA_PEAK})`)
      g.addColorStop(1, `rgba(${color},0)`)
      octx.fillStyle = g
      octx.fillRect(0, 0, W, H)
      nebula = off
      nebulaColor = color
    }

    /** Desenha um frame no tempo `t`. `animate=false` congela o meteoro. */
    function draw(t: number, animate = true): void {
      ctx!.clearRect(0, 0, W, H)

      // ① NÉVOA — respira a sin(t*.33), alfa entre ~.02 e ~.08
      if (nebula === null || nebulaColor !== color) buildNebula()
      if (nebula !== null) {
        const pl = 0.5 + 0.5 * Math.sin(t * 0.33)
        ctx!.globalAlpha = (0.06 * pl + 0.02) / NEBULA_PEAK
        ctx!.drawImage(nebula, 0, 0, W, H)
        ctx!.globalAlpha = 1
      }

      // ② CONSTELAÇÃO
      drawConstellation(t)

      /**
       * ③ ESTRELAS (twinkle + drift com parallax)
       *
       * O alfa vai em `globalAlpha` em vez de virar uma string `rgba(...)` por
       * estrela: são ~359 strings montadas e reparseadas como cor a cada frame,
       * 21 mil por segundo, para um resultado de composição idêntico. A cor
       * sólida é definida uma única vez, fora do laço.
       */
      ctx!.fillStyle = `rgb(${color})`
      for (const s of S) {
        if (animate) {
          s.x -= 0.00006 * (0.4 + s.z)
          if (s.x < 0) s.x = 1
        }
        ctx!.globalAlpha = s.o * (0.58 + 0.42 * Math.sin(t * s.sp + s.p))
        ctx!.beginPath()
        ctx!.arc(s.x * W, s.y * H, s.r, 0, 7)
        ctx!.fill()
      }
      ctx!.globalAlpha = 1

      // ④ METEORO — não existe no frame estático (regra 1)
      if (!animate) return
      if (shooting === null && --next < 0) {
        shooting = { x: W * 0.15 + Math.random() * W * 0.55, y: -14 }
      }
      if (shooting !== null) {
        const len = Math.min(90, W * 0.14)
        shooting.x += 6.5
        shooting.y += 3.9
        const tail = ctx!.createLinearGradient(
          shooting.x,
          shooting.y,
          shooting.x - len,
          shooting.y - len * 0.6,
        )
        tail.addColorStop(0, `rgba(${color},.75)`)
        tail.addColorStop(1, `rgba(${color},0)`)
        ctx!.strokeStyle = tail
        ctx!.lineWidth = 1.5
        ctx!.beginPath()
        ctx!.moveTo(shooting.x, shooting.y)
        ctx!.lineTo(shooting.x - len, shooting.y - len * 0.6)
        ctx!.stroke()
        ctx!.beginPath()
        ctx!.arc(shooting.x, shooting.y, 1.5, 0, 7)
        ctx!.fillStyle = `rgba(${color},.9)`
        ctx!.fill()
        if (shooting.y > H + 24) {
          shooting = null
          next = 300 + Math.random() * 220
        }
      }
    }

    // ── Regra 1: sem movimento, um frame estático e ponto final ──────────
    if (reduced) {
      const onResizeStatic = (): void => {
        fit()
        nebula = null // a névoa pré-renderizada tem o tamanho da tela antiga
        draw(0, false)
      }
      window.addEventListener('resize', onResizeStatic)
      draw(0, false)
      return () => {
        window.removeEventListener('resize', onResizeStatic)
        observer.disconnect()
      }
    }

    // ── Laço ─────────────────────────────────────────────────────────────
    let t = 0
    let raf = 0
    let running = true
    telemetry.stars = N
    telemetry.running = true
    function loop(): void {
      t += 0.016
      if (settleUntil > 0) {
        sampleColor()
        if (performance.now() > settleUntil) settleUntil = 0
      }
      const t0 = performance.now()
      draw(t)
      // Média móvel: um frame isolado ruim não conta história; a tendência sim.
      const dt = performance.now() - t0
      telemetry.ms = telemetry.frames === 0 ? dt : telemetry.ms * 0.9 + dt * 0.1
      telemetry.pairs = pairsTested
      telemetry.frames++
      raf = requestAnimationFrame(loop)
    }

    // Regra 3: sem foco, ninguém está olhando — pare de desenhar.
    function pause(): void {
      if (!running) return
      running = false
      telemetry.running = false
      cancelAnimationFrame(raf)
    }
    function resume(): void {
      if (running) return
      running = true
      telemetry.running = true
      // Reamostra ao voltar: o tema pode ter mudado com a janela oculta.
      sampleColor()
      raf = requestAnimationFrame(loop)
    }
    function onVisibility(): void {
      if (document.visibilityState === 'hidden') pause()
      else resume()
    }

    const onResize = (): void => {
      fit()
      nebula = null // refeita no próximo frame, já no tamanho novo
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('blur', pause)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(loop)

    // Regra 4: cleanup completo.
    return () => {
      cancelAnimationFrame(raf)
      running = false
      telemetry.running = false
      window.removeEventListener('resize', onResize)
      window.removeEventListener('blur', pause)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', onVisibility)
      observer.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="fixed inset-0 z-[1] pointer-events-none"
    />
  )
}
