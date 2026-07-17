import { describe, expect, it } from 'vitest'
import { migrate } from '@/data/migrations'
import { zentDataSchema } from '@/data/schema'

/** Arquivo v1 realista (formato da primeira versão entregue). */
function v1Data(): Record<string, unknown> {
  return {
    version: 1,
    profile: { name: 'Allan' },
    rates: { selic: 14.25, cdi: 14.15, ipca: 4.64, updatedAt: '2026-07-16' },
    salaryHistory: [{ id: 's1', startYm: '2026-07', amount: 320000 }],
    extraIncomes: [{ id: 'x1', date: '2026-07-02', description: 'Freela', amount: 40000 }],
    categories: [{ id: 'c1', name: 'Mercado', color: '#2fd680', monthlyLimit: null }],
    expenses: [
      { id: 'e1', date: '2026-07-03', categoryId: 'c1', description: '', amount: 15000, essential: true },
    ],
    banks: [{ id: 'b1', name: 'Nubank', color: '#820AD1', balance: 0 }],
    cards: [{ id: 'k1', bankId: 'b1', name: 'Ultra', limit: 500000, invoice: 0 }],
    purchases: [
      {
        id: 'p1', cardId: 'k1', name: 'Notebook', installmentAmount: 10000,
        totalInstallments: 10, paidInstallments: 0, startYm: '2026-07',
      },
    ],
    investments: [{ id: 'i1', name: 'CDB', bankId: 'b1', rateType: 'cdi', rateParam: 102 }],
    contributions: [{ id: 'a1', investmentId: 'i1', date: '2026-07-05', amount: 100000 }],
    boxes: [
      {
        id: 'x1', emoji: '🛟', name: 'Reserva', target: 250000,
        investmentId: null, manualAmount: 0, celebrated: false,
      },
    ],
    meta: { createdAt: '2026-07-16', lastManualExport: null, categoriesOnboarded: true },
  }
}

