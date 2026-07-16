/**
 * Gera os logos dos bancos em assets/logos/ a partir dos vetores oficiais.
 *
 * Motivo (R3 §3.2): os logos da R2 eram o LOCKUP HORIZONTAL (símbolo + wordmark)
 * espremido num quadrado — a 34px, que é o tamanho real de uso no app, a palavra
 * "bradesco"/"Santander"/"pactual" vira um borrão ilegível. As referências
 * aprovadas (n1–n4) são marcas SÓ DE SÍMBOLO.
 *
 * Como: os arquivos originais trazem símbolo e wordmark fundidos num único path,
 * então não dá para apagar o wordmark removendo elementos. A solução é recortar o
 * símbolo com <clipPath> no espaço de coordenadas original e reposicioná-lo — assim
 * o vetor continua sendo o OFICIAL, sem redesenho à mão.
 *
 * As faixas de recorte abaixo saíram de uma varredura de ocupação por coluna dos
 * arquivos renderizados (símbolo à esquerda, wordmark à direita).
 *
 * Uso: node scripts/gen-bank-logos.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'assets', 'logos')
const src = path.join(root, 'assets', 'logos-src')

/** Navy oficial do BTG — os dois BTGs são a MESMA marca; distinguem-se por inversão. */
const BTG_NAVY = '#0A2540'

const SPECS = [
  {
    // n1 — símbolo branco sobre o quadrado vermelho da marca
    out: 'bradesco.svg',
    from: 'bradesco.svg',
    symbol: { x: 21, y: 108, w: 42, h: 40 },
    mark: '#ffffff',
    bg: '#CC092F',
    fill: 0.5,
  },
  {
    // n2 — chama vermelha, sem quadrado (o app já assenta tudo num chip branco)
    out: 'santander.svg',
    from: 'santander.svg',
    symbol: { x: 18, y: 109, w: 40, h: 38 },
    mark: '#EC0000',
    bg: null,
    fill: 0.78,
  },
  {
    // n3 — BTG Banking: marca navy sobre claro
    out: 'btgbanking.svg',
    from: 'btgbanking.svg',
    symbol: { x: 43, y: 95, w: 74, h: 67 },
    mark: BTG_NAVY,
    bg: null,
    fill: 0.8,
  },
  {
    // n4 — BTG Investimentos: marca branca sobre o quadrado navy (inversão de n3)
    out: 'btginvestimentos.svg',
    from: 'btginvestimentos.svg',
    symbol: { x: 43, y: 95, w: 74, h: 67 },
    mark: '#ffffff',
    bg: BTG_NAVY,
    fill: 0.62,
  },
]

/** Extrai o <g transform> + conteúdo interno (símbolo+wordmark) do arquivo oficial. */
function extractArtwork(svg) {
  const withoutRect = svg.replace(/<rect[^>]*\/>/, '')
  const open = withoutRect.indexOf('<g')
  const close = withoutRect.lastIndexOf('</svg>')
  if (open === -1 || close === -1) throw new Error('estrutura de SVG inesperada')
  return withoutRect.slice(open, close).trim()
}

for (const spec of SPECS) {
  const original = fs.readFileSync(path.join(src, spec.from), 'utf8')
  let art = extractArtwork(original)
  // recolore a marca (os originais trazem a marca em branco)
  art = art.replace(/#ffffff/gi, spec.mark).replace(/fill:\s*#fff(fff)?/gi, `fill:${spec.mark}`)

  const { x, y, w, h } = spec.symbol
  const cx = x + w / 2
  const cy = y + h / 2
  const k = (256 * spec.fill) / Math.max(w, h)
  const id = spec.out.replace('.svg', '')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img">
  <!-- Gerado por scripts/gen-bank-logos.mjs — símbolo oficial recortado do lockup. -->
  <defs>
    <clipPath id="sym-${id}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}"/>
    </clipPath>
  </defs>
${spec.bg ? `  <rect width="256" height="256" rx="56" fill="${spec.bg}"/>\n` : ''}  <g transform="translate(128 128) scale(${k.toFixed(4)}) translate(${-cx} ${-cy})">
    <g clip-path="url(#sym-${id})">
      ${art}
    </g>
  </g>
</svg>
`
  fs.writeFileSync(path.join(dir, spec.out), svg)
  console.log('gerado', spec.out)
}
