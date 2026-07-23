import { describe, expect, it } from 'vitest'
import {
  MIN_RING_THICKNESS,
  innerRadiusPx,
  ringSafeWidth,
  thinnedThickness,
} from '@/design/ringGeometry'
import { formatBRLCompact } from '@/engine/money'

/**
 * Robustez de magnitude (R10) — a parte PURA da regra.
 *
 * A cascata completa depende de medir texto no canvas e é verificada no app
 * rodando (scripts/stress-magnitude.mjs). Aqui ficam a geometria e a notação,
 * que são conta e não precisam de navegador para estarem certas.
 */
describe('ringSafeWidth — a corda, não o diâmetro', () => {
  it('num bloco de altura zero, devolve o diâmetro menos as margens', () => {
    // 2·√(r² − 0) − 2·margem
    expect(ringSafeWidth(100, 0, 4)).toBeCloseTo(192, 5)
  })

  it('encolhe conforme o bloco fica mais alto — que é o ponto da regra', () => {
    const baixo = ringSafeWidth(100, 20, 0)
    const alto = ringSafeWidth(100, 120, 0)
    expect(baixo).toBeGreaterThan(alto)
    // 2·√(100² − 60²) = 160
    expect(alto).toBeCloseTo(160, 5)
  })

  it('reproduz o caso que causou o vazamento do Donut', () => {
    // Raio interno real do Donut (size 190, thickness 22) ≈ 74,1px.
    const r = innerRadiusPx(190, 11)
    expect(r).toBeCloseTo(74.1, 1)
    // Comparação com o antigo `px-6` (142px de caixa) tem de ser CORDA CRUA
    // contra caixa: o px-6 também não reservava margem nenhuma.
    // 2 linhas (repouso) cabiam em ~142,7 — passava raspando.
    const duasLinhas = ringSafeWidth(r, 40, 0)
    expect(duasLinhas).toBeGreaterThan(142)
    // 3 linhas (hover) só permitem ~136 — e a caixa continuava com 142.
    const tresLinhas = ringSafeWidth(r, 58, 0)
    expect(tresLinhas).toBeLessThan(142)
    // É esta diferença que o refinamento do Allan captura: dimensionar pelo
    // pior caso, nunca pelo estado atual.
    expect(duasLinhas - tresLinhas).toBeGreaterThan(5)
  })

  it('devolve 0 quando o bloco é mais alto que o círculo', () => {
    expect(ringSafeWidth(30, 80)).toBe(0)
    expect(ringSafeWidth(30, 60)).toBe(0)
  })
})

describe('innerRadiusPx', () => {
  it('mede a borda INTERNA do traço, não a linha central', () => {
    // ProgressRing size 104, thickness 9 → (50−9)/100·104
    expect(innerRadiusPx(104, 9)).toBeCloseTo(42.64, 2)
    // Anel de Hoje: size 210, thickness 15
    expect(innerRadiusPx(210, 15)).toBeCloseTo(73.5, 2)
  })
})

describe('thinnedThickness — etapa (d) só existe quando há folga', () => {
  it('afina até o mínimo quando o anel é grosso', () => {
    const t = thinnedThickness(22, 190) // 22/100·190 = 41,8px
    expect((t / 100) * 190).toBeCloseTo(MIN_RING_THICKNESS, 5)
  })

  it('NÃO afina um anel que já está abaixo do mínimo', () => {
    // ProgressRing: 9/100·120 = 10,8px — já é mais fino que 14.
    expect(thinnedThickness(9, 120)).toBe(9)
  })
})

describe('formatBRLCompact — escala até bilhões', () => {
  it('mantém o valor exato abaixo de mil', () => {
    expect(formatBRLCompact(99_999)).toContain('999,99')
  })

  it('compacta em mil, milhão e bilhão', () => {
    expect(formatBRLCompact(25_050_000)).toBe('R$ 250,5 mil')
    expect(formatBRLCompact(1_040_000_000)).toBe('R$ 10,4 mi')
    expect(formatBRLCompact(120_000_000_000)).toBe('R$ 1,2 bi')
  })

  it('o degrau de bilhão existe porque sem ele o compacto fica MAIOR', () => {
    // 999.999.999,99 escolhia a unidade pelo valor BRUTO e virava
    // "R$ 1.000 mi" — mais largo e lendo como mil milhões. A unidade passou a
    // ser escolhida depois de arredondar. Compactar tem de encurtar.
    const compacto = formatBRLCompact(99_999_999_999)
    expect(compacto.length).toBeLessThan('R$ 999.999.999,99'.length)
    expect(compacto).toContain('bi')
  })

  it('funciona igual para negativos', () => {
    expect(formatBRLCompact(-1_040_000_000)).toBe('R$ -10,4 mi')
  })
})
