// Verificação do respiro no miolo dos anéis (fix): Carteira com um valor
// GRANDE, nos dois temas, + a folga texto→anel medida no console.
// Uso: node scripts/shot-ring.mjs
import { _electron as electron } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const outDir = 'screenshots/r10-ring'
fs.mkdirSync(outDir, { recursive: true })

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-ring-'))
execFileSync(process.execPath, ['scripts/seed-demo.mjs', userData], { stdio: 'ignore' })

// Infla os aportes do seed para levar a carteira a ~R$ 10.400.000,00, exercitando
// o miolo do Donut com um valor de 8 dígitos.
const file = path.join(userData, 'zent-data.json')
const d = JSON.parse(fs.readFileSync(file, 'utf8'))
for (const c of d.contributions) c.amount = c.amount * 900
fs.writeFileSync(file, JSON.stringify(d))

const env = { ...process.env, ZENT_NO_LOCK: '1', ZENT_OFFLINE: '1', ZENT_USER_DATA: userData }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['out/main/main.js'], env })
const page = await app.firstWindow()
await page.waitForSelector('aside', { timeout: 15000 })
await page.waitForTimeout(600)

/** Mede a menor folga (texto→borda interna) de cada miolo de anel visível. */
async function clearances() {
  return page.evaluate(() => {
    const out = []
    for (const box of document.querySelectorAll('[data-ring-inner-radius]')) {
      const s = getComputedStyle(box)
      if (s.display === 'none' || s.visibility === 'hidden') continue
      const rct = box.getBoundingClientRect()
      if (rct.width === 0) continue
      const r = Number(box.dataset.ringInnerRadius)
      const breathing = Number(box.dataset.ringBreathing)
      const ring = box.closest('.relative') || box.parentElement
      const rr = ring.getBoundingClientRect()
      const cx = rr.left + rr.width / 2
      const cy = rr.top + rr.height / 2
      const els = [box]
      for (const el of box.querySelectorAll('*')) {
        const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim()
        if (own !== '') els.push(el)
      }
      let min = Infinity
      for (const el of els) {
        const q = el.getBoundingClientRect()
        for (const [x, y] of [[q.left, q.top], [q.right, q.top], [q.left, q.bottom], [q.right, q.bottom]]) {
          min = Math.min(min, r - Math.hypot(x - cx, y - cy))
        }
      }
      out.push({ label: (box.textContent || '').trim().slice(0, 28), r: +r.toFixed(1), breathing: +breathing.toFixed(1), clearance: +min.toFixed(1) })
    }
    return out
  })
}

for (const theme of ['dark', 'light']) {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t
    localStorage.setItem('zent-ui', JSON.stringify({ state: { theme: t, sidebarCollapsed: false }, version: 0 }))
  }, theme)
  await page.waitForTimeout(300)
  await page.click('aside >> text="Carteira"')
  await page.waitForTimeout(700)
  // rola até a grade de composição (Donut por classe/banco)
  await page.getByText('Composição por classe').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(outDir, `carteira-${theme}.png`) })

  const cl = await clearances()
  console.log(`\n── Carteira · ${theme} — folga texto→anel por miolo ──`)
  for (const c of cl) {
    const ok = c.clearance >= c.breathing - 1.5 ? 'OK ' : 'RENTE'
    console.log(`  ${ok}  "${c.label}"  raio ${c.r}px · folga esperada ${c.breathing}px · MEDIDA ${c.clearance}px`)
  }
}

await app.close()
fs.rmSync(userData, { recursive: true, force: true })
console.log(`\ncapturas em ${outDir}`)
