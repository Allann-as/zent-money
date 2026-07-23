// Verificação do tooltip: nenhum ultrapassa a janela, em nenhum canto.
// Uso: node scripts/verify-tooltip.mjs
//
// O defeito: o tooltip do "Recolher (Ctrl+B)", colado no topo da sidebar, era
// desenhado ACIMA da âncora e saía da janela, cobrindo a marca. A correção é no
// componente (vira de lado quando não cabe, grampeia nas bordas), então a
// verificação passa por TODOS os tooltips do menu recolhido, em várias
// resoluções — inclusive 1366×768.
import { _electron as electron } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const RESOLUTIONS = [
  { w: 1366, h: 768 },
  { w: 1920, h: 1080 },
  { w: 1024, h: 640 }, // janela pequena: o pior caso para colisão
]

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-tip-'))
execFileSync(process.execPath, ['scripts/seed-demo.mjs', userData], { stdio: 'ignore' })
const env = { ...process.env, ZENT_NO_LOCK: '1', ZENT_OFFLINE: '1', ZENT_USER_DATA: userData }
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({ args: ['out/main/main.js'], env })
let page = null
for (let i = 0; i < 80 && !page; i++) { for (const w of app.windows()) if (!w.url().includes('#quick')) page = w; if (!page) await new Promise((r) => setTimeout(r, 100)) }
await page.waitForSelector('aside', { timeout: 15000 })
await page.waitForTimeout(600)
const win = await app.browserWindow(page)

let checks = 0
let bad = 0
const report = []

/** Passa o mouse no alvo e devolve os retângulos do tooltip e da âncora. */
async function tipRectFor(locator) {
  await locator.hover({ force: true })
  await page.waitForTimeout(140)
  const anchor = await locator.boundingBox().catch(() => null)
  const tip = await page.evaluate(() => {
    const el = document.querySelector('[data-tooltip]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height, text: (el.textContent || '').slice(0, 30) }
  })
  return tip === null ? null : { ...tip, anchor }
}

/**
 * Distância entre o tooltip e a âncora (0 se encostam/sobrepõem).
 *
 * Existe porque "não sai da janela" NÃO basta: com o invólucro `display:
 * contents` devolvendo caixa zero, o tooltip ia para o canto (0,0) — dentro da
 * janela, e ainda assim errado. Um tooltip longe do seu botão não é tooltip.
 */
function gapFrom(tip, a) {
  if (!a) return 0
  const dx = Math.max(a.x - tip.right, tip.left - (a.x + a.width), 0)
  const dy = Math.max(a.y - tip.bottom, tip.top - (a.y + a.height), 0)
  return Math.hypot(dx, dy)
}

for (const res of RESOLUTIONS) {
  await win.evaluate((b, r) => b.setContentSize(r.w, r.h), res)
  await page.waitForTimeout(400)

  // Recolhe o menu (Ctrl+B) — é nele que vivem os tooltips da sidebar.
  await page.keyboard.press('Control+b')
  await page.waitForTimeout(450)

  // Os dois lugares com tooltip: o botão de recolher/expandir do menu
  // (`side="right"`, colado no TOPO — o caso relatado) e a ilha de ações
  // (`side="top"`, colada no canto inferior direito).
  const targets = [
    ...(await page.locator('aside button').all()),
    ...(await page.locator('[aria-label="Buscar"], [aria-label="Ocultar valores (modo privacidade)"], [aria-label="Mostrar valores"], [aria-label="Tema claro"], [aria-label="Tema escuro"]').all()),
  ]
  for (const t of targets) {
    if (!(await t.isVisible().catch(() => false))) continue
    const rect = await tipRectFor(t)
    if (rect === null) continue
    checks++
    const out = []
    if (rect.left < 0) out.push(`esquerda ${rect.left.toFixed(0)}`)
    if (rect.top < 0) out.push(`topo ${rect.top.toFixed(0)}`)
    if (rect.right > res.w) out.push(`direita ${rect.right.toFixed(0)} > ${res.w}`)
    if (rect.bottom > res.h) out.push(`baixo ${rect.bottom.toFixed(0)} > ${res.h}`)
    // …e tem de estar JUNTO da âncora (8px de deslocamento + folga de medida)
    const gap = gapFrom(rect, rect.anchor)
    if (gap > 24) out.push(`longe da âncora: ${gap.toFixed(0)}px`)
    if (out.length > 0) {
      bad++
      report.push(`${res.w}×${res.h} · "${rect.text}" — fora da janela: ${out.join(', ')}`)
    }
  }
  // devolve o menu ao estado fixado
  await page.keyboard.press('Control+b')
  await page.waitForTimeout(350)
}

await app.close()
fs.rmSync(userData, { recursive: true, force: true })

console.log('\n══ TOOLTIP — COLISÃO COM A JANELA ══\n')
if (bad === 0) {
  console.log(`OK — ${checks} tooltips verificados em ${RESOLUTIONS.length} resoluções; nenhum ultrapassa a janela.\n`)
  process.exit(0)
}
for (const r of report) console.log('  ✗ ' + r)
console.log(`\n${bad} de ${checks} tooltips saíram da janela.\n`)
process.exit(1)
