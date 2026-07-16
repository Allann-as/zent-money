import type { RateType, Rates } from '@/data/schema'

/**
 * Conversão de taxas — fórmulas travadas pela especificação (§7):
 *   im = (1 + taxa_anual/100)^(1/12) − 1
 *   %CDI → (param/100) × CDI · Selic → Selic · IPCA+ → IPCA + param · prefixado → param
 */

/** Taxa anual (% a.a.) de uma aplicação conforme seu tipo de rendimento. */
export function annualRate(rateType: RateType, rateParam: number, rates: Rates): number {
  switch (rateType) {
    case 'selic':
      return rates.selic
    case 'cdi':
      return (rateParam / 100) * rates.cdi
    case 'ipca':
      return rates.ipca + rateParam
    case 'prefixado':
      return rateParam
    case 'manual':
      return 0 // valor de mercado vem de valueUpdates, sem taxa automática
  }
}

/** Classes de ativo da Carteira (§5.6) — derivadas do tipo de rendimento. */
export type AssetClass = 'pos' | 'ipca' | 'pre' | 'outros'

export function assetClass(rateType: RateType): AssetClass {
  switch (rateType) {
    case 'selic':
    case 'cdi':
      return 'pos'
    case 'ipca':
      return 'ipca'
    case 'prefixado':
      return 'pre'
    case 'manual':
      return 'outros'
  }
}

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  pos: 'Renda fixa pós',
  ipca: 'Renda fixa IPCA+',
  pre: 'Prefixado',
  outros: 'Outros ativos',
}

/** Taxa mensal equivalente (fração, ex.: 0.0111 = 1,11% a.m.). */
export function monthlyRate(annualPercent: number): number {
  return Math.pow(1 + annualPercent / 100, 1 / 12) - 1
}

/** Descrição curta da taxa para a UI (ex.: "102% do CDI"). */
export function rateLabel(rateType: RateType, rateParam: number): string {
  const fmt = (n: number): string => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  switch (rateType) {
    case 'selic':
      return 'Selic cheia'
    case 'cdi':
      return `${fmt(rateParam)}% do CDI`
    case 'ipca':
      return `IPCA + ${fmt(rateParam)}%`
    case 'prefixado':
      return `Prefixado ${fmt(rateParam)}% a.a.`
    case 'manual':
      return 'Valor de mercado manual'
  }
}
