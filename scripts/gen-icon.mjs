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

const pngs = sizes.map((size) => {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  return Buffer.from(resvg.render().asPng())
})

fs.writeFileSync(outPng, pngs[pngs.length - 1])
const ico = await pngToIco(pngs)
fs.writeFileSync(outIco, ico)
console.log(`Gerado: ${outIco} (${sizes.join(', ')}px) e ${outPng}`)
