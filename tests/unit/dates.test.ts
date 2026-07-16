import { describe, expect, it } from 'vitest'
import {
  addMonths,
  diffMonths,
  diffDays,
  formatDateBR,
  formatTodayLong,
  formatYmLong,
  formatYmShort,
  indexToYm,
  lastMonths,
  todayIso,
  ymOfDate,
  ymToIndex,
} from '@/engine/dates'

describe('motor de datas', () => {
  it('vira o ano corretamente (dez → jan)', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2027-01', -1)).toBe('2026-12')
  })

  it('vira o século corretamente (2099-12 → 2100-01)', () => {
    expect(addMonths('2099-12', 1)).toBe('2100-01')
    expect(addMonths('2100-01', -1)).toBe('2099-12')
  })

  it('avança mês a mês de 2026 até 2100 sem erro', () => {
    let ym = '2026-01'
    let count = 0
    while (ym !== '2100-01') {
      const next = addMonths(ym, 1)
      expect(diffMonths(ym, next)).toBe(1)
      const month = Number(next.slice(5, 7))
      expect(month).toBeGreaterThanOrEqual(1)
      expect(month).toBeLessThanOrEqual(12)
      ym = next
      count++
      if (count > 12 * 80) throw new Error('loop não convergiu')
    }
    expect(count).toBe(12 * 74) // 2026-01 → 2100-01 = 74 anos
  })

  it('índice de mês é inversível em todo o intervalo', () => {
    for (const ym of ['2026-01', '2050-06', '2099-12', '2100-01', '2100-12']) {
      expect(indexToYm(ymToIndex(ym))).toBe(ym)
    }
  })

  it('diffMonths cruza anos', () => {
    expect(diffMonths('2026-11', '2027-02')).toBe(3)
    expect(diffMonths('2027-02', '2026-11')).toBe(-3)
  })

  it('janela móvel de 12 meses termina no mês pedido', () => {
    const win = lastMonths('2026-07', 12)
    expect(win).toHaveLength(12)
    expect(win[0]).toBe('2025-08')
    expect(win[11]).toBe('2026-07')
  })

  it('janela de 12 meses cruza a virada de século', () => {
    const win = lastMonths('2100-03', 12)
    expect(win[0]).toBe('2099-04')
    expect(win[11]).toBe('2100-03')
  })

  it('formata datas em pt-BR', () => {
    expect(formatYmLong('2026-07')).toBe('julho de 2026')
    expect(formatYmShort('2027-05')).toBe('mai/2027')
    expect(formatDateBR('2026-07-16')).toBe('16/07/2026')
    expect(ymOfDate('2026-07-16')).toBe('2026-07')
  })

  it('data de hoje por extenso em pt-BR', () => {
    // 16/07/2026 é uma quinta-feira
    const d = new Date(2026, 6, 16)
    expect(formatTodayLong(d)).toBe('quinta-feira, 16 de julho de 2026')
    expect(todayIso(d)).toBe('2026-07-16')
  })

  it('diffDays entre datas ISO', () => {
    expect(diffDays('2026-07-01', '2026-07-16')).toBe(15)
    expect(diffDays('2026-12-20', '2027-01-05')).toBe(16)
    expect(diffDays('2026-07-16', '2026-07-01')).toBe(-15)
  })
})
