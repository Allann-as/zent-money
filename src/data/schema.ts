import { z } from 'zod'

/**
 * Schema v7 dos dados persistidos do Zent Money.
 * Convenções (ver DECISOES.md):
 * - Dinheiro: inteiro em CENTAVOS, nunca formatado.
 * - Datas: ISO `YYYY-MM-DD`; meses: `YYYY-MM` (tipo `Ym`).
 * - Todo registro tem `id` único (string).
 * - **Saldo de conta é DERIVADO** (v7): o arquivo guarda o ponto de partida
 *   (`openingBalance`) e os MOVIMENTOS; o saldo sai da soma (ver engine/ledger.ts).
 */

export const DATA_VERSION = 11

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
  /** Conta em que o extra caiu (v7); null = não vinculado, não move saldo nenhum. */
  receivedIn: z.string().nullable(),
  /** Presente quando o lançamento foi gerado por uma recorrência. */
  recurringId: z.string().optional(),
})

/**
 * Configuração do recebimento do salário (v7 — R4 §1.1).
 * `bankId: null` = ninguém vinculou nada: o app segue funcionando como antes,
 * sem creditar salário em conta alguma.
 */
export const salaryConfigSchema = z.object({
  /** Conta padrão de recebimento; null = sem vínculo. */
  bankId: z.string().nullable(),
  /** Dia do pagamento (1–31; meses curtos usam o último dia, como as recorrências). */
  payDay: z.number().int().min(1).max(31),
  /** true = o app credita sozinho no dia; false = pede "Confirmar recebimento". */
  autoCredit: z.boolean(),
})

/**
 * Crédito de salário numa conta (v7). Um por mês de competência (`ym`), criado
 * pela materialização do boot ou pela confirmação manual — e reversível.
 * É um EVENTO, não um saldo: apagá-lo desfaz o crédito por construção.
 */
export const salaryCreditSchema = z.object({
  id: z.string(),
  /** Mês de competência do salário creditado. */
  ym,
  /** Data do crédito (o dia de pagamento daquele mês). */
  date: isoDate,
  bankId: z.string(),
  amount: cents.nonnegative(),
})

/** Transferência entre contas (v7): sai de uma, entra na outra, mesmo valor. */
export const transferSchema = z.object({
  id: z.string(),
  date: isoDate,
  fromBankId: z.string(),
  toBankId: z.string(),
  amount: cents.positive(),
})

/**
 * Ajuste de conciliação (v7): editar o saldo de um banco à mão não sobrescreve
 * mais um número — registra a DIFERENÇA como movimento. Assim o saldo continua
 * derivado e o histórico nunca mente sobre como se chegou nele.
 * `amount` é assinado (pode ser negativo).
 */
export const adjustmentSchema = z.object({
  id: z.string(),
  date: isoDate,
  bankId: z.string(),
  amount: cents,
  note: z.string(),
})

/**
 * Pagamento de fatura (v7 — R4 §1.7): debita a conta e abate a fatura do cartão.
 * É o elo que faltava — sem ele o dinheiro gasto no cartão nunca saía de conta
 * nenhuma. Gasto com origem-cartão NÃO debita a conta; quem debita é isto aqui.
 */
export const invoicePaymentSchema = z.object({
  id: z.string(),
  date: isoDate,
  cardId: z.string(),
  /** Conta de onde saiu o pagamento. */
  bankId: z.string(),
  amount: cents.positive(),
})

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: hexColor,
  /** Limite mensal BASE de orçamento; null = sem limite. O limite EFETIVO do mês
   * pode diferir por realocações (v8 — ver `budgetReallocations` e engine/budget). */
  monthlyLimit: cents.positive().nullable(),
})

/**
 * Realocação de orçamento entre categorias (v8 — M1 §c). Move parte do limite de
 * uma categoria para outra **só naquele mês** (`ym`): o limite EFETIVO do mês é
 * `base + recebido − cedido`, e a virada do mês volta ao base porque nenhuma
 * realocação de outro mês entra na conta. É um conceito de ORÇAMENTO, não um
 * movimento de dinheiro — jamais toca o ledger nem o saldo de conta alguma.
 */
export const budgetReallocationSchema = z.object({
  id: z.string(),
  /** Mês em que a realocação vale. */
  ym,
  /** Categoria que cede orçamento. */
  fromCategoryId: z.string(),
  /** Categoria que recebe orçamento. */
  toCategoryId: z.string(),
  amount: cents.positive(),
})

