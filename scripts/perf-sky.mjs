/**
 * Mede o custo do céu de galáxia (R10 §1) — §16 exige FPS medido nas 10 seções,
 * não estimado.
 *
 * Roda o app de verdade em CADA resolução pedida, percorre as 10 seções e lê:
 *  · `__zentSky.ms`    — ms de CPU por frame gastos DESENHANDO o céu
 *  · `__zentSky.pairs` — pares de estrelas testados por frame (o termo O(N²))
 *  · FPS observado     — deltas entre frames de um rAF paralelo
 *
 * As duas resoluções importam porque a densidade é proporcional à ÁREA:
 * 1366×768 dá N≈201 estrelas, 1920×1080 dá N≈359 — o custo do laço de pares
 * cresce com o QUADRADO disso, ou seja ~3× mais pares, não 1,4×.
 *
 * Uso: node scripts/perf-sky.mjs [--data <dir>]
 */
import { _electron as electron } from 'playwright'

const dataArg = process.argv.indexOf('--data')
const env = { ...process.env, ZENT_NO_LOCK: '1', ZENT_OFFLINE: '1' }
if (dataArg > -1) env.ZENT_USER_DATA = process.argv[dataArg + 1]
delete env.ELECTRON_RUN_AS_NODE

const RESOLUTIONS = [
  { w: 1366, h: 768 },
  { w: 1920, h: 1080 },
]
const SECTIONS = [
  'Hoje', 'Visão geral', 'Ganhos', 'Gastos', 'Bancos & Cartões',
  'Crédito', 'Parcelas', 'Carteira', 'Caixinhas', 'Linha do tempo',
]

/** Observa FPS e o custo publicado pelo céu por `ms` milissegundos. */
async function sample(page, ms) {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const deltas = []
        let last = performance.now()
        const started = last
        function tick(now) {
          deltas.push(now - last)
          last = now
          if (now - started < duration) requestAnimationFrame(tick)
          else {
            deltas.sort((a, b) => a - b)
            const sky = window.__zentSky
            resolve({
              fps: Math.round(1000 / (deltas.reduce((s, d) => s + d, 0) / deltas.length)),
              p95: +deltas[Math.floor(deltas.length * 0.95)].toFixed(1),
              skyMs: sky ? +sky.ms.toFixed(2) : null,
              stars: sky ? sky.stars : null,
              pairs: sky ? sky.pairs : null,
            })
          }
        }
        requestAnimationFrame(tick)
      }),
    ms,
  )
}

const report = []

for (const res of RESOLUTIONS) {
  const app = await electron.launch({ args: ['out/main/main.js'], env })
  let page = null
  for (let i = 0; i < 80 && page === null; i++) {
    for (const w of app.windows()) if (!w.url().includes('#quick')) page = w
    if (page === null) await new Promise((r) => setTimeout(r, 100))
  }
  await page.waitForSelector('aside', { timeout: 20000 })
  // Redimensiona a JANELA (não só o viewport): o céu semeia a densidade a
  // partir do tamanho real, então medir com a janela errada mede outra coisa.
  const win = await app.browserWindow(page)
  await win.evaluate((b, r) => b.setContentSize(r.w, r.h), res)
  await page.waitForTimeout(1200)

  // Recarrega para a semeadura acontecer JÁ no tamanho alvo (as coordenadas
  // são normalizadas, então resize não re-semeia — é a regra do §1).
  await page.reload()
  await page.waitForSelector('aside', { timeout: 20000 })
  await page.waitForTimeout(1000)

  const perSection = []
  for (const label of SECTIONS) {
    if (label === 'Crédito') {
      await page
        .getByRole('navigation', { name: 'Seções' })
        .getByRole('button', { name: 'Crédito', exact: true })
        .click()
    } else {
      await page.click(`aside >> text="${label}"`)
    }
    await page.waitForTimeout(700) // deixa a travessia de bloco terminar
    perSection.push({ label, ...(await sample(page, 1600)) })
  }
  report.push({ res, perSection })
  await app.close()
}

console.log('\n══ CUSTO DO CÉU DE GALÁXIA (§1) ══\n')
for (const { res, perSection } of report) {
  const stars = perSection[0].stars
  const pairs = perSection[0].pairs
  console.log(`── ${res.w}×${res.h} · ${stars} estrelas · ${pairs} pares testados/frame ──`)
  console.log('  seção'.padEnd(24), 'fps'.padStart(5), 'p95 ms'.padStart(8), 'céu ms'.padStart(8))
  for (const s of perSection) {
    console.log(
      `  ${s.label}`.padEnd(24),
      String(s.fps).padStart(5),
      String(s.p95).padStart(8),
      String(s.skyMs).padStart(8),
    )
  }
  const worst = Math.max(...perSection.map((s) => s.skyMs ?? 0))
  const minFps = Math.min(...perSection.map((s) => s.fps))
  console.log(`  → pior custo do céu: ${worst.toFixed(2)}ms/frame · pior FPS: ${minFps}\n`)
}
