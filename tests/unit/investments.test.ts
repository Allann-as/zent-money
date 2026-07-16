import { describe, expect, it } from 'vitest'
import type { Contribution, Investment, Rates } from '@/data/schema'
import { annualRate, monthlyRate } from '@/engine/rates'
import { buildSeries, combineSeries, investmentSeries, investmentSnapshot } from '@/engine/investments'
import { diffMonths } from '@/engine/dates'

const RATES: Rates = { selic: 14.25, cdi: 14.15, ipca: 4.64, updatedAt: '2026-07-16' }

function contrib(date: string, amount: number, investmentId = 'inv1'): Contribution {
  return { id: `c-${date}-${amount}`, investmentId, date, amount }
}

describe('taxas', () => {
  it('mapeia cada tipo de rendimento para a taxa anual correta', () => {
    expect(annualRate('selic', 0, RATES)).toBe(14.25)
    expect(annualRate('cdi', 102, RATES)).toBeCloseTo(1.02 * 14.15, 10)
    expect(annualRate('ipca', 5.5, RATES)).toBeCloseTo(4.64 + 5.5, 10)
    expect(annualRate('prefixado', 12, RATES)).toBe(12)
  })

  it('taxa mensal segue im = (1 + a/100)^(1/12) − 1', () => {
    const im = monthlyRate(14.25)
    expect(im).toBeCloseTo(Math.pow(1.1425, 1 / 12) - 1, 15)
    // composta 12x reconstrói a taxa anual
    expect(Math.pow(1 + im, 12) - 1).toBeCloseTo(0.1425, 10)
  })
})

describe('série incremental de investimentos', () => {
  const im = monthlyRate(12) // 12% a.a. para contas redondas

  it('juros compostos conferem AO CENTAVO com a fórmula direta (1 aporte)', () => {
    const aporte = 1_000_00 // R$ 1.000,00
    const series = buildSeries([contrib('2025-01-10', aporte)], im, '2026-07')
    const n = diffMonths('2025-01', '2026-07') // meses de composição
    const direto = Math.round(aporte * Math.pow(1 + im, n))
    expect(series.balances[series.balances.length - 1]).toBe(direto)
  })

  it('juros compostos conferem ao centavo com a fórmula direta (vários aportes)', () => {
    const aportes = [
      contrib('2025-01-05', 1_000_00),
      contrib('2025-03-20', 500_00),
      contrib('2025-03-25', 250_00), // dois no mesmo mês
      contrib('2026-01-01', 2_000_00),
    ]
    const series = buildSeries(aportes, im, '2026-07')
    const direto = Math.round(
      1_000_00 * Math.pow(1 + im, diffMonths('2025-01', '2026-07')) +
        (500_00 + 250_00) * Math.pow(1 + im, diffMonths('2025-03', '2026-07')) +
        2_000_00 * Math.pow(1 + im, diffMonths('2026-01', '2026-07')),
    )
    expect(series.balances[series.balances.length - 1]).toBe(direto)
  })

  it('rendimento mensal ≡ saldo anterior × taxa', () => {
    const series = buildSeries(
      [contrib('2025-06-01', 10_000_00), contrib('2025-09-15', 3_000_00)],
      im,
      '2026-07',
    )
    for (let m = 1; m < series.months.length; m++) {
      const saldoAnterior = series.balances[m - 1] ?? 0
      const esperado = saldoAnterior * im
      // tolerância de 1 centavo por arredondamento do saldo exibido
      expect(Math.abs((series.yields[m] ?? 0) - esperado)).toBeLessThanOrEqual(1)
      // e a identidade da spec: rend[m] = saldo[m] − saldo[m−1] − aportes[m]
      const identidade =
        (series.balances[m] ?? 0) - (series.balances[m - 1] ?? 0) - (series.contributions[m] ?? 0)
      expect(Math.abs((series.yields[m] ?? 0) - identidade)).toBeLessThanOrEqual(1)
    }
  })

  it('rentabilidade % do mês = rend[m] / saldo[m−1]', () => {
    const series = buildSeries([contrib('2026-01-10', 5_000_00)], im, '2026-07')
    for (let m = 1; m < series.months.length; m++) {
      expect(series.yieldRatios[m]).toBeCloseTo(im, 6)
    }
  })

  it('a série SEMPRE termina no mês pedido (nunca projeta futuro)', () => {
    const series = buildSeries([contrib('2026-01-10', 1_000_00)], im, '2026-07')
    expect(series.months[series.months.length - 1]).toBe('2026-07')
    expect(series.months[0]).toBe('2026-01')
    expect(series.months).toHaveLength(7)
  })

  it('aporte do próprio mês não rende no mês (compõe a partir do seguinte)', () => {
    const series = buildSeries([contrib('2026-07-16', 1_000_00)], im, '2026-07')
    expect(series.balances).toEqual([1_000_00])
    expect(series.yields).toEqual([0])
  })

  it('aportes futuros ao fim da série são ignorados', () => {
    const series = buildSeries(
      [contrib('2026-01-10', 1_000_00), contrib('2026-09-01', 9_999_99)],
      im,
      '2026-07',
    )
    expect(series.months[series.months.length - 1]).toBe('2026-07')
    const somaContribs = series.contributions.reduce((a, b) => a + b, 0)
    expect(somaContribs).toBe(1_000_00)
  })

  it('snapshot consolida saldo, aportado e rendimento', () => {
    const inv: Investment = {
      id: 'inv1',
      name: 'CDB',
      bankId: 'b1',
      rateType: 'prefixado',
      rateParam: 12,
      valueUpdates: [],
    }
    const contribs = [contrib('2025-07-01', 10_000_00)]
    const snap = investmentSnapshot(inv, contribs, RATES, '2026-07')
    const esperado = Math.round(10_000_00 * Math.pow(1 + im, 12))
    expect(snap.balance).toBe(esperado)
    expect(snap.invested).toBe(10_000_00)
    expect(snap.totalYield).toBe(esperado - 10_000_00)
    expect(snap.annualPercent).toBe(12)
    expect(snap.yieldPerMonth).toBe(Math.round(esperado * im))
  })

  it('série filtra apenas aportes da própria aplicação', () => {
    const inv: Investment = {
      id: 'inv1',
      name: 'Tesouro',
      bankId: 'b1',
      rateType: 'selic',
      rateParam: 0,
      valueUpdates: [],
    }
    const contribs = [contrib('2026-06-01', 1_000_00, 'inv1'), contrib('2026-06-01', 9_000_00, 'outra')]
    const series = investmentSeries(inv, contribs, RATES, '2026-07')
    expect(series.contributions.reduce((a, b) => a + b, 0)).toBe(1_000_00)
  })

  it('combina séries de várias aplicações alinhando meses', () => {
    const a = buildSeries([contrib('2026-05-01', 1_000_00)], 0, '2026-07')
    const b = buildSeries([contrib('2026-07-01', 500_00)], 0, '2026-07')
    const combined = combineSeries([a, b], '2026-07', 4)
    expect(combined.months).toEqual(['2026-04', '2026-05', '2026-06', '2026-07'])
    expect(combined.balances).toEqual([0, 1_000_00, 1_000_00, 1_500_00])
  })
})
