/**
 * TESTE DE ESTRESSE DE MAGNITUDE (R10) — nenhum número pode transbordar seu
 * container em nenhuma magnitude.
 *
 * Roda o app de verdade com a série de magnitudes
 *   0 · 9,99 · 999,99 · 9.999,99 · 99.999,99 · 999.999,99 · 9.999.999,99 ·
 *   99.999.999,99 · 999.999.999,99
 * e os negativos correspondentes, nas 10 seções, nos dois temas e em 1366×768
 * e 1920×1080.
 *
 * ── POR QUE ELE EXERCITA ESTADOS DE INTERAÇÃO ───────────────────────────
 * O vazamento original só existia no HOVER da rosca: em repouso o miolo tinha
 * duas linhas e cabia. Um teste que só olhasse o render estático passaria com
 * o bug vivo — foi exatamente o que aconteceu até o Allan ver na tela. Por
 * isso cada magnitude é verificada também com: hover em cada fatia da rosca,
 * tooltip aberto, modo privacidade ligado e DURANTE o count-up, quando o
 * número passa por larguras intermediárias.
 *
 * Uso: node scripts/stress-magnitude.mjs [--quick]
 */
import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const QUICK = process.argv.includes('--quick')
const ONLY = process.argv.includes('--scales')
  ? process.argv[process.argv.indexOf('--scales') + 1].split(',').map(Number)
  : null

/** Fatores de escala aplicados ao dataset demo para varrer a série. */
/**
 * Fatores de escala aplicados ao dataset demo para varrer a série.
 *
 * Não existe fator 0 aqui de propósito. Zerar tudo produz `monthlyLimit: 0`,
 * `salaryHistory.amount: 0` e afins — estados que o schema RECUSA, e com
 * razão: categoria com limite zero não é magnitude pequena, é dado corrompido.
 * O app se recusou a abrir e estava certo; quem estava errado era o teste.
 *
 * A magnitude R$ 0,00 continua coberta em TODA corrida: o dataset demo tem
 * três bancos com `openingBalance: 0` e meses sem lançamento, então o zero é
 * renderizado em todas as telas de qualquer jeito.
 *
 * ×1.000.000 sobre o demo leva o maior valor a ~R$ 5 bilhões, cobrindo o topo
 * da série pedida (999.999.999,99) com folga.
 */
const SCALES = ONLY ?? (QUICK ? [1, 10_000] : [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000])
const RESOLUTIONS = QUICK
  ? [{ w: 1366, h: 768 }]
  : [
      { w: 1366, h: 768 },
      { w: 1920, h: 1080 },
    ]
const THEMES = QUICK ? ['dark'] : ['dark', 'light']
const SECTIONS = [
  'Hoje', 'Visão geral', 'Ganhos', 'Gastos', 'Bancos & Cartões',
  'Crédito', 'Parcelas', 'Carteira', 'Caixinhas', 'Linha do tempo',
]

/**
 * Campos de TRANSAÇÃO — escalam e PODEM ir a zero.
 * É o que exercita a magnitude 0 da série: uma conta zerada, um mês sem gasto.
 */
const TX_KEYS = new Set(['amount', 'openingBalance', 'invoice', 'manualAmount', 'value', 'balance'])

/**
 * Campos ESTRUTURAIS — escalam, mas nunca vão a zero.
 *
 * O schema exige `monthlyLimit`, `limit`, `target` e `installmentAmount`
 * maiores que zero, e com razão: categoria com limite zero, cartão com limite
 * zero e meta de zero reais não são estados válidos do produto, são dados
 * corrompidos. A primeira versão deste script zerava tudo junto e o app se
 * recusou a abrir — corretamente. Quem estava errado era o teste.
 */
const STRUCT_KEYS = new Set(['limit', 'target', 'installmentAmount', 'monthlyLimit'])

