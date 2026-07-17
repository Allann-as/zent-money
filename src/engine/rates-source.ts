/**
 * Taxas oficiais ao vivo (R4 §2) — parsing e busca, sem nada de Electron aqui
 * para que os testes rodem contra `fetch` injetado e a rede JAMAIS seja tocada
 * na suíte.
 *
 * **Esta é a única conexão de rede do app**: dois GET públicos, sem chave, sem
 * cabeçalho identificando ninguém, sem um byte do usuário saindo da máquina.
 *
 * Fonte primária: BrasilAPI (`/api/taxas/v1`) — um JSON só com as três taxas.
 * Fallback: SGS do Banco Central, uma série por requisição.
 */

export interface FetchedRates {
  /** % a.a. */
  selic: number
  /** % a.a. */
  cdi: number
  /** % acumulado 12m. */
  ipca: number
  /** De onde vieram — vai para o log/diagnóstico, não para a UI. */
  source: 'brasilapi' | 'sgs'
}

/** Séries do SGS (§2 da spec). */
export const SGS_SERIES = {
  /** Meta Selic definida pelo Copom, % a.a. */
  selic: 432,
  /** CDI anualizado, % a.a. (a série 12 é diária — esta já vem anualizada). */
  cdi: 4389,
  /** IPCA acumulado em 12 meses, %. */
  ipca: 13522,
} as const

const TIMEOUT_MS = 5000

/**
 * Número tolerante a variação de formato: a BrasilAPI devolve `number`, o SGS
 * devolve string com vírgula decimal ("14,25"). Qualquer outra coisa → null,
 * que o chamador trata como "esta fonte não serviu" em vez de virar NaN dentro
 * dos rendimentos do usuário.
 */
export function parseRateNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  // `Number('')` é 0: sem esta guarda, um campo vazio viraria uma taxa de 0%
  // e zeraria os rendimentos do usuário em silêncio.
  if (trimmed === '') return null
  const n = Number(trimmed.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Parser da BrasilAPI. O formato documentado é
 * `[{ nome: "Selic", valor: 14.25 }, { nome: "CDI", valor: 14.15 }, { nome: "IPCA", valor: 4.64 }]`.
 * Casamos o nome sem acento e sem caixa: se um dia virar "SELIC" ou "Ipca", o
 * parser continua de pé. Faltando qualquer uma das três → null (fallback).
 */
export function parseBrasilApiRates(raw: unknown): Omit<FetchedRates, 'source'> | null {
  if (!Array.isArray(raw)) return null
  const byName = new Map<string, number>()
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    const name = typeof rec['nome'] === 'string' ? rec['nome'] : null
    const value = parseRateNumber(rec['valor'])
    if (name === null || value === null) continue
    byName.set(name.trim().toLowerCase(), value)
  }
  const selic = byName.get('selic')
  const cdi = byName.get('cdi')
  const ipca = byName.get('ipca')
  if (selic === undefined || cdi === undefined || ipca === undefined) return null
  return { selic, cdi, ipca }
}

/**
 * Parser de uma série do SGS: `[{ data: "16/07/2026", valor: "14.25" }]`.
 * Pega o ÚLTIMO ponto (a resposta de `ultimos/N` vem em ordem cronológica).
 */
export function parseSgsSeries(raw: unknown): number | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const last = raw[raw.length - 1]
  if (typeof last !== 'object' || last === null) return null
  return parseRateNumber((last as Record<string, unknown>)['valor'])
}

/** `fetch` mínimo de que este módulo precisa — injetado para os testes. */
export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

/** GET com timeout: uma fonte lenta não pode segurar o boot do app. */
async function getJson(fetchFn: FetchLike, url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetchFn(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export const BRASILAPI_URL = 'https://brasilapi.com.br/api/taxas/v1'

export function sgsUrl(serie: number): string {
  // `ultimos/1` satisfaz a exigência de filtro que o SGS passou a impor.
  return `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`
}

/**
 * Busca as taxas: BrasilAPI e, se ela falhar ou vier incompleta, SGS/BCB.
 * As três séries do SGS vão em paralelo — se qualquer uma falhar, a busca
 * inteira falha: publicar duas taxas novas e uma velha como se fossem do mesmo
 * momento seria pior do que manter as três antigas com data honesta.
 *
 * Lança em caso de falha total; o chamador trata como silêncio (mantém o cache).
 */
export async function fetchRates(fetchFn: FetchLike): Promise<FetchedRates> {
  try {
    const parsed = parseBrasilApiRates(await getJson(fetchFn, BRASILAPI_URL))
    if (parsed !== null) return { ...parsed, source: 'brasilapi' }
  } catch {
    // fonte primária fora do ar — cai no oficial
  }

  const [selicRaw, cdiRaw, ipcaRaw] = await Promise.all([
    getJson(fetchFn, sgsUrl(SGS_SERIES.selic)),
    getJson(fetchFn, sgsUrl(SGS_SERIES.cdi)),
    getJson(fetchFn, sgsUrl(SGS_SERIES.ipca)),
  ])
  const selic = parseSgsSeries(selicRaw)
  const cdi = parseSgsSeries(cdiRaw)
  const ipca = parseSgsSeries(ipcaRaw)
  if (selic === null || cdi === null || ipca === null) {
    throw new Error('SGS respondeu num formato inesperado')
  }
  return { selic, cdi, ipca, source: 'sgs' }
}
