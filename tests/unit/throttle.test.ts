import { describe, expect, it } from 'vitest'
import { attemptsLeftFor, delayForFails, FREE_ATTEMPTS, MAX_DELAY_MS } from '../../electron/throttle'

/**
 * Throttling progressivo do PIN (M2 §b, R10 §⑦).
 *
 * A verificação em si (scrypt, tempo constante, arquivo) vive no MAIN e o E2E 21
 * exercita o caminho real. Aqui provamos a CURVA do atraso, que é pura: 5
 * tentativas livres, depois dobra até o teto de 30s. É o que impede um chute
 * cego de ir rápido demais sem, mesmo assim, trancar o dono legítimo para sempre.
 */

describe('curva do throttling (M2 §b)', () => {
  it('não atrasa nada durante as tentativas livres', () => {
    for (let f = 0; f < FREE_ATTEMPTS; f++) {
      expect(delayForFails(f)).toBe(0)
      expect(attemptsLeftFor(f)).toBe(FREE_ATTEMPTS - f)
    }
  })

  it('após esgotar as livres, dobra a cada erro: 1s, 2s, 4s, 8s, 16s', () => {
    expect(delayForFails(5)).toBe(1000)
    expect(delayForFails(6)).toBe(2000)
    expect(delayForFails(7)).toBe(4000)
    expect(delayForFails(8)).toBe(8000)
    expect(delayForFails(9)).toBe(16000)
  })

  it('nunca passa do teto de 30s, por mais que se erre', () => {
    expect(delayForFails(10)).toBe(MAX_DELAY_MS) // 32s seria, cortado em 30
    expect(delayForFails(50)).toBe(MAX_DELAY_MS)
    expect(delayForFails(999)).toBe(MAX_DELAY_MS)
  })

  it('as tentativas restantes nunca ficam negativas', () => {
    expect(attemptsLeftFor(FREE_ATTEMPTS)).toBe(0)
    expect(attemptsLeftFor(FREE_ATTEMPTS + 10)).toBe(0)
  })
})
