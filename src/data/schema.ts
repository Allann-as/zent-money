import { z } from 'zod'

/**
 * Schema v4 dos dados persistidos do Zent Money.
 * Convenções (ver DECISOES.md):
 * - Dinheiro: inteiro em CENTAVOS, nunca formatado.
 * - Datas: ISO `YYYY-MM-DD`; meses: `YYYY-MM` (tipo `Ym`).
 * - Todo registro tem `id` único (string).
 */

export const DATA_VERSION = 4

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data ISO YYYY-MM-DD')
const ym = z.string().regex(/^\d{4}-\d{2}$/, 'mês YYYY-MM')
const cents = z.number().int()
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const salaryEntrySchema = z.object({
  id: z.string(),
  /** Mês (inclusive) a partir do qual este salário vigora. */
  startYm: ym,
  amount: cents.nonnegative(),
})

export const extraIncomeSchema = z.object({
  id: z.string(),
  date: isoDate,
  description: z.string(),
  amount: cents.nonnegative(),
  /** Presente quando o lançamento foi gerado por uma recorrência. */
  recurringId: z.string().optional(),
})

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: hexColor,
  /** Limite mensal de orçamento; null = sem limite. */
  monthlyLimit: cents.positive().nullable(),
})

export const expenseSchema = z.object({
  id: z.string(),
  date: isoDate,
  categoryId: z.string(),
  description: z.string(),
  amount: cents.nonnegative(),
  /** true = Necessário, false = Supérfluo. */
  essential: z.boolean(),
  /** Presente quando o lançamento foi gerado por uma recorrência. */
  recurringId: z.string().optional(),
})

export const bankSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: hexColor,
  /** Saldo em conta, editável diretamente. */
  balance: cents,
})

export const cardSchema = z.object({
  id: z.string(),
  bankId: z.string(),
  name: z.string(),
  limit: cents.nonnegative(),
  /** Fatura atual em aberto, editável a qualquer momento. */
  invoice: cents.nonnegative(),
})

/**
 * Parcelamento. Dois tipos, discriminados por `cardId` (v4):
 * - **vinculada a cartão** (`cardId` preenchido): consome o limite do cartão;
 * - **avulsa** (`cardId: null`): empréstimo, financiamento, crediário, boleto
 *   parcelado. NÃO afeta limite de cartão nenhum, mas entra normalmente no
 *   comprometido do mês, em Compromissos e na Linha do tempo.
 * O tipo é derivado de `cardId` de propósito — um campo `kind` separado seria
 * estado redundante, livre para divergir do vínculo real (ver `isStandalone`).
 */
export const purchaseSchema = z.object({
  id: z.string(),
  /** Cartão da compra; null = parcela avulsa. */
  cardId: z.string().nullable(),
  /** Credor/descrição da avulsa (ex.: "Empréstimo pessoal — Banco X"); null nas vinculadas. */
  creditor: z.string().nullable(),
  name: z.string(),
  installmentAmount: cents.positive(),
  totalInstallments: z.number().int().positive(),
  paidInstallments: z.number().int().nonnegative(),
  /** Mês da 1ª parcela — base do "mês previsto de quitação". */
  startYm: ym,
})

export const rateTypeSchema = z.enum(['selic', 'cdi', 'ipca', 'prefixado', 'manual'])
export type RateType = z.infer<typeof rateTypeSchema>

/** Atualização manual de valor de mercado (classe "Outros ativos"). */
export const valueUpdateSchema = z.object({
  id: z.string(),
  date: isoDate,
  value: cents.nonnegative(),
})

export const investmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  bankId: z.string(),
  rateType: rateTypeSchema,
  /**
   * Parâmetro da taxa conforme o tipo:
   * selic → ignorado (usa Selic cheia) · cdi → % do CDI (ex.: 102)
   * ipca → juro fixo somado ao IPCA (ex.: 5.5) · prefixado → % a.a. (ex.: 12)
   * manual → ignorado (valor de mercado vem de valueUpdates)
   */
  rateParam: z.number(),
  /** Série de valor de mercado dos ativos manuais (vazio nos demais). */
  valueUpdates: z.array(valueUpdateSchema),
})

