import { describe, expect, it } from 'vitest'
import { brToIso, isoToBr, maskBr } from '@/design/components/DateField'

/**
 * Conversão do calendário próprio (R10 §8).
 *
 * O campo aceita DIGITAÇÃO, e é aí que mora o risco: um "31/02/2026" digitado
 * sem validação viraria uma data que o resto do app trata como real e que
 * aparece no ledger. Estes testes cobrem a fronteira entre o que o usuário
 * digita e o ISO que sai daqui — o único formato que o app conhece.
 */
describe('DateField — texto ↔ ISO', () => {
  it('converte ISO para dd/mm/aaaa e de volta', () => {
    expect(isoToBr('2026-07-23')).toBe('23/07/2026')
    expect(brToIso('23/07/2026')).toBe('2026-07-23')
  })

  it('devolve vazio para ISO malformado', () => {
    expect(isoToBr('')).toBe('')
    expect(isoToBr('2026-7-3')).toBe('')
    expect(isoToBr('qualquer coisa')).toBe('')
  })

  it('recusa dia que não existe no mês', () => {
    expect(brToIso('31/02/2026')).toBeNull()
    expect(brToIso('31/04/2026')).toBeNull()
    expect(brToIso('30/02/2024')).toBeNull()
  })

  it('aceita 29 de fevereiro em ano bissexto e recusa fora dele', () => {
    expect(brToIso('29/02/2024')).toBe('2024-02-29')
    expect(brToIso('29/02/2026')).toBeNull()
  })

  it('recusa mês e dia fora de faixa', () => {
    expect(brToIso('10/13/2026')).toBeNull()
    expect(brToIso('00/07/2026')).toBeNull()
    expect(brToIso('10/00/2026')).toBeNull()
  })

  it('recusa texto incompleto em vez de adivinhar', () => {
    expect(brToIso('23/07')).toBeNull()
    expect(brToIso('2307')).toBeNull()
    expect(brToIso('')).toBeNull()
  })

  it('mascara conforme se digita, sem exigir as barras', () => {
    expect(maskBr('2')).toBe('2')
    expect(maskBr('23')).toBe('23')
    expect(maskBr('2307')).toBe('23/07')
    expect(maskBr('23072026')).toBe('23/07/2026')
    // colar uma data já formatada não duplica as barras
    expect(maskBr('23/07/2026')).toBe('23/07/2026')
    // e o excesso é cortado em vez de virar lixo
    expect(maskBr('230720261234')).toBe('23/07/2026')
  })

  it('apagar caracteres devolve a máscara ao estado anterior', () => {
    expect(maskBr('23/07/202')).toBe('23/07/202')
    expect(maskBr('23/0')).toBe('23/0')
    expect(maskBr('2')).toBe('2')
  })
})
