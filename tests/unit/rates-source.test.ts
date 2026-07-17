import { describe, expect, it, vi } from 'vitest'
import {
  BRASILAPI_URL,
  fetchRates,
  parseBrasilApiRates,
  parseRateNumber,
  parseSgsSeries,
  SGS_SERIES,
  sgsUrl,
  type FetchLike,
} from '@/engine/rates-source'

/**
 * Taxas ao vivo (R4 §2). **A rede é mockada em 100% dos testes** — a suíte
 * jamais bate na internet: um teste que depende do BC estar de pé não é teste,
 * é aposta.
 */

/** Resposta real da BrasilAPI (formato documentado). */
const BRASILAPI_FIXTURE = [
  { nome: 'Selic', valor: 14.25 },
  { nome: 'CDI', valor: 14.15 },
  { nome: 'IPCA', valor: 4.64 },
]

/** Respostas reais do SGS: uma série por requisição, valor em STRING. */
const SGS_SELIC_FIXTURE = [{ data: '16/07/2026', valor: '14.25' }]
const SGS_CDI_FIXTURE = [{ data: '16/07/2026', valor: '14.15' }]
const SGS_IPCA_FIXTURE = [{ data: '30/06/2026', valor: '4.64' }]

function mockFetch(routes: Record<string, unknown>, failing: string[] = []): FetchLike {
  return vi.fn(async (url: string) => {
    if (failing.some((f) => url.includes(f))) throw new Error('ECONNREFUSED')
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (key === undefined) return { ok: false, status: 404, json: async () => null }
    return { ok: true, status: 200, json: async () => routes[key] }
  }) as unknown as FetchLike
}

describe('parseRateNumber — tolerante ao formato de cada fonte', () => {
  it('aceita number (BrasilAPI) e string com ponto ou vírgula (SGS)', () => {
    expect(parseRateNumber(14.25)).toBe(14.25)
    expect(parseRateNumber('14.25')).toBe(14.25)
    expect(parseRateNumber('14,25')).toBe(14.25)
    expect(parseRateNumber(' 14,25 ')).toBe(14.25)
    expect(parseRateNumber(0)).toBe(0)
    expect(parseRateNumber(-0.5)).toBe(-0.5)
  })

  it('recusa lixo em vez de deixar NaN entrar nos rendimentos', () => {
    expect(parseRateNumber('abc')).toBeNull()
    expect(parseRateNumber('')).toBeNull()
    expect(parseRateNumber(null)).toBeNull()
    expect(parseRateNumber(undefined)).toBeNull()
    expect(parseRateNumber({})).toBeNull()
    expect(parseRateNumber(NaN)).toBeNull()
    expect(parseRateNumber(Infinity)).toBeNull()
  })
})

describe('parser da BrasilAPI', () => {
  it('lê a fixture do formato documentado', () => {
    expect(parseBrasilApiRates(BRASILAPI_FIXTURE)).toEqual({ selic: 14.25, cdi: 14.15, ipca: 4.64 })
  })

  it('não se importa com caixa, espaços ou ordem dos nomes', () => {
    expect(
      parseBrasilApiRates([
        { nome: ' ipca ', valor: 4.64 },
        { nome: 'SELIC', valor: 14.25 },
        { nome: 'Cdi', valor: 14.15 },
      ]),
    ).toEqual({ selic: 14.25, cdi: 14.15, ipca: 4.64 })
  })

  it('ignora taxas extras que a API venha a incluir', () => {
    expect(parseBrasilApiRates([...BRASILAPI_FIXTURE, { nome: 'TR', valor: 0.1 }])).toEqual({
      selic: 14.25,
      cdi: 14.15,
      ipca: 4.64,
    })
  })

  it('faltando qualquer uma das três → null (o chamador cai no fallback)', () => {
    expect(parseBrasilApiRates([{ nome: 'Selic', valor: 14.25 }])).toBeNull()
    expect(parseBrasilApiRates([])).toBeNull()
    expect(parseBrasilApiRates(null)).toBeNull()
    expect(parseBrasilApiRates({ selic: 14.25 })).toBeNull()
    expect(parseBrasilApiRates([{ nome: 'Selic', valor: 'x' }, ...BRASILAPI_FIXTURE.slice(1)])).toBeNull()
  })
})