function scaleMoney(node, factor, negate) {
  if (Array.isArray(node)) return node.map((n) => scaleMoney(n, factor, negate))
  if (node === null || typeof node !== 'object') return node
  const out = {}
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'number' && TX_KEYS.has(k)) {
      // factor 0 exercita o zero puro; o resto multiplica o dataset demo.
      out[k] = factor === 0 ? 0 : Math.round(v * factor)
    } else if (typeof v === 'number' && STRUCT_KEYS.has(k)) {
      out[k] = Math.max(1, Math.round(v * Math.max(1, factor)))
    } else {
      out[k] = scaleMoney(v, factor, negate)
    }
  }
  return out
}

/** Monta um userData com o dataset demo escalado. */
function seedAt(factor, negate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `zent-mag-${factor}-`))
  execFileSync(process.execPath, ['scripts/seed-demo.mjs', dir], { stdio: 'ignore' })
  const file = path.join(dir, 'zent-data.json')
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
  const scaled = scaleMoney(data, factor, negate)
  if (negate) {
    /**
     * Negativos de verdade: um ajuste de conciliação grande o bastante para
     * deixar a conta no vermelho. É o caminho honesto — o app já permite saldo
     * negativo por ajuste, então não é um estado inventado só para o teste.
     */
    const big = Math.max(1, factor) * 100_000_000
    scaled.adjustments = [
      ...(scaled.adjustments ?? []),
      { id: 'stress-neg', date: scaled.expenses?.[0]?.date ?? '2026-07-01', bankId: scaled.banks[0].id, amount: -big, note: 'Estresse: negativo' },
    ]
  }
  fs.writeFileSync(file, JSON.stringify(scaled))
  return dir
}

/**
 * A sonda: roda DENTRO da página e devolve todas as violações visíveis.
 */
