import { describe, expect, it } from 'vitest'
import type { Contribution, Investment, Rates, ValueUpdate } from '@/data/schema'
import { investmentSnapshot, manualSeries } from '@/engine/investments'
import { assetClass, ASSET_CLASS_LABELS } from '@/engine/rates'

const RATES: Rates = { selic: 14.25, cdi: 14.15, ipca: 4.64, updatedAt: '2026-07-16' }

function upd(date: string, value: number): ValueUpdate {
  return { id: `u-${date}`, date, value }
}

function contrib(date: string, amount: number): Contribution {
  return { id: `c-${date}`, investmentId: 'inv1', date, amount }
}

describe('classe de ativo derivada do tipo', () => {
  it('mapeia os tipos para as 4 classes da Carteira', () => {
    expect(assetClass('selic')).toBe('pos')
    expect(assetClass('cdi')).toBe('pos')
    expect(assetClass('ipca')).toBe('ipca')
    expect(assetClass('prefixado')).toBe('pre')
    expect(assetClass('manual')).toBe('outros')
    expect(ASSET_CLASS_LABELS.outros).toBe('Outros ativos')
  })
})

describe('série de ativo de valor manual (Outros ativos)', () => {
  it('carry-forward: saldo do mês é a última atualização até o fim do mês', () => {
    const series = manualSeries(
      [upd('2026-01-10', 100_000), upd('2026-04-20', 130_000)],
      [],
      '2026-07',
    )
    expect(series.months).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
    ])
    expect(series.balances).toEqual([100_000, 100_000, 100_000, 130_000, 130_000, 130_000, 130_000])
  })

  it('rend[m] = saldo[m] − saldo[m−1] − aportes[m]', () => {
    const series = manualSeries(
      [upd('2026-01-05', 100_000), upd('2026-03-15', 125_000)],
      [contrib('2026-03-02', 10_000)],
      '2026-03',
    )
    // mar: 125.000 − 100.000 − 10.000 = 15.000 de valorização real
    expect(series.yields[2]).toBe(15_000)
    expect(series.yieldRatios[2]).toBeCloseTo(15_000 / 100_000, 10)
  })

  it('antes da primeira atualização usa o acumulado de aportes', () => {
    const series = manualSeries(
      [upd('2026-03-10', 60_000)],
      [contrib('2026-01-05', 20_000), contrib('2026-02-05', 20_000)],
      '2026-03',
    )
    expect(series.balances).toEqual([20_000, 40_000, 60_000])
    // fev: 40.000 − 20.000 − 20.000 = 0 (sem valorização conhecida)
    expect(series.yields[1]).toBe(0)
  })

  it('a série termina no mês pedido e ignora atualizações futuras', () => {
    const series = manualSeries(
      [upd('2026-01-10', 50_000), upd('2026-09-01', 99_999)],
      [],
      '2026-07',
    )
    expect(series.months[series.months.length - 1]).toBe('2026-07')
    expect(series.balances[series.balances.length - 1]).toBe(50_000)
  })

  it('múltiplas atualizações no mesmo mês: vale a mais recente', () => {
    const series = manualSeries(
      [upd('2026-05-02', 10_000), upd('2026-05-28', 12_000)],
      [],
      '2026-05',
    )
    expect(series.balances).toEqual([12_000])
  })

  it('snapshot de ativo manual: sem taxa, saldo = última atualização', () => {
    const inv: Investment = {
      id: 'inv1',
      name: 'FII XPTO',
      bankId: 'b1',
      rateType: 'manual',
      rateParam: 0,
      valueUpdates: [upd('2026-06-01', 80_000), upd('2026-07-10', 85_000)],
    }
    const snap = investmentSnapshot(inv, [contrib('2026-06-01', 70_000)], RATES, '2026-07')
    expect(snap.hasRate).toBe(false)
    expect(snap.balance).toBe(85_000)
    expect(snap.invested).toBe(70_000)
    expect(snap.totalYield).toBe(15_000)
    expect(snap.yieldPerMonth).toBe(0)
    expect(snap.yieldPerYear).toBe(0)
  })

  it('perda de valor gera rendimento negativo (ex.: cripto caiu)', () => {
    const series = manualSeries(
      [upd('2026-05-01', 100_000), upd('2026-06-15', 80_000)],
      [],
      '2026-06',
    )
    expect(series.yields[1]).toBe(-20_000)
    expect(series.yieldRatios[1]).toBeCloseTo(-0.2, 10)
  })
})