/**
 * "Pago com" (v6): de onde saiu o dinheiro do gasto. Opcional — sem seleção o
 * gasto é "sem origem" e tudo segue funcionando. União discriminada de propósito:
 * dois campos anuláveis (bankId/cardId) poderiam ser preenchidos ao mesmo tempo
 * e se contradizer. Cartão pertence a um banco, então a origem-cartão também
 * atribui o gasto ao banco dele (ver `expenseBankId`).
 */
export const expenseOriginSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bank'), bankId: z.string() }),
  z.object({ kind: z.literal('card'), cardId: z.string() }),
])

export const expenseSchema = z.object({
  id: z.string(),
  date: isoDate,
  categoryId: z.string(),
  description: z.string(),
  amount: cents.nonnegative(),
  /** true = Necessário, false = Supérfluo. */
  essential: z.boolean(),
  /** Conta ou cartão que pagou; null = sem origem. */
  origin: expenseOriginSchema.nullable(),
  /** Presente quando o lançamento foi gerado por uma recorrência. */
  recurringId: z.string().optional(),
})

export const bankSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: hexColor,
  /**
   * Ponto de partida do saldo (v7) — o que havia na conta antes de o app
   * conhecer qualquer movimento. O saldo EXIBIDO é derivado disto mais os
   * movimentos (`bankBalances`); nunca leia este campo como "o saldo".
   */
  openingBalance: cents,
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
  /**
   * Conta de onde o aporte saiu (v10); null = aporte antigo, sem vínculo — não
   * debita conta nenhuma (retrocompatível). Quando preenchido, o ledger debita
   * essa conta, como Guardar numa caixinha.
   */
  fromBankId: z.string().nullable(),
})

/**
 * Movimento de Guardar/Resgatar de uma caixinha MANUAL (v10 — §4). É uma
 * transferência real entre conta e caixinha, registrada nos dois lados:
 *  - `in`  (Guardar):  debita a conta, credita a caixinha;
 *  - `out` (Resgatar): sai da caixinha, credita a conta.
 * O saldo da conta é DERIVADO daqui (ledger), e o guardado da caixinha manual é
 * `manualAmount + Σ in − Σ out` — nada de saldo redundante (disciplina da R4).
 */
export const boxTransferSchema = z.object({
  id: z.string(),
  boxId: z.string(),
  bankId: z.string(),
  amount: cents.positive(),
  date: isoDate,
  direction: z.enum(['in', 'out']),
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

/** Quais taxas o usuário editou à mão (v7): cada uma pausa o automático só dela. */
export const rateOverridesSchema = z.object({
  selic: z.boolean(),
  cdi: z.boolean(),
  ipca: z.boolean(),
})

export const ratesSchema = z.object({
  /** % a.a. */
  selic: z.number(),
  /** % a.a. */
  cdi: z.number(),
  /** % acumulado 12m. */
  ipca: z.number(),
  /** Data da última atualização (manual ou automática). */
  updatedAt: isoDate,
  /** v7 — R4 §2: buscar as taxas oficiais na rede (único acesso à rede do app). */
  autoUpdate: z.boolean(),
  /** Instante ISO da última atualização automática bem-sucedida; null = nunca. */
  lastAutoAt: z.string().nullable(),
  /** Taxas sob override manual — o automático não as toca até "voltar ao automático". */
  overrides: rateOverridesSchema,
})

/**
 * Gamificação sóbria (v9 — M4). Persiste só o que NÃO é derivável:
 * - **conquistas** desbloqueadas (evento com data; idempotente);
 * - **desafio** ativo (um por vez) e o histórico dos avaliados.
 * O **score** e o **streak** NÃO entram aqui: são re-derivados dos dados
 * (determinístico), nunca snapshots gravados — ver engine/score.ts e streak.ts.
 */
export const achievementSchema = z.object({
  /** Chave do catálogo de conquistas (ver engine/achievements.ts). */
  id: z.string(),
  /** Data do desbloqueio (ISO); retroativas no 1º boot recebem a data de hoje. */
  unlockedAt: isoDate,
})

/**
 * Desafio mensal criado pelo usuário (§ M4). Um ativo por vez.
 * - **cap**: "máx R$ X em [categoria]" naquele mês;
 * - **reduce**: "Y% menos que o mês passado" na categoria.
 * União discriminada de propósito (não dois campos anuláveis que poderiam se
 * contradizer), como o `ExpenseOrigin`.
 */
export const challengeSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('cap'), ym, categoryId: z.string(), capAmount: cents.positive() }),
  z.object({
    id: z.string(),
    kind: z.literal('reduce'),
    ym,
    categoryId: z.string(),
    /** Percentual de redução alvo vs o mês anterior (ex.: 10 = gastar 10% menos). */
    reducePercent: z.number().positive(),
  }),
])