describe('parser do SGS', () => {
  it('lê o valor em string da fixture', () => {
    expect(parseSgsSeries(SGS_SELIC_FIXTURE)).toBe(14.25)
    expect(parseSgsSeries([{ data: '16/07/2026', valor: '14,25' }])).toBe(14.25)
  })

  it('pega o ÚLTIMO ponto quando vem mais de um', () => {
    expect(
      parseSgsSeries([
        { data: '15/06/2026', valor: '13.75' },
        { data: '16/07/2026', valor: '14.25' },
      ]),
    ).toBe(14.25)
  })

  it('série vazia ou malformada → null', () => {
    expect(parseSgsSeries([])).toBeNull()
    expect(parseSgsSeries(null)).toBeNull()
    expect(parseSgsSeries([{ data: '16/07/2026' }])).toBeNull()
    expect(parseSgsSeries('nada')).toBeNull()
  })

  it('as URLs do SGS levam as séries da spec e o filtro de período exigido', () => {
    expect(SGS_SERIES).toEqual({ selic: 432, cdi: 4389, ipca: 13522 })
    expect(sgsUrl(432)).toContain('bcdata.sgs.432/dados/ultimos/1?formato=json')
  })
})

describe('fetchRates — primária, fallback e falha total', () => {
  it('usa a BrasilAPI quando ela responde', async () => {
    const f = mockFetch({ 'brasilapi.com.br': BRASILAPI_FIXTURE })
    await expect(fetchRates(f)).resolves.toEqual({ selic: 14.25, cdi: 14.15, ipca: 4.64, source: 'brasilapi' })
    expect(f).toHaveBeenCalledWith(BRASILAPI_URL, expect.anything())
    // não bateu no BC à toa
    expect(vi.mocked(f).mock.calls.every(([url]) => url.includes('brasilapi'))).toBe(true)
  })

  it('cai no SGS quando a BrasilAPI está fora do ar', async () => {
    const f = mockFetch(
      {
        'sgs.432': SGS_SELIC_FIXTURE,
        'sgs.4389': SGS_CDI_FIXTURE,
        'sgs.13522': SGS_IPCA_FIXTURE,
      },
      ['brasilapi'],
    )
    await expect(fetchRates(f)).resolves.toEqual({ selic: 14.25, cdi: 14.15, ipca: 4.64, source: 'sgs' })
  })

  it('cai no SGS quando a BrasilAPI responde incompleta', async () => {
    const f = mockFetch({
      'brasilapi.com.br': [{ nome: 'Selic', valor: 14.25 }],
      'sgs.432': SGS_SELIC_FIXTURE,
      'sgs.4389': SGS_CDI_FIXTURE,
      'sgs.13522': SGS_IPCA_FIXTURE,
    })
    await expect(fetchRates(f)).resolves.toMatchObject({ source: 'sgs' })
  })

  it('cai no SGS quando a BrasilAPI devolve HTTP 500', async () => {
    const f = vi.fn(async (url: string) => {
      if (url.includes('brasilapi')) return { ok: false, status: 500, json: async () => null }
      if (url.includes('sgs.432')) return { ok: true, status: 200, json: async () => SGS_SELIC_FIXTURE }
      if (url.includes('sgs.4389')) return { ok: true, status: 200, json: async () => SGS_CDI_FIXTURE }
      return { ok: true, status: 200, json: async () => SGS_IPCA_FIXTURE }
    }) as unknown as FetchLike
    await expect(fetchRates(f)).resolves.toMatchObject({ source: 'sgs' })
  })

  it('as duas fontes fora → lança (o app mantém as taxas antigas em silêncio)', async () => {
    const f = mockFetch({}, ['brasilapi', 'bcb.gov.br'])
    await expect(fetchRates(f)).rejects.toThrow()
  })

  it('uma série do SGS faltando derruba a busca inteira — nunca mistura taxa nova com velha', async () => {
    const f = mockFetch(
      {
        'sgs.432': SGS_SELIC_FIXTURE,
        'sgs.4389': SGS_CDI_FIXTURE,
        'sgs.13522': [], // IPCA sem dado
      },
      ['brasilapi'],
    )
    await expect(fetchRates(f)).rejects.toThrow(/formato inesperado/)
  })

  it('passa um AbortSignal — fonte lenta não segura o app', async () => {
    const f = mockFetch({ 'brasilapi.com.br': BRASILAPI_FIXTURE })
    await fetchRates(f)
    const init = vi.mocked(f).mock.calls[0]?.[1]
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })
})
