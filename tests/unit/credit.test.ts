import { describe, expect, it } from 'vitest'
import { createSeedData } from '@/data/seed'
import type { ZentData } from '@/data/schema'
import { creditHealthReading, installmentImpact } from '@/engine/credit'
import { availableLimit } from '@/engine/cards'
import { addInvoicePayment, removeInvoicePayment } from '@/store/mutations'

function base(): ZentData {
  const d = createSeedData()
  d.salaryHistory = [{ id: 's', startYm: '2026-07', amount: 300000 }] // R$ 3.000
  d.banks = [{ id: 'b1', name: 'Nubank', color: '#820AD1', openingBalance: 0 }]
  d.cards = [{ id: 'k1', bankId: 'b1', name: 'Click', limit: 200000, invoice: 80000 }] // limite 2000, fatura 800
  d.purchases = []
  d.categories = []
  d.expenses = []
  return d
}

describe('installmentImpact — prévia do parcelamento (§7)', () => {
  it('projeta parcela/mês, meses, limite após e salário disponível após', () => {
    const d = base()
    // Compra 1.200 em 6x → 200/mês
    const imp = installmentImpact(d, 'k1', 20000, 6, '2026-07-16')!
    expect(imp.perMonth).toBe(20000)
    expect(imp.installments).toBe(6)
    expect(imp.firstYm).toBe('2026-07')
    expect(imp.lastYm).toBe('2026-12')
    // limite disponível antes: 2000 − 800 = 1200; após 6×200 comprometidos: 1200 − 1200 = 0
    expect(availableLimit(d.cards[0]!, [])).toBe(120000)
    expect(imp.limitAfter).toBe(0)
    // salário disponível: 3000 − compromissos(fatura 800) − nova parcela 200
    expect(imp.salaryAvailableBefore).toBe(300000 - 80000)
    expect(imp.salaryAvailableAfter).toBe(300000 - 80000 - 20000)
  })

  it('a saúde financeira cai (ou fica igual) com mais compromisso', () => {
    const d = base()
    const imp = installmentImpact(d, 'k1', 30000, 10, '2026-07-16')!
    if (imp.healthBefore !== null && imp.healthAfter !== null) {
      expect(imp.healthAfter).toBeLessThanOrEqual(imp.healthBefore)
    }
  })

  it('cartão inexistente → null', () => {
    expect(installmentImpact(base(), 'nope', 10000, 3, '2026-07-16')).toBeNull()
  })
})

describe('pagar fatura devolve o limite ao cartão (§6)', () => {
  it('paga a fatura → disponível sobe; desfazer volta ao estado anterior', () => {
    const d = base()
    d.banks = [{ id: 'b1', name: 'Nubank', color: '#820AD1', openingBalance: 500000 }]
    const card = d.cards[0]! // limite 2000, fatura 800
    expect(availableLimit(card, d.purchases)).toBe(120000) // 2000 − 800

    // pagar R$ 800 da fatura pela conta
    addInvoicePayment(d, { id: 'pay1', date: '2026-07-20', cardId: 'k1', bankId: 'b1', amount: 80000 })
    expect(d.cards[0]!.invoice).toBe(0)
    expect(availableLimit(d.cards[0]!, d.purchases)).toBe(200000) // limite cheio de volta

    // desfazer devolve a fatura e o disponível ao estado anterior
    removeInvoicePayment(d, 'pay1')
    expect(d.cards[0]!.invoice).toBe(80000)
    expect(availableLimit(d.cards[0]!, d.purchases)).toBe(120000)
  })
})

describe('creditHealthReading — leitura do painel (§6)', () => {
  it('classifica por zona conforme faturas/renda', () => {
    expect(creditHealthReading(30000, 300000)).toMatch(/confortável/)
    expect(creditHealthReading(150000, 300000)).toMatch(/amarela/)
    expect(creditHealthReading(250000, 300000)).toMatch(/vermelha/)
    expect(creditHealthReading(10000, 0)).toMatch(/Sem renda/)
  })
})
