import { describe, expect, it } from 'vitest'
import type { Card, Purchase } from '@/data/schema'
import {
  availableLimit,
  committedAmount,
  monthlyCommitment,
  payoffYm,
  remainingAmount,
  remainingInstallments,
} from '@/engine/cards'

const card: Card = { id: 'card1', bankId: 'b1', name: 'Ultravioleta', limit: 5_000_00, invoice: 0 }

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'p1',
    cardId: 'card1',
    name: 'Notebook',
    installmentAmount: 100_00,
    totalInstallments: 10,
    paidInstallments: 0,
    startYm: '2026-07',
    ...overrides,
  }
}

describe('regra central do limite do cartão (caso de aceite §5.4)', () => {
  it('limite 5.000, compra de 100/mês em 10x com 0 pagas → disponível reduz em 1.000', () => {
    const p = purchase()
    expect(availableLimit(card, [p])).toBe(5_000_00 - 1_000_00)
  })

  it('cada "+1 paga" devolve 100 ao disponível', () => {
    for (let pagas = 0; pagas <= 10; pagas++) {
      const p = purchase({ paidInstallments: pagas })
      expect(availableLimit(card, [p])).toBe(5_000_00 - (10 - pagas) * 100_00)
    }
  })

  it('a fatura atual também reduz o disponível', () => {
    const comFatura: Card = { ...card, invoice: 800_00 }
    const p = purchase({ paidInstallments: 3 })
    // 5.000 − 800 − 7×100 = 3.500
    expect(availableLimit(comFatura, [p])).toBe(3_500_00)
  })

  it('soma múltiplas compras ativas do mesmo cartão e ignora as de outros', () => {
    const compras = [
      purchase({ id: 'p1' }),
      purchase({ id: 'p2', installmentAmount: 50_00, totalInstallments: 4, paidInstallments: 2 }),
      purchase({ id: 'p3', cardId: 'OUTRO' }),
    ]
    expect(committedAmount('card1', compras)).toBe(1_000_00 + 2 * 50_00)
    expect(availableLimit(card, compras)).toBe(5_000_00 - 1_100_00)
  })

  it('compra quitada não compromete nada', () => {
    const p = purchase({ paidInstallments: 10 })
    expect(remainingInstallments(p)).toBe(0)
    expect(remainingAmount(p)).toBe(0)
    expect(availableLimit(card, [p])).toBe(5_000_00)
  })

  it('compromisso mensal soma parcelas das compras ativas', () => {
    const compras = [
      purchase({ id: 'p1' }),
      purchase({ id: 'p2', installmentAmount: 250_00, paidInstallments: 9 }),
      purchase({ id: 'p3', installmentAmount: 999_00, paidInstallments: 10 }), // quitada
    ]
    expect(monthlyCommitment('card1', compras)).toBe(100_00 + 250_00)
  })
})

describe('mês previsto de quitação', () => {
  it('cronograma normal: última parcela em startYm + total − 1', () => {
    const p = purchase({ startYm: '2026-07', totalInstallments: 10 })
    expect(payoffYm(p, '2026-07')).toBe('2027-04')
  })

  it('cruza a virada de ano', () => {
    const p = purchase({ startYm: '2026-11', totalInstallments: 4 })
    expect(payoffYm(p, '2026-11')).toBe('2027-02')
  })

  it('pagamento atrasado projeta a partir do mês atual', () => {
    // começou em 2025-01, 10x, pagou só 2 — em 2026-07 faltam 8:
    // cronograma original terminaria em 2025-10; projetado = 2026-07 + 7 = 2027-02
    const p = purchase({ startYm: '2025-01', paidInstallments: 2 })
    expect(payoffYm(p, '2026-07')).toBe('2027-02')
  })

  it('quitada → null', () => {
    const p = purchase({ paidInstallments: 10 })
    expect(payoffYm(p, '2026-07')).toBeNull()
  })
})
