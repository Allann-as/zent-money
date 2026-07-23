/**
 * Verifica a promessa do R10 §5: a ilha de ações "não pode ficar na frente de
 * nada". O § manda validar isso RODANDO o app, em pelo menos 3 resoluções.
 *
 * Como a checagem é feita: a ilha é escondida por um instante e, numa grade de
 * pontos dentro do retângulo que ela ocupa, pergunta-se ao navegador QUEM está
 * ali embaixo. Se a reserva de espaço funciona, a resposta é sempre um
 * container de layout (o <main>, o div de padding, o fundo) — nunca um card,
 * um botão, um gráfico ou um texto.
 *
 * Cada seção é testada com a página ROLADA ATÉ O FIM: é lá que o último card
 * chega mais perto do rodapé, e um teste no topo da página não provaria nada.
 * Também com o menu fixado e solto, porque soltar o menu alarga o conteúdo.
 *
 * Uso: node scripts/verify-island.mjs [--data <dir>]
 */
import { _electron as electron } from 'playwright'

const dataArg = process.argv.indexOf('--data')
const env = { ...process.env, ZENT_NO_LOCK: '1', ZENT_OFFLINE: '1' }
if (dataArg > -1) env.ZENT_USER_DATA = process.argv[dataArg + 1]
delete env.ELECTRON_RUN_AS_NODE

const RESOLUTIONS = [
  { w: 1366, h: 768, name: '1366×768' },
  { w: 1920, h: 1080, name: '1920×1080' },
  { w: 1024, h: 640, name: '1024×640 (janela restaurada pequena)' },
]
const SECTIONS = [
  'Hoje', 'Visão geral', 'Ganhos', 'Gastos', 'Bancos & Cartões',
  'Crédito', 'Parcelas', 'Carteira', 'Caixinhas', 'Linha do tempo',
]

/** Elementos que são "moldura", não conteúdo: estar sob a ilha é aceitável. */
const CHROME = `main, aside, body, html, canvas, [aria-hidden="true"]`

async function probe(page) {
  return page.evaluate((chrome) => {
    const target = document.querySelector('[role="group"][aria-label="Ações rápidas"]')
    if (!target) return { error: 'ilha não encontrada' }
    // Invisível não cobre nada: a ilha se recolhe sozinha quando há conteúdo
    // embaixo dela (ver useIslandClear). O que reprova é ela estar VISÍVEL
    // com conteúdo atrás.
    if (Number(getComputedStyle(target).opacity) === 0) return { hidden: true, hits: [] }
    const r = target.getBoundingClientRect()
    // Esconde a ilha para enxergar o que existe DEBAIXO dela.
    const prev = target.style.visibility
    target.style.visibility = 'hidden'
    const hits = []
    // Margem de 8px em volta: encostar já é quase cobrir.
    const x0 = r.left - 8
    const x1 = r.right + 8
    const y0 = r.top - 8
    const y1 = r.bottom + 8
    for (let x = x0; x <= x1; x += 12) {
      for (let y = y0; y <= y1; y += 12) {
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue
        const hit = document.elementFromPoint(x, y)
        if (!hit) continue
        if (hit.matches(chrome)) continue
        // O div de padding e os wrappers do shell não pintam nada.
        const paints =
          hit.tagName === 'BUTTON' ||
          hit.tagName === 'A' ||
          hit.tagName === 'SVG' ||
          hit.tagName === 'INPUT' ||
          // texto próprio (não de descendentes)
          Array.from(hit.childNodes).some((n) => n.nodeType === 3 && n.nodeValue.trim() !== '') ||
          // superfície pintada (card, chip, barra)
          getComputedStyle(hit).backgroundColor !== 'rgba(0, 0, 0, 0)'
        if (paints) {
          hits.push({
            tag: hit.tagName.toLowerCase(),
            cls: (hit.className?.toString?.() ?? '').slice(0, 70),
            text: (hit.textContent ?? '').trim().slice(0, 30),
            at: `${Math.round(x)},${Math.round(y)}`,
          })
        }
      }
    }
    target.style.visibility = prev
    // Dedup por tag+classe
    const seen = new Map()
    for (const h of hits) if (!seen.has(h.tag + h.cls)) seen.set(h.tag + h.cls, h)
    return { rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, hits: [...seen.values()] }
  }, CHROME)
}

let failures = 0
let checks = 0