const PROBE = `(() => {
  const MONEY = /R\\$|\\d{1,3}(\\.\\d{3})*,\\d{2}|••••/
  const problems = []
  const seen = new Set()

  const clsOf = (el) => {
    const c = el.getAttribute ? el.getAttribute('class') : null
    return c || ''
  }
  const push = (kind, el, detail) => {
    const key = kind + '|' + clsOf(el) + '|' + (el.textContent || '').slice(0, 24)
    if (seen.has(key)) return
    seen.add(key)
    problems.push({
      kind,
      detail,
      text: (el.textContent || '').trim().slice(0, 40),
      cls: clsOf(el).slice(0, 70),
      tag: el.tagName.toLowerCase(),
    })
  }

  const visible = (el) => {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }

  // ── 1. Transbordo e corte em qualquer elemento que carregue número ──
  for (const el of document.querySelectorAll('*')) {
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.nodeValue)
      .join('')
      .trim()
    if (own === '' || !MONEY.test(own)) continue
    if (!visible(el)) continue

    // SVG tem outra regua: scrollWidth e clientWidth sao propriedades de caixa
    // de HTML e nao significam nada num <text> de SVG — usa-las ali produzia
    // centenas de falsos positivos em rotulo de eixo. O que importa num rotulo
    // de eixo e outra coisa: se ele VAZA para fora da area do grafico, e isso
    // se mede pela caixa geometrica contra a do <svg>.
    if (el.ownerSVGElement) {
      const svg = el.ownerSVGElement
      const r = el.getBoundingClientRect()
      const sr = svg.getBoundingClientRect()
      if (r.left < sr.left - 1 || r.right > sr.right + 1) {
        push('vaza do grafico', el, 'x ' + r.left.toFixed(0) + '..' + r.right.toFixed(0) + ' fora de ' + sr.left.toFixed(0) + '..' + sr.right.toFixed(0))
      }
      continue
    }

    const s = getComputedStyle(el)
    // Containers de rolagem legítimos não contam.
    if (s.overflowX === 'auto' || s.overflowX === 'scroll') continue
    if (el.scrollWidth > el.clientWidth + 1) {
      push('transbordo', el, el.scrollWidth + '>' + el.clientWidth)
    }
    if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
      push('cortado', el, 'ellipsis em número')
    }
  }

  // ── 2. Geometria: o texto do miolo tem RESPIRO até o anel? ──
  // Não basta o bloco "caber dentro" (pertencimento): medimos a DISTÂNCIA
  // radial de cada canto do bloco E das extremidades de cada linha de texto até
  // a borda interna do anel, e exigimos ≥ folga esperada. Registramos a menor
  // folga encontrada, para o output dizer "folga mínima X px" em vez de só "0
  // violações" — sem isso o mesmo defeito volta na próxima magnitude nova.
  let minClearance = Infinity
  const TOL = 1.5 // sub-pixel + métricas de fonte
  for (const box of document.querySelectorAll('[data-ring-inner-radius]')) {
    if (!visible(box)) continue
    const r = Number(box.dataset.ringInnerRadius)
    const breathing = Number(box.dataset.ringBreathing)
    const ring = box.closest('.relative') || box.parentElement
    const rr = ring.getBoundingClientRect()
    const cx = rr.left + rr.width / 2
    const cy = rr.top + rr.height / 2

    // Pontos a medir: os 4 cantos do bloco + os 4 cantos de CADA linha de texto
    // visível (a extensão real pintada, que pode passar do bloco se algo vazar).
    const els = [box]
    for (const d of box.querySelectorAll('*')) {
      const own = Array.from(d.childNodes).filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim()
      if (own !== '' && visible(d)) els.push(d)
    }
    let boxMin = Infinity
    for (const el of els) {
      const rect = el.getBoundingClientRect()
      const pts = [
        [rect.left, rect.top], [rect.right, rect.top],
        [rect.left, rect.bottom], [rect.right, rect.bottom],
      ]
      for (const [x, y] of pts) {
        const clearance = r - Math.hypot(x - cx, y - cy) // >0 dentro do anel
        if (clearance < boxMin) boxMin = clearance
      }
    }
    if (boxMin < minClearance) minClearance = boxMin
    if (boxMin < breathing - TOL) {
      push('sem respiro no anel', box, 'folga ' + boxMin.toFixed(1) + 'px < esperado ' + breathing.toFixed(1) + 'px')
    }
  }

  // ── 3. Compactou? Então o valor exato tem de estar no title/aria ──
  for (const el of document.querySelectorAll('*')) {
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('')
    if (!/\\d\\s*(mil|mi|bi)\\b/.test(own)) continue
    if (!visible(el)) continue
    // Rotulo de EIXO pode ser compacto pela propria spec (§3) e nao carrega
    // title por marca: quem entrega o valor exato ali e o tooltip do grafico,
    // que e um componente so. Exigir title em cada tick seria ruido, nao rigor.
    if (el.ownerSVGElement) continue
    const host = el.closest('[title],[aria-label]')
    const exact = host ? (host.getAttribute('title') || host.getAttribute('aria-label') || '') : ''
    // Sob privacidade não existe valor exato para expor — e nem deve existir.
    if (document.documentElement.dataset.privacy === 'on') continue
    if (!/\\d,\\d{2}/.test(exact)) {
      push('compacto sem valor exato', el, 'title/aria: ' + JSON.stringify(exact).slice(0, 40))
    }
  }

  return { problems, minClearance: Number.isFinite(minClearance) ? minClearance : null }
})()`

let failures = 0
let checks = 0
const report = []
// Menor folga (texto→anel) vista em toda a varredura, e onde ela ocorreu — é o
// número que prova que há RESPIRO, não só contenção.
let globalMinClearance = Infinity
let minClearanceAt = ''

async function sweep(page, label, ctx) {
  checks++
  const { problems, minClearance } = await page.evaluate(PROBE)
  if (minClearance !== null && minClearance < globalMinClearance) {
    globalMinClearance = minClearance
    minClearanceAt = `${ctx} · ${label}`
  }
  if (problems.length > 0) {
    failures += problems.length
    report.push({ ctx: `${ctx} · ${label}`, problems })
  }
}

