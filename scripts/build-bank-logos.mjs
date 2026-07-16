// Compõe os logos dos bancos em assets/logos/ a partir dos SVGs oficiais
// (Wikimedia Commons/Simple Icons): quadrado arredondado na cor da marca +
// marca em branco — consistente entre todos os bancos e legível nos 2 temas.
// Uso: node scripts/build-bank-logos.mjs <pasta-com-fontes>
import { Resvg } from '@resvg/resvg-js'
import fs from 'node:fs'
import path from 'node:path'

const srcDir = process.argv[2]
if (!srcDir) {
  console.error('uso: node scripts/build-bank-logos.mjs <pasta-com-fontes>')
  process.exit(1)
}
const outDir = path.resolve('assets/logos')
fs.mkdirSync(outDir, { recursive: true })

/** Extrai viewBox (ou width/height) e o miolo (children) de um SVG. */
function parseSvg(file) {
  const raw = fs.readFileSync(path.join(srcDir, file), 'utf-8')
  const open = raw.match(/<svg\b[^>]*>/)
  if (!open) throw new Error(`${file}: sem <svg>`)
  let vb = /viewBox="([^"]+)"/.exec(open[0])?.[1]
  if (!vb) {
    const w = /width="([\d.]+)/.exec(open[0])?.[1]
    const h = /height="([\d.]+)/.exec(open[0])?.[1]
    vb = `0 0 ${w} ${h}`
  }
  let inner = raw.slice(raw.indexOf(open[0]) + open[0].length, raw.lastIndexOf('</svg>'))
  // remove metadata/defs de editores (Inkscape etc.)
  inner = inner
    .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
    .replace(/<sodipodi:namedview[\s\S]*?(\/>|<\/sodipodi:namedview>)/g, '')
    .replace(/<title[\s\S]*?<\/title>/g, '')
    // remove atributos com namespaces de editores (quebram o resvg)
    .replace(/\s(?:inkscape|sodipodi|xlink|dc|cc|rdf):[-\w.]+="[^"]*"/g, '')
  return { vb: vb.split(/[ ,]+/).map(Number), inner }
}

/** Força todos os preenchimentos para branco. */
function whiten(inner) {
  return inner
    .replace(/fill="(?!none)[^"]*"/g, 'fill="#ffffff"')
    .replace(/fill:\s*(?!none)[^;"}]+/g, 'fill:#ffffff')
    .replace(/stroke="(?!none)[^"]*"/g, 'stroke="#ffffff"')
}

/** Monta: fundo 256 arredondado na cor da marca + marca centrada. */
function compose({ src, out, bg, scale = 0.72, white = true, plain = false }) {
  if (plain) {
    // usa o arquivo original como está (já é o ícone quadrado da marca)
    fs.copyFileSync(path.join(srcDir, src), path.join(outDir, out))
    return
  }
  const { vb, inner } = parseSvg(src)
  const [minX, minY, w, h] = vb
  const box = 256 * scale
  const k = Math.min(box / w, box / h)
  const dw = w * k
  const dh = h * k
  const dx = (256 - dw) / 2
  const dy = (256 - dh) / 2
  const content = white ? whiten(inner) : inner
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="56" fill="${bg}"/>
  <g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${k.toFixed(4)}) translate(${(-minX).toFixed(2)} ${(-minY).toFixed(2)})">${content}</g>
</svg>`
  fs.writeFileSync(path.join(outDir, out), svg)
}

compose({ src: 'nubank-src.svg', out: 'nubank.svg', bg: '#820AD1', scale: 0.6 })
compose({ src: 'itau-src.svg', out: 'itau.svg', bg: '', plain: true })
compose({ src: 'bradesco-src.svg', out: 'bradesco.svg', bg: '#CC092F', scale: 0.84 })
compose({ src: 'santander-src.svg', out: 'santander.svg', bg: '#EA1D25', scale: 0.86 })
compose({ src: 'btg-src.svg', out: 'btginvestimentos.svg', bg: '#0A2540', scale: 0.66 })
compose({ src: 'btg-src.svg', out: 'btgbanking.svg', bg: '#2C5EA9', scale: 0.66 })

// Prova visual: rasteriza cada logo e monta a prancheta com <image>
const files = ['nubank', 'itau', 'bradesco', 'santander', 'btginvestimentos', 'btgbanking']
const tiles = files.map((f, i) => {
  const svg = fs.readFileSync(path.join(outDir, `${f}.svg`), 'utf-8')
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } }).render().asPng()
  const b64 = Buffer.from(png).toString('base64')
  return `<image x="${i * 300 + 22}" y="22" width="256" height="256" href="data:image/png;base64,${b64}"/>`
})
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${files.length * 300} 300">
  <rect width="${files.length * 300}" height="300" fill="#0b1424"/>
  ${tiles.join('\n')}
</svg>`
const png = new Resvg(sheet, { fitTo: { mode: 'width', value: 1500 } }).render().asPng()
fs.writeFileSync(path.join(srcDir, 'prancheta.png'), png)
console.log(`Logos em ${outDir} · prova: ${path.join(srcDir, 'prancheta.png')}`)
