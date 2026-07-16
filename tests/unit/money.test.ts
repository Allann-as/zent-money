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