describe('migração de dados v1 → v7', () => {
  it('migra um arquivo v1 completo em cadeia e passa na validação do schema atual', () => {
    const migrated = migrate(v1Data())
    const parsed = zentDataSchema.parse(migrated)
    expect(parsed.version).toBe(7)
    // v6→v7: o saldo digitado vira o PONTO DE PARTIDA do ledger e os arrays de
    // movimento nascem vazios — o saldo derivado é idêntico ao de antes
    expect(parsed.banks[0]?.openingBalance).toBe(0)
    expect('balance' in (parsed.banks[0] ?? {})).toBe(false)
    expect(parsed.salaryConfig).toEqual({ bankId: null, payDay: 5, autoCredit: true })
    expect(parsed.salaryCredits).toEqual([])
    expect(parsed.transfers).toEqual([])
    expect(parsed.adjustments).toEqual([])
    expect(parsed.invoicePayments).toEqual([])
    expect(parsed.extraIncomes[0]?.receivedIn).toBeNull()
    expect(parsed.meta.lastSalaryCreditYm).toBeNull()
    // taxas do arquivo antigo vieram da mão do usuário, nunca do automático
    expect(parsed.rates.autoUpdate).toBe(true)
    expect(parsed.rates.lastAutoAt).toBeNull()
    expect(parsed.rates.overrides).toEqual({ selic: false, cdi: false, ipca: false })
    expect(parsed.rates.selic).toBe(14.25)
    // v5→v6: gastos antigos ficam sem origem
    expect(parsed.expenses[0]?.origin).toBeNull()
    // v1→v2
    expect(parsed.investments[0]?.valueUpdates).toEqual([])
    expect(parsed.recurringExpenses).toEqual([])
    expect(parsed.recurringIncomes).toEqual([])
    expect(parsed.meta.lastRecurringYm).toBeNull()
    // v2→v3: emoji 🛟 vira chave de ícone SVG
    expect(parsed.boxes[0]?.icon).toBe('lifebuoy')
    expect('emoji' in (parsed.boxes[0] ?? {})).toBe(false)
    // v3→v4: a compra existente continua VINCULADA ao cartão, só ganha creditor null
    expect(parsed.purchases[0]?.cardId).toBe('k1')
    expect(parsed.purchases[0]?.creditor).toBeNull()
    // dados v1 preservados intactos
    expect(parsed.expenses[0]?.amount).toBe(15000)
    expect(parsed.purchases[0]?.totalInstallments).toBe(10)
  })

  it('v3→v4 não transforma compra de cartão em avulsa (o vínculo é preservado)', () => {
    const parsed = zentDataSchema.parse(migrate(v1Data()))
    // nenhuma parcela migrada pode nascer avulsa
    expect(parsed.purchases.every((p) => p.cardId !== null)).toBe(true)
  })

  it('emoji desconhecido nas caixinhas vira o ícone padrão "target"', () => {
    const raw = v1Data()
    ;(raw['boxes'] as Record<string, unknown>[])[0]!['emoji'] = '🦖'
    const parsed = zentDataSchema.parse(migrate(raw))
    expect(parsed.boxes[0]?.icon).toBe('target')
  })

  it('arquivo já na versão atual passa direto sem alterações', () => {
    const v3 = zentDataSchema.parse(migrate(v1Data()))
    const again = zentDataSchema.parse(migrate(v3))
    expect(again).toEqual(v3)
  })

  /** R3 §3.1 — o BTG único vira BTG Banking (mesmo id) e ganha o irmão Investimentos. */
  describe('v4 → v5: BTG duplo', () => {
    /** Arquivo com um BTG só, com cartão, ativo e parcela pendurados nele. */
    function comBtgUnico(): Record<string, unknown> {
      const raw = v1Data()
      raw['banks'] = [
        { id: 'b1', name: 'Nubank', color: '#820AD1', balance: 0 },
        { id: 'btg1', name: 'BTG', color: '#2C5EA9', balance: 250000 },
      ]
      raw['cards'] = [{ id: 'k1', bankId: 'btg1', name: 'BTG Black', limit: 500000, invoice: 12000 }]
      raw['investments'] = [{ id: 'i1', name: 'CDB BTG', bankId: 'btg1', rateType: 'cdi', rateParam: 102 }]
      raw['purchases'] = [
        {
          id: 'p1', cardId: 'k1', name: 'Notebook', installmentAmount: 10000,
          totalInstallments: 10, paidInstallments: 0, startYm: '2026-07',
        },
      ]
      return raw
    }

    it('renomeia o BTG existente para "BTG Banking" preservando id, saldo e vínculos', () => {
      const parsed = zentDataSchema.parse(migrate(comBtgUnico()))
      const banking = parsed.banks.find((b) => b.name === 'BTG Banking')
      expect(banking).toBeDefined()
      // MESMO id: nada que apontava para o BTG se perde
      expect(banking?.id).toBe('btg1')
      expect(banking?.openingBalance).toBe(250000)
      expect(parsed.cards[0]?.bankId).toBe('btg1')
      expect(parsed.investments[0]?.bankId).toBe('btg1')
      // e a parcela do cartão do BTG segue vinculada
      expect(parsed.purchases[0]?.cardId).toBe('k1')
    })

    it('cria "BTG Investimentos" ao lado, vazio e com id próprio', () => {
      const parsed = zentDataSchema.parse(migrate(comBtgUnico()))
      const inv = parsed.banks.find((b) => b.name === 'BTG Investimentos')
      expect(inv).toBeDefined()
      expect(inv?.openingBalance).toBe(0)
      expect(inv?.id).not.toBe('btg1')
      // não sobrou nenhum banco chamado só "BTG"
      expect(parsed.banks.some((b) => b.name === 'BTG')).toBe(false)
      expect(parsed.banks).toHaveLength(3)
    })

    it('os dois BTG recebem acentos distintos (a cor é UI; o logo é que os diferencia)', () => {
      const parsed = zentDataSchema.parse(migrate(comBtgUnico()))
      const banking = parsed.banks.find((b) => b.name === 'BTG Banking')
      const inv = parsed.banks.find((b) => b.name === 'BTG Investimentos')
      expect(banking?.color).toBe('#2C5EA9')
      expect(inv?.color).toBe('#0A2540')
      // navy nos dois apagaria o acento do Banking no tema escuro
      expect(banking?.color).not.toBe(inv?.color)
    })

    it('quem JÁ tem os dois BTG (seed da R2) não ganha duplicata', () => {
      const raw = v1Data()
      raw['banks'] = [
        { id: 'x1', name: 'BTG Banking', color: '#2C5EA9', balance: 100 },
        { id: 'x2', name: 'BTG Investimentos', color: '#0A2540', balance: 200 },
      ]
      raw['cards'] = []
      raw['purchases'] = []
      raw['investments'] = []
      const parsed = zentDataSchema.parse(migrate(raw))
      expect(parsed.banks.filter((b) => b.name.startsWith('BTG'))).toHaveLength(2)
      expect(parsed.banks.find((b) => b.id === 'x1')?.openingBalance).toBe(100)
    })

    it('sem BTG nenhum, a migração não inventa bancos', () => {
      const raw = v1Data() // só tem Nubank
      const parsed = zentDataSchema.parse(migrate(raw))
      expect(parsed.banks.some((b) => b.name.startsWith('BTG'))).toBe(false)
      expect(parsed.banks).toHaveLength(1)
    })
  })

  it('rejeita arquivo de versão futura', () => {
    expect(() => migrate({ version: 99 })).toThrow(/mais novo/)
  })

  it('rejeita arquivo sem versão', () => {
    expect(() => migrate({})).toThrow(/version/)
  })
})