/** Desafio já avaliado (na virada do mês), com o resultado. */
export const challengeRecordSchema = z.object({
  challenge: challengeSchema,
  met: z.boolean(),
  /** Gasto real na categoria no mês do desafio (centavos). */
  actual: cents.nonnegative(),
  /** Alvo efetivo em centavos (o cap, ou mês-anterior×(1−redução)). */
  target: cents.nonnegative(),
})

export const gamificationSchema = z.object({
  achievements: z.array(achievementSchema),
  /** Desafio em andamento; null = nenhum. */
  activeChallenge: challengeSchema.nullable(),
  challengeHistory: z.array(challengeRecordSchema),
})

export const zentDataSchema = z.object({
  version: z.literal(DATA_VERSION),
  profile: z.object({
    name: z.string(),
  }),
  rates: ratesSchema,
  salaryHistory: z.array(salaryEntrySchema),
  salaryConfig: salaryConfigSchema,
  extraIncomes: z.array(extraIncomeSchema),
  categories: z.array(categorySchema),
  /** Realocações de orçamento entre categorias, por mês (v8). */
  budgetReallocations: z.array(budgetReallocationSchema),
  expenses: z.array(expenseSchema),
  banks: z.array(bankSchema),
  cards: z.array(cardSchema),
  purchases: z.array(purchaseSchema),
  /** Movimentos do ledger (v7) — a origem do saldo derivado de cada conta. */
  salaryCredits: z.array(salaryCreditSchema),
  transfers: z.array(transferSchema),
  adjustments: z.array(adjustmentSchema),
  invoicePayments: z.array(invoicePaymentSchema),
  investments: z.array(investmentSchema),
  contributions: z.array(contributionSchema),
  boxes: z.array(boxSchema),
  /** Movimentos de Guardar/Resgatar das caixinhas manuais (v10). */
  boxTransfers: z.array(boxTransferSchema),
  recurringExpenses: z.array(recurringExpenseSchema),
  recurringIncomes: z.array(recurringIncomeSchema),
  /** Gamificação sóbria (v9 — M4): conquistas + desafio. Score/streak são derivados. */
  gamification: gamificationSchema,
  meta: z.object({
    createdAt: isoDate,
    /** Última exportação manual — base do lembrete de 45 dias. */
    lastManualExport: isoDate.nullable(),
    /** Onboarding de categorias já exibido? */
    categoriesOnboarded: z.boolean(),
    /** Último mês com recorrências materializadas (null = nunca rodou). */
    lastRecurringYm: ym.nullable(),
    /** Último mês com o salário creditado em conta (v7); null = nunca. */
    lastSalaryCreditYm: ym.nullable(),
    /** v9 — as conquistas retroativas já foram avaliadas em silêncio no 1º boot? */
    gamificationOnboarded: z.boolean(),
  }),
})

export type ZentData = z.infer<typeof zentDataSchema>
export type SalaryEntry = z.infer<typeof salaryEntrySchema>
export type SalaryConfig = z.infer<typeof salaryConfigSchema>
export type SalaryCredit = z.infer<typeof salaryCreditSchema>
export type Transfer = z.infer<typeof transferSchema>
export type Adjustment = z.infer<typeof adjustmentSchema>
export type InvoicePayment = z.infer<typeof invoicePaymentSchema>
export type RateOverrides = z.infer<typeof rateOverridesSchema>
export type ExtraIncome = z.infer<typeof extraIncomeSchema>
export type Category = z.infer<typeof categorySchema>
export type BudgetReallocation = z.infer<typeof budgetReallocationSchema>
export type Expense = z.infer<typeof expenseSchema>
export type ExpenseOrigin = z.infer<typeof expenseOriginSchema>
export type Bank = z.infer<typeof bankSchema>
export type Card = z.infer<typeof cardSchema>
export type Purchase = z.infer<typeof purchaseSchema>
export type Investment = z.infer<typeof investmentSchema>
export type Contribution = z.infer<typeof contributionSchema>
export type Box = z.infer<typeof boxSchema>
export type BoxTransfer = z.infer<typeof boxTransferSchema>
export type Rates = z.infer<typeof ratesSchema>
export type ValueUpdate = z.infer<typeof valueUpdateSchema>
export type RecurringExpense = z.infer<typeof recurringExpenseSchema>
export type RecurringIncome = z.infer<typeof recurringIncomeSchema>
export type Achievement = z.infer<typeof achievementSchema>
export type Challenge = z.infer<typeof challengeSchema>
export type ChallengeRecord = z.infer<typeof challengeRecordSchema>
export type Gamification = z.infer<typeof gamificationSchema>
