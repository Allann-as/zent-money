import type {
  Adjustment,
  Contribution,
  Expense,
  ExtraIncome,
  InvoicePayment,
  Purchase,
  SalaryCredit,
  Transfer,
  ZentData,
} from '@/data/schema'

/**
 * Fonte única das mutações de LANÇAMENTO reversíveis (M1 §a).
 *
 * Cada tipo de lançamento tem exatamente um par `add*`/`remove*` aqui — e é este
 * par que tanto a UI quanto os testes chamam. Antes, o "criar" morava num diálogo
 * e o "excluir" numa página distante; nada garantia que um fosse o inverso exato
 * do outro. Concentrá-los num lugar só é o que torna a **invariante criar→excluir
 * neutro** verificável: o teste de propriedade (`mutations.test.ts`) exercita
 * ESTAS funções, não uma reencenação delas — a mesma lição do smoke test da R3
 * ("um teste só vale depois de vê-lo falhar contra o bug que ele afirma pegar").
 *
 * São recipes puras sobre um rascunho de `ZentData` (compatíveis com immer): o
 * chamador gera o `id` e persiste. A regra de cada movimento tem, assim, um único
 * lugar para ser lida e corrigida.
 *
 * **O que NÃO está aqui, de propósito:** criar um banco/cartão/categoria (não são
 * lançamentos), o "somar à fatura" opcional do gasto (é uma edição pontual do
 * snapshot manual da fatura, não um vínculo persistido — ver DECISOES.md R3 §3.4)
 * e a materialização automática do salário (vive em `engine/ledger.ts`).
 */

/** O inverso universal de um `push`: remove o registro de `id` único. */
function dropById<T extends { id: string }>(arr: T[], id: string): T[] {
  return arr.filter((x) => x.id !== id)
}

// ── Gasto ────────────────────────────────────────────────────────────────────
export function addExpense(d: ZentData, e: Expense): void {
  d.expenses.push(e)
}
export function removeExpense(d: ZentData, id: string): void {
  d.expenses = dropById(d.expenses, id)
}

// ── Extra recebido ─────────────────────────────────────────────────────────
export function addExtraIncome(d: ZentData, x: ExtraIncome): void {
  d.extraIncomes.push(x)
}
export function removeExtraIncome(d: ZentData, id: string): void {
  d.extraIncomes = dropById(d.extraIncomes, id)
}

// ── Aporte ───────────────────────────────────────────────────────────────────
export function addContribution(d: ZentData, c: Contribution): void {
  d.contributions.push(c)
}
export function removeContribution(d: ZentData, id: string): void {
  d.contributions = dropById(d.contributions, id)
}

// ── Parcela (de cartão ou avulsa) ─────────────────────────────────────────────
export function addPurchase(d: ZentData, p: Purchase): void {
  d.purchases.push(p)
}
export function removePurchase(d: ZentData, id: string): void {
  d.purchases = dropById(d.purchases, id)
}

// ── Transferência entre contas ────────────────────────────────────────────────
export function addTransfer(d: ZentData, t: Transfer): void {
  d.transfers.push(t)
}
export function removeTransfer(d: ZentData, id: string): void {
  d.transfers = dropById(d.transfers, id)
}

// ── Ajuste de conciliação ─────────────────────────────────────────────────────
export function addAdjustment(d: ZentData, a: Adjustment): void {
  d.adjustments.push(a)
}
export function removeAdjustment(d: ZentData, id: string): void {
  d.adjustments = dropById(d.adjustments, id)
}

// ── Crédito de salário ────────────────────────────────────────────────────────
/**
 * Credita o salário e AVANÇA o marcador `lastSalaryCreditYm`. O `remove*` abaixo
 * de propósito NÃO recua o marcador: é ele que impede o próximo boot de recriar
 * um crédito que o usuário acabou de desfazer (ver `materializeSalaryCredits`).
 * Essa assimetria não fere a invariante — o marcador não é um "número do app"
 * (nenhuma agregação depende dele), só governa a materialização futura.
 */
export function addSalaryCredit(d: ZentData, c: SalaryCredit): void {
  d.salaryCredits.push(c)
  if (d.meta.lastSalaryCreditYm === null || d.meta.lastSalaryCreditYm < c.ym) {
    d.meta.lastSalaryCreditYm = c.ym
  }
}
export function removeSalaryCredit(d: ZentData, id: string): void {
  d.salaryCredits = dropById(d.salaryCredits, id)
}

// ── Pagamento de fatura ──────────────────────────────────────────────────────
/**
 * Debita a conta (via ledger, ao registrar o pagamento) e abate o snapshot da
 * fatura na mesma transação (§1.7). O abatimento nunca deixa a fatura negativa.
 *
 * `removeInvoicePayment` é o inverso: apaga o pagamento e devolve `amount` à
 * fatura. É EXATO sempre que o pagamento não estourou a fatura (`amount ≤ fatura`
 * no momento do pagamento) — o caso normal. No pagamento com excedente a fatura
 * foi cravada em 0 e o excedente "não vira crédito" (a UI avisa disso em
 * `ledgerDialogs.tsx`): ali o forward já é intencionalmente sem-volta, e desfazer
 * devolve à conta o valor cheio, mas a fatura pode subir além do original. Fora
 * desse caso de borda, criar→excluir é neutro.
 */
export function addInvoicePayment(d: ZentData, p: InvoicePayment): void {
  d.invoicePayments.push(p)
  const card = d.cards.find((c) => c.id === p.cardId)
  if (card) card.invoice = Math.max(0, card.invoice - p.amount)
}
export function removeInvoicePayment(d: ZentData, id: string): void {
  const p = d.invoicePayments.find((x) => x.id === id)
  if (p === undefined) return
  d.invoicePayments = dropById(d.invoicePayments, id)
  const card = d.cards.find((c) => c.id === p.cardId)
  if (card) card.invoice += p.amount
}
