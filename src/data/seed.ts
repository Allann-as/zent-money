import { newId } from '@/lib/id'
import { todayIso } from '@/engine/dates'
import type { ZentData } from './schema'
import { DATA_VERSION } from './schema'

/** Cores oficiais das marcas dos bancos do seed. */
export const BANK_BRAND_COLORS: Record<string, string> = {
  nubank: '#820AD1',
  itau: '#EC7000',
  bradesco: '#CC092F',
  santander: '#EA1D25',
  // Os dois BTG são a mesma marca; quem os distingue é o LOGO — navy-sobre-claro
  // (Banking) × branco-sobre-navy (Investimentos), R3 §3.2. Já `color` é acento de
  // UI (barra do banco, chip do cartão, monograma): navy nos dois apagaria o acento
  // do Banking no tema escuro, então ele mantém o azul.
  btginvestimentos: '#0A2540',
  btgbanking: '#2C5EA9',
}

/**
 * Estado inicial do app (primeiro uso):
 * - 6 bancos com saldo zerado (Nubank, Itaú, Bradesco, Santander e os DOIS
 *   BTGs: Investimentos — corretora — e Banking — conta do dia a dia)
 * - ZERO categorias (onboarding cria)
 * - Caixinha "Reserva de emergência" (ícone lifebuoy) com alvo R$ 2.500
 * - Taxas de referência de 16/07/2026
 */
export function createSeedData(): ZentData {
  const today = todayIso()
  return {
    version: DATA_VERSION,
    profile: { name: 'Allan' },
    rates: {
      selic: 14.25,
      cdi: 14.15,
      ipca: 4.64,
      updatedAt: '2026-07-16',
      autoUpdate: true,
      lastAutoAt: null,
      overrides: { selic: false, cdi: false, ipca: false },
    },
    salaryHistory: [],
    // Sem conta vinculada: o app só passa a creditar salário depois que o
    // usuário escolher a conta em Ganhos (R4 §1.1).
    salaryConfig: { bankId: null, payDay: 5, autoCredit: true },
    extraIncomes: [],
    categories: [],
    expenses: [],
    banks: [
      { id: newId(), name: 'Nubank', color: BANK_BRAND_COLORS['nubank'] ?? '#820AD1', openingBalance: 0 },
      { id: newId(), name: 'Itaú', color: BANK_BRAND_COLORS['itau'] ?? '#EC7000', openingBalance: 0 },
      { id: newId(), name: 'Bradesco', color: BANK_BRAND_COLORS['bradesco'] ?? '#CC092F', openingBalance: 0 },
      { id: newId(), name: 'Santander', color: BANK_BRAND_COLORS['santander'] ?? '#EA1D25', openingBalance: 0 },
      { id: newId(), name: 'BTG Investimentos', color: BANK_BRAND_COLORS['btginvestimentos'] ?? '#0A2540', openingBalance: 0 },
      { id: newId(), name: 'BTG Banking', color: BANK_BRAND_COLORS['btgbanking'] ?? '#2C5EA9', openingBalance: 0 },
    ],
    cards: [],
    purchases: [],
    salaryCredits: [],
    transfers: [],
    adjustments: [],
    invoicePayments: [],
    investments: [],
    contributions: [],
    boxes: [
      {
        id: newId(),
        icon: 'lifebuoy',
        name: 'Reserva de emergência',
        target: 250_000,
        investmentId: null,
        manualAmount: 0,
        celebrated: false,
      },
    ],
    recurringExpenses: [],
    recurringIncomes: [],
    meta: {
      createdAt: today,
      lastManualExport: null,
      categoriesOnboarded: false,
      lastRecurringYm: null,
      lastSalaryCreditYm: null,
    },
  }
}