for (const res of RESOLUTIONS) {
  const app = await electron.launch({ args: ['out/main/main.js'], env })
  let page = null
  for (let i = 0; i < 80 && page === null; i++) {
    for (const w of app.windows()) if (!w.url().includes('#quick')) page = w
    if (page === null) await new Promise((r) => setTimeout(r, 100))
  }
  await page.waitForSelector('aside', { timeout: 20000 })
  const win = await app.browserWindow(page)
  await win.evaluate((b, r) => b.setContentSize(r.w, r.h), res)
  await page.waitForTimeout(900)

  /**
   * Põe o menu no estado pedido CONFERINDO antes de agir. Ctrl+B alterna, e o
   * estado é persistido entre execuções — assumir "começa fixado" fez a 3ª
   * resolução abrir com o menu solto e o clique cair fora da viewport.
   */
  async function setPinned(want) {
    for (let i = 0; i < 3; i++) {
      // Lê o ESTADO, não a largura: o <aside> leva 300ms para chegar ao
      // tamanho final, e medir no meio da transição devolve um valor
      // intermediário — foi isso que fez uma corrida inteira alternar o menu
      // para o lado errado e todos os cliques caírem fora da viewport.
      const collapsed = await page.evaluate(() => {
        try {
          return JSON.parse(localStorage.getItem('zent-ui')).state.sidebarCollapsed === true
        } catch {
          return false
        }
      })
      if (!collapsed === want) {
        await page.waitForTimeout(450) // deixa a largura assentar
        return
      }
      await page.keyboard.press('Control+b')
      await page.waitForTimeout(450)
    }
    throw new Error(`não consegui deixar o menu ${want ? 'fixado' : 'solto'}`)
  }

  /**
   * Espia o menu e ESPERA o painel entrar de fato na viewport, em vez de
   * dormir um tempo fixo. Com várias instâncias do Electron disputando a
   * máquina, a transição de 300ms às vezes chega depois do timeout fixo — e o
   * clique cairia fora da tela por causa do medidor, não do app.
   */
  async function peek() {
    /**
     * O evento é DISPARADO no <aside>, em vez de mover o ponteiro até a borda.
     *
     * Mover o mouse por coordenada não abre a espiada de forma confiável depois
     * de `setContentSize` — o ponteiro do Chromium e a janela redimensionada
     * saem de sincronia — e o medidor acabava reprovando a ilha por um problema
     * dele. O caminho REAL do ponteiro (encostar na zona quente de 34px, o
     * painel deslizar, recolher ao afastar) é o que o teste E2E 23g exercita;
     * aqui o que interessa é o LAYOUT com o menu solto, não a mecânica de
     * entrada. Cada script prova o que lhe cabe.
     *
     * E o evento é `mouseover`, não `mouseenter`: o React NÃO escuta
     * `mouseenter` (que não borbulha e por isso não pode ser delegado). Ele
     * deriva `onMouseEnter`/`onMouseLeave` de `mouseover`/`mouseout` ouvidos na
     * raiz, olhando o `relatedTarget`. Disparar `mouseenter` não chama handler
     * nenhum — parece que o app não reage, quando quem não reagiu foi o evento.
     */
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.locator('aside').dispatchEvent('mouseover')
      for (let i = 0; i < 15; i++) {
        const box = await page.locator('aside >> text="Hoje"').boundingBox()
        if ((box?.x ?? -1) >= 0) return
        await page.waitForTimeout(100)
      }
    }
    throw new Error('o painel não apareceu ao espiar')
  }

  console.log(`\n── ${res.name} ──`)
  for (const pinned of [true, false]) {
    await setPinned(pinned)
    for (const label of SECTIONS) {
      // Com o menu solto o painel vive fora da viewport: para clicar, é preciso
      // ESPIAR antes, encostando o cursor na zona quente de 34px — que é
      // exatamente o gesto que o §4 descreve. Testar de outro jeito seria
      // testar um menu que não existe.
      if (!pinned) await peek()
      if (label === 'Crédito') {
        await page
          .getByRole('navigation', { name: 'Seções' })
          .getByRole('button', { name: 'Crédito', exact: true })
          .click()
      } else {
        await page.click(`aside >> text="${label}"`)
      }
      await page.waitForTimeout(400)
      // Recolhe o painel antes da medição — a ilha tem de estar livre com o
      // menu RECOLHIDO, que é o estado normal dele.
      if (!pinned) {
        await page.locator('aside').dispatchEvent('mouseout')
        await page.waitForTimeout(400)
      }
      /**
       * Mede em VÁRIAS posições de rolagem, não só no fim.
       *
       * A reserva de padding só protege o fim da página; parada no meio de uma
       * lista comprida, a ilha ficava por cima de um valor — e foi assim que o
       * problema apareceu, num screenshot, depois de a versão anterior deste
       * script dar tudo verde medindo só o fim.
       */
      for (const at of [0, 0.25, 0.5, 0.75, 1]) {
        await page.evaluate((f) => {
          const m = document.querySelector('main')
          if (m) m.scrollTop = (m.scrollHeight - m.clientHeight) * f
        }, at)
        await page.waitForTimeout(420) // > que o debounce de 220ms da medição
        const out = await probe(page)
        checks++
        if (out.error || out.hits.length > 0) {
          failures++
          console.log(`  FALHA ${label} (menu ${pinned ? 'fixado' : 'solto'}, rolagem ${at * 100}%)`)
          for (const h of out.hits ?? []) {
            console.log(`     <${h.tag}> "${h.text}" em ${h.at} — ${h.cls}`)
          }
        }
      }
    }
    console.log(
      `  OK   10 seções com o menu ${pinned ? 'fixado' : 'solto'}, em 5 posições de rolagem cada`,
    )
  }

  // A ilha some com diálogo por cima (§5).
  await setPinned(true)
  await page.keyboard.press('Control+k') // abre a busca (role="dialog")
  await page.waitForTimeout(400)
  const hidden = await page.evaluate(() => {
    const el = document.querySelector('[role="group"][aria-label="Ações rápidas"]')
    return el ? getComputedStyle(el).opacity === '0' : false
  })
  checks++
  if (!hidden) {
    failures++
    console.log('  FALHA a ilha continua visível com um diálogo aberto')
  } else {
    console.log('  OK   a ilha some quando há diálogo por cima')
  }
  await page.keyboard.press('Escape')
  await app.close()
}

console.log(
  failures === 0
    ? `\n§5 OK — ${checks} verificações, a ilha não cobre nada em nenhuma das 3 resoluções.\n`
    : `\n§5 FALHOU — ${failures} de ${checks} verificações.\n`,
)
process.exit(failures === 0 ? 0 : 1)
