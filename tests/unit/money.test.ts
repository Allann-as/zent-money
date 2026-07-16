import { describe, expect, it } from 'vitest'
import { formatBRL, formatMoneyPlain, parseMoney } from '@/engine/money'

describe('parsing de dinheiro BR/US', () => {
  it('aceita formato brasileiro', () => {
    expect(parseMoney('1.234,56')).toBe(123456)
    expect(parseMoney('12,5')).toBe(1250)
    expect(parseMoney('0,99')).toBe(99)
    expect(parseMoney('1.234.567,89')).toBe(123456789)
  })

  it('aceita formato americano', () => {
    expect(parseMoney('1234.56')).toBe(123456)
    expect(parseMoney('12.5')).toBe(1250)
    expect(parseMoney('1,234.56')).toBe(123456)
    expect(parseMoney('1,234,567.89')).toBe(123456789)
  })

  it('inteiros sem separador', () => {
    expect(parseMoney('1234')).toBe(123400)
    expect(parseMoney('0')).toBe(0)
  })

  it('ponto único com 3 dígitos é milhar (padrão BR)', () => {
    expect(parseMoney('1.234')).toBe(123400)
    expect(parseMoney('12.345')).toBe(1234500)
  })

  it('aceita prefixo R$ e espaços', () => {
    expect(parseMoney('R$ 1.234,56')).toBe(123456)
    expect(parseMoney('  150  ')).toBe(15000)
  })

  it('negativos quando permitidos pelo chamador', () => {
    expect(parseMoney('-25,50')).toBe(-2550)
  })

  it('rejeita entradas inválidas', () => {
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('12,345')).toBeNull() // 3 casas decimais
    expect(parseMoney('1,23,4')).toBeNull()
    expect(parseMoney('1.2.3')).toBeNull()
    expect(parseMoney('12.3456')).toBeNull()
  })

  /**
   * R3 §1 — o MoneyInput chama parseMoney a CADA tecla. Todo prefixo válido de um
   * número em digitação precisa ser aceito, senão o campo rejeita o meio do caminho.
   */
  it('aceita os estados intermediários da digitação', () => {
    // digitando "2000" tecla a tecla
    expect(parseMoney('2')).toBe(200)
    expect(parseMoney('20')).toBe(2000)
    expect(parseMoney('200')).toBe(20000)
    expect(parseMoney('2000')).toBe(200000)

    // separador recém-digitado, ainda sem casas decimais
    expect(parseMoney('2.')).toBe(200)
    expect(parseMoney('2,')).toBe(200)
    expect(parseMoney('2.0')).toBe(200)
    expect(parseMoney('2,0')).toBe(200)
    expect(parseMoney('2,5')).toBe(250)

    // digitando "1.234,56" tecla a tecla — nenhum prefixo pode virar null
    for (const prefix of ['1', '1.', '1.2', '1.23', '1.234', '1.234,', '1.234,5', '1.234,56']) {
      expect(parseMoney(prefix), `prefixo "${prefix}"`).not.toBeNull()
    }

    // digitando "1234.56" tecla a tecla
    for (const prefix of ['1', '12', '123', '1234', '1234.', '1234.5', '1234.56']) {
      expect(parseMoney(prefix), `prefixo "${prefix}"`).not.toBeNull()
    }
  })

  it('formata em pt-BR', () => {
    expect(formatBRL(123456).replace(/\u00a0/g, ' ')).toBe('R$ 1.234,56')
    expect(formatMoneyPlain(123456)).toBe('1.234,56')
    expect(formatBRL(-9900).replace(/\u00a0/g, ' ')).toBe('-R$ 99,00')
  })

  it('round-trip: parse(format(x)) === x', () => {
    for (const cents of [0, 1, 99, 100, 12345, 123456, 99999999]) {
      expect(parseMoney(formatMoneyPlain(cents))).toBe(cents)
    }
  })
})