export const contributionSchema = z.object({
  id: z.string(),
  investmentId: z.string(),
  date: isoDate,
  amount: cents.positive(),
})

export const boxSchema = z.object({
  id: z.string(),
  /** Chave de ícone SVG do set de caixinhas (ver design/BoxIcon.tsx). */
  icon: z.string(),
  name: z.string(),
  target: cents.positive(),
  /** Vinculada a uma aplicação (acompanha o saldo dela) ou null = manual. */
  investmentId: z.string().nullable(),
  /** Valor guardado quando manual (ignorado se vinculada). */
  manualAmount: cents.nonnegative(),
  /** Para celebrar apenas uma vez ao bater a meta. */
  celebrated: z.boolean(),
})

/** Recorrência de gasto: gera um lançamento por mês automaticamente. */
export const recurringExpenseSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  description: z.string(),
  amount: cents.nonnegative(),
  essential: z.boolean(),
  /** Dia do mês do lançamento (1–31; meses curtos usam o último dia). */
  dayOfMonth: z.number().int().min(1).max(31),
  startYm: ym,
  /** null = sem fim. */
  endYm: ym.nullable(),
})

/** Recorrência de ganho extra. */
export const recurringIncomeSchema = z.object({
  id: z.string(),
  description: z.string(),
  amount: cents.nonnegative(),
  dayOfMonth: z.number().int().min(1).max(31),
  startYm: ym,
  endYm: ym.nullable(),
})

export const ratesSchema = z.object({
  /** % a.a. */
  selic: z.number(),
  /** % a.a. */
  cdi: z.number(),
  /** % acumulado 12m. */
  ipca: z.number(),
  /** Data da última atualização manual. */
  updatedAt: isoDate,
})

export const zentDataSchema = z.object({
  version: z.literal(DATA_VERSION),
  profile: z.object({
    name: z.string(),
  }),
  rates: ratesSchema,
  salaryHistory: z.array(salaryEntrySchema),
  extraIncomes: z.array(extraIncomeSchema),
  categories: z.array(categorySchema),
  expenses: z.array(expenseSchema),
  banks: z.array(bankSchema),
  cards: z.array(cardSchema),
  purchases: z.array(purchaseSchema),
  investments: z.array(investmentSchema),
  contributions: z.array(contributionSchema),
  boxes: z.array(boxSchema),
  recurringExpenses: z.array(recurringExpenseSchema),
  recurringIncomes: z.array(recurringIncomeSchema),
  meta: z.object({
    createdAt: isoDate,
    /** Última exportação manual — base do lembrete de 45 dias. */
    lastManualExport: isoDate.nullable(),
    /** Onboarding de categorias já exibido? */
    categoriesOnboarded: z.boolean(),
    /** Último mês com recorrências materializadas (null = nunca rodou). */
    lastRecurringYm: ym.nullable(),
  }),
})

export type ZentData = z.infer<typeof zentDataSchema>
export type SalaryEntry = z.infer<typeof salaryEntrySchema>
export type ExtraIncome = z.infer<typeof extraIncomeSchema>
export type Category = z.infer<typeof categorySchema>
export type Expense = z.infer<typeof expenseSchema>
export type Bank = z.infer<typeof bankSchema>
export type Card = z.infer<typeof cardSchema>
export type Purchase = z.infer<typeof purchaseSchema>
export type Investment = z.infer<typeof investmentSchema>
export type Contribution = z.infer<typeof contributionSchema>
export type Box = z.infer<typeof boxSchema>
export type Rates = z.infer<typeof ratesSchema>
export type ValueUpdate = z.infer<typeof valueUpdateSchema>
export type RecurringExpense = z.infer<typeof recurringExpenseSchema>
export type RecurringIncome = z.infer<typeof recurringIncomeSchema>
