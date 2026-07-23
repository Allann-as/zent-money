// Gera assets/icon/zent.ico (multi-resolução) a partir de assets/icon/zent.svg.
// Uso: node scripts/gen-icon.mjs
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'
import fs from 'node:fs'
import path from 'node:path'

const svgPath = path.resolve('assets/icon/zent.svg')
const outIco = path.resolve('assets/icon/zent.ico')
const outPng = path.resolve('assets/icon/zent-256.png')

const svg = fs.readFileSync(svgPath, 'utf-8')
const sizes = [16, 24, 32, 48, 64, 128, 256]

/**
 * Engrossamento ÓPTICO nos tamanhos pequenos (R10 §3).
 *
 * A marca Ascensão é de TRAÇO, não de massa: renderizada a 16px, um stroke de
 * 2.2 (em unidades da marca) vira meio pixel e some no antialiasing — o ícone
 * do atalho apareceria lavado. Nos tamanhos ≤24px os dois pesos sobem para
 * 2.6/2.2, exatamente como o componente ZentMark faz na tela.
 *
 * A substituição é de string e não de geometria de propósito: os `d` do path
 * continuam sendo os aprovados, byte por byte, em todos os tamanhos.
 */
const boldSvg = svg
  .replace('stroke-width="2.2"', 'stroke-width="2.6"')
  .replace('stroke-width="1.8"', 'stroke-width="2.2"')
if (boldSvg === svg) {
  throw new Error('gen-icon: não encontrei os stroke-width da marca em zent.svg')
}

const pngs = sizes.map((size) => {
  const source = size <= 24 ? boldSvg : svg
  const resvg = new Resvg(source, { fitTo: { mode: 'width', value: size } })
  return Buffer.from(resvg.render().asPng())
})

fs.writeFileSync(outPng, pngs[pngs.length - 1])
const ico = await pngToIco(pngs)
fs.writeFileSync(outIco, ico)
console.log(`Gerado: ${outIco} (${sizes.join(', ')}px, ≤24 engrossado) e ${outPng}`)
