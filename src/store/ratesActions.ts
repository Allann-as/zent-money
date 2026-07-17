import { useDataStore } from './dataStore'
import { todayIso } from '@/engine/dates'
import type { FetchedRatesDTO } from '../../electron/ipc-api'

/**
 * Atualização automática das taxas (R4 §2) no lado do renderer: decide o que
 * fazer com o que o main trouxe da rede. A busca em si mora no main
 * (`electron/main.ts` → `engine/rates-source.ts`), fora do alcance do CORS.
 */

export type RefreshOutcome = 'updated' | 'unchanged' | 'offline' | 'disabled'

/**
 * Aplica as taxas buscadas, **respeitando os overrides**: uma taxa que o
 * usuário editou à mão não é tocada até ele clicar em "voltar ao automático".
 * O automático sobrescrevê-la calado seria perder o trabalho dele sem aviso.
 *
 * `updatedAt` só avança quando alguma taxa de fato mudou de valor — é a data
 * que a UI mostra como "atualizadas em", e ela deve descrever os NÚMEROS, não a
 * última vez que o app teve internet (isso é o `lastAutoAt`).
 */
export function applyFetchedRates(fetched: FetchedRatesDTO, nowIso: string): RefreshOutcome {
  const data = useDataStore.getState().data
  if (!data) return 'offline'
  const { overrides } = data.rates
  const changed =
    (!overrides.selic && fetched.selic !== data.rates.selic) ||
    (!overrides.cdi && fetched.cdi !== data.rates.cdi) ||
    (!overrides.ipca && fetched.ipca !== data.rates.ipca)

  useDataStore.getState().mutate((d) => {
    if (!d.rates.overrides.selic) d.rates.selic = fetched.selic
    if (!d.rates.overrides.cdi) d.rates.cdi = fetched.cdi
    if (!d.rates.overrides.ipca) d.rates.ipca = fetched.ipca
    d.rates.lastAutoAt = nowIso
    if (changed) d.rates.updatedAt = todayIso()
  })
  return changed ? 'updated' : 'unchanged'
}

/**
 * Busca e aplica as taxas. `force` é o botão "Atualizar agora": ele funciona
 * mesmo com o toggle desligado, porque foi o usuário quem pediu — o toggle
 * governa o automático, não o direito de consultar.
 *
 * Falha (sem rede, API fora, formato estranho) → `'offline'` em silêncio: os
 * últimos valores continuam valendo e a UI mostra a data deles. Um toast de
 * erro a cada boot sem wi-fi seria ruído, não informação.
 */
export async function refreshRates(force = false): Promise<RefreshOutcome> {
  const data = useDataStore.getState().data
  if (!data) return 'offline'
  if (!force && !data.rates.autoUpdate) return 'disabled'
  const fetched = await window.zent.fetchRates()
  if (fetched === null) return 'offline'
  return applyFetchedRates(fetched, new Date().toISOString())
}

/** Liga/desliga o automático (§2). Desligar não apaga nada — só para de buscar. */
export function setRatesAutoUpdate(on: boolean): void {
  useDataStore.getState().mutate((d) => {
    d.rates.autoUpdate = on
  })
}

/** Devolve uma taxa ao automático: o próximo fetch volta a mandar nela. */
export function clearRateOverride(key: 'selic' | 'cdi' | 'ipca'): void {
  useDataStore.getState().mutate((d) => {
    d.rates.overrides[key] = false
  })
}
