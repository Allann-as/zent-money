/**
 * Verifica as regras de produção do céu (R10 §1) no app RODANDO — o §16 pede
 * "congelamento sob reduced-motion e sem foco comprovados", não prometidos.
 *
 * Prova quatro coisas:
 *  1. reduced-motion → UM frame estático, sem rAF (o contador nunca sai de 0)
 *  2. sem foco       → o laço para; com foco de volta → retoma
 *  3. canvas único   → trocar de seção NÃO recria o campo de estrelas
 *  4. cor sincronizada → durante a travessia, a cor com que o canvas pinta é,
 *     no MESMO instante, a que o CSS calculou para `--sky` (a correção do
 *     Allan: se cada um interpolasse por conta, o olho veria duas trocas)
 *
 * Uso: node scripts/verify-sky.mjs [--data <dir>]
 */
import { _electron as electron } from 'playwright'

const dataArg = process.argv.indexOf('--data')
const baseEnv = { ...process.env, ZENT_NO_LOCK: '1', ZENT_OFFLINE: '1' }
if (dataArg > -1) baseEnv.ZENT_USER_DATA = process.argv[dataArg + 1]
delete baseEnv.ELECTRON_RUN_AS_NODE

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? 'OK  ' : 'FALHA'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function launch(extraEnv = {}) {
  const app = await electron.launch({ args: ['out/main/main.js'], env: { ...baseEnv, ...extraEnv } })
  let page = null
  for (let i = 0; i < 80 && page === null; i++) {
    for (const w of app.windows()) if (!w.url().includes('#quick')) page = w
    if (page === null) await new Promise((r) => setTimeout(r, 100))
  }
  await page.waitForSelector('aside', { timeout: 20000 })
  await page.waitForTimeout(800)
  return { app, page }
}

const sky = (page) => page.evaluate(() => ({ ...window.__zentSky }))

// ── 1. reduced-motion: um frame e ponto final ────────────────────────────
console.log('\n── regra 1: prefers-reduced-motion ──')
{
  // O Electron respeita a flag de linha de comando do Chromium.
  const { app, page } = await launch({ ZENT_E2E_REDUCED: '1' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await page.waitForSelector('aside', { timeout: 20000 })
  await page.waitForTimeout(1500)
  const a = await sky(page)
  await page.waitForTimeout(1200)
  const b = await sky(page)
  check(
    'nenhum frame animado sob reduced-motion',
    a.frames === 0 && b.frames === 0,
    `frames ${a.frames} → ${b.frames}`,
  )
  // O canvas tem de estar DESENHADO (frame estático), não em branco.
  const painted = await page.evaluate(() => {
    const cv = document.querySelector('canvas')
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data
    let lit = 0
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) lit++
    return lit
  })
  check('o frame estático foi realmente pintado', painted > 0, `${painted} amostras com tinta`)
  await app.close()
}

// ── 2 a 4: com movimento ─────────────────────────────────────────────────
console.log('\n── regras 2–4: pausa sem foco · canvas único · cor sincronizada ──')
{
  const { app, page } = await launch()

  // 2. pausa sem foco
  const before = await sky(page)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.waitForTimeout(600)
  const paused1 = await sky(page)
  await page.waitForTimeout(600)
  const paused2 = await sky(page)
  check(
    'o laço para quando a janela perde o foco',
    paused1.frames === paused2.frames && paused1.running === false,
    `frames congelados em ${paused2.frames} (desenhava ${before.frames})`,
  )
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(600)
  const resumed = await sky(page)
  check(
    'e retoma quando o foco volta',
    resumed.frames > paused2.frames && resumed.running === true,
    `${paused2.frames} → ${resumed.frames}`,
  )

  // 3. canvas único: navegar não re-semeia
  const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length)
  const starsBefore = (await sky(page)).stars
  for (const label of ['Gastos', 'Crédito', 'Caixinhas', 'Hoje']) {
    if (label === 'Crédito') {
      await page.getByRole('navigation', { name: 'Seções' }).getByRole('button', { name: 'Crédito', exact: true }).click()
    } else {
      await page.click(`aside >> text="${label}"`)
    }
    await page.waitForTimeout(500)
  }
  const after = await sky(page)
  check(
    'um canvas só, e trocar de seção não re-semeia o céu',
    canvasCount === 1 && after.stars === starsBefore && after.frames > resumed.frames,
    `${canvasCount} canvas · ${starsBefore} estrelas antes e depois`,
  )

  // 4. cor: canvas e CSS na MESMA curva, no MESMO instante
  await page.click('aside >> text="Hoje"') // Bloco 1
  await page.waitForTimeout(700)
  const samples = await page.evaluate(async () => {
    const read = () => {
      const css = getComputedStyle(document.documentElement).getPropertyValue('--sky')
      const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(css)
      return {
        css: m ? [m[1], m[2], m[3]].map((c) => Math.round(Number(c))).join(',') : css.trim(),
        canvas: window.__zentSky.color,
      }
    }
    const out = []
    // Dispara a travessia para o Bloco 4 e amostra durante os 450ms.
    document.querySelector('aside').querySelectorAll('button').forEach((b) => {
      if (b.textContent.trim() === 'Caixinhas') b.click()
    })
    for (let i = 0; i < 14; i++) {
      await new Promise((r) => requestAnimationFrame(() => r()))
      await new Promise((r) => requestAnimationFrame(() => r()))
      out.push(read())
    }
    return out
  })
  // Tolerância de 1 por canal: o canvas lê no frame N e o CSS é consultado
  // microssegundos depois, dentro do mesmo frame.
  const dist = (a, b) => {
    const x = a.split(',').map(Number)
    const y = b.split(',').map(Number)
    return Math.max(...x.map((v, i) => Math.abs(v - y[i])))
  }
  const worst = Math.max(...samples.map((s) => dist(s.css, s.canvas)))
  const moved = new Set(samples.map((s) => s.canvas)).size
  check(
    'a cor do canvas acompanha `--sky` durante a travessia',
    worst <= 1 && moved >= 3,
    `pior diferença ${worst}/255 em ${samples.length} amostras · ${moved} cores distintas (interpolando)`,
  )

  await app.close()
}

const failed = results.filter((r) => !r.ok)
console.log(
  failed.length === 0
    ? `\n§1 OK — ${results.length} regras de produção comprovadas no app rodando.\n`
    : `\n§1 FALHOU — ${failed.length} de ${results.length} regras.\n`,
)
process.exit(failed.length === 0 ? 0 : 1)