for (const factor of SCALES) {
  for (const negate of [false, true]) {
    const dir = seedAt(factor, negate)
    const env = { ...process.env, ZENT_NO_LOCK: '1', ZENT_OFFLINE: '1', ZENT_USER_DATA: dir }
    delete env.ELECTRON_RUN_AS_NODE
    const app = await electron.launch({ args: ['out/main/main.js'], env })
    let page = null
    for (let i = 0; i < 80 && page === null; i++) {
      for (const w of app.windows()) if (!w.url().includes('#quick')) page = w
      if (page === null) await new Promise((r) => setTimeout(r, 100))
    }
    await page.waitForSelector('aside', { timeout: 20000 })
    const win = await app.browserWindow(page)

    for (const res of RESOLUTIONS) {
      await win.evaluate((b, r) => b.setContentSize(r.w, r.h), res)
      await page.waitForTimeout(500)
      for (const theme of THEMES) {
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t
        }, theme)
        const ctx = `×${factor}${negate ? ' (neg)' : ''} · ${res.w}×${res.h} · ${theme}`

        for (const section of SECTIONS) {
          if (section === 'Crédito') {
            await page.getByRole('navigation', { name: 'Seções' })
              .getByRole('button', { name: 'Crédito', exact: true }).click()
          } else {
            await page.click(`aside >> text="${section}"`)
          }
          await page.waitForTimeout(420)
          await sweep(page, section, ctx)

          // ── Estado: DURANTE o count-up ──────────────────────────────
          // Navegar o mês dispara a animação; amostrar no meio pega as
          // larguras intermediárias, que o render final esconde.
          const nav = page.getByRole('button', { name: 'Mês anterior' })
          if ((await nav.count()) > 0) {
            await nav.first().click()
            for (const wait of [80, 200, 380]) {
              await page.waitForTimeout(wait === 80 ? 80 : 120)
              await sweep(page, `${section} (count-up)`, ctx)
            }
          }

          // ── Estado: HOVER em cada fatia da rosca ────────────────────
          const arcs = page.locator('svg[aria-label="Composição"] circle')
          const n = Math.min(await arcs.count(), 8)
          for (let i = 1; i < n; i++) {
            await arcs.nth(i).hover({ force: true })
            await page.waitForTimeout(160)
            await sweep(page, `${section} (hover fatia ${i})`, ctx)
          }

          // ── Estado: PRIVACIDADE ligada ─────────────────────────────
          await page.evaluate(() => {
            const b = document.querySelector('[aria-label="Ocultar valores (modo privacidade)"]')
            if (b) b.click()
          })
          await page.waitForTimeout(300)
          await sweep(page, `${section} (privacidade)`, ctx)
          await page.evaluate(() => {
            const b = document.querySelector('[aria-label="Mostrar valores"]')
            if (b) b.click()
          })
          await page.waitForTimeout(250)
        }
      }
    }
    await app.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

console.log('\n══ ESTRESSE DE MAGNITUDE ══\n')
const clearanceLine =
  Number.isFinite(globalMinClearance)
    ? `Folga mínima texto→anel: ${globalMinClearance.toFixed(1)}px (em ${minClearanceAt}).`
    : 'Nenhum miolo de anel visível na varredura.'
if (failures === 0) {
  console.log(`OK — ${checks} varreduras, nenhum número transbordou em nenhuma magnitude.`)
  console.log(clearanceLine + '\n')
  process.exit(0)
}
console.log(clearanceLine + '\n')
for (const r of report.slice(0, 40)) {
  console.log(`FALHA ${r.ctx}`)
  for (const p of r.problems.slice(0, 6)) {
    console.log(`   [${p.kind}] <${p.tag}> "${p.text}" — ${p.detail}`)
    console.log(`      ${p.cls}`)
  }
}
console.log(`\n${failures} violações em ${checks} varreduras.\n`)
process.exit(1)
