import type {
  Adjustment,
  BoxTransfer,
  BudgetReallocation,
  Contribution,
  Expense,
  ExtraIncome,
  InvoicePayment,
  Purchase,
  SalaryCredit,
  Transfer,
  ZentData,
} from '@/data/schema'
import { podeDebitar, saldoDisponivel } from '@/engine/balance'
import { boxStoredAmount } from '@/engine/ledger'
import { formatBRL } from '@/engine/money'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SUFICIÊNCIA DE SALDO — bloqueio duro da Família A (adendo R10)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * A checagem mora AQUI, na fonte única das mutações — não na UI. Se vivesse só
 * no formulário, a bandeja, um import ou qualquer código futuro furariam a
 * regra. As `add*` das operações de Família A (guardar, aportar-com-conta,
 * transferir, resgatar) validam contra o saldo DERIVADO e lançam
 * `InsufficientBalanceError` quando o dinheiro não existe; o immer descarta o
 * rascunho e nada muda. A UI já desabilita o botão com o mesmo dado, então o
 * throw é a rede de segurança, não o caminho normal.
 *
 * A Família B (gasto/fatura) NÃO passa por aqui: ela pode ficar negativa de
 * propósito (ver DECISOES) — o aviso e a confirmação são da UI.
 */
export class InsufficientBalanceError extends Error {
  /** Saldo que de fato havia disponível na data (centavos). */
  readonly available: number
  constructor(available: number, message: string) {
    super(message)
    this.name = 'InsufficientBalanceError'
    this.available = available
  }
}

/** Recusa um débito de Família A que exceda o saldo disponível na data. */
function assertCanDebit(d: ZentData, bankId: string, valor: number, date: string): void {
  if (!podeDebitar(d, bankId, valor, date)) {
    const disp = saldoDisponivel(d, bankId, date)
    throw new InsufficientBalanceError(disp, `Saldo insuficiente — disponível ${formatBRL(disp)}.`)
  }
}

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
  // Família A: aporte COM conta de origem debita a conta — bloqueio duro.
  // Aporte antigo (fromBankId null) não debita nada e não é validado.
  if (c.fromBankId !== null) assertCanDebit(d, c.fromBankId, c.amount, c.date)
  d.contributions.push(c)
}
export function removeContribution(d: ZentData, id: string): void {
  d.contributions = dropById(d.contributions, id)
}

// ── Guardar/Resgatar de caixinha manual (§4) ─────────────────────────────────
/**
 * Um `boxTransfer` é uma transferência real conta↔caixinha. O efeito nos DOIS
 * lados (saldo da conta e guardado da caixinha) é DERIVADO deste registro
 * (ver ledger.ts / boxStoredAmount), então criar→excluir é neutro por
 * construção: apagar o movimento devolve conta e caixinha ao estado anterior.
 */
export function addBoxTransfer(d: ZentData, t: BoxTransfer): void {
  if (t.direction === 'in') {
    // Guardar debita a CONTA — bloqueio duro por saldo.
    assertCanDebit(d, t.bankId, t.amount, t.date)
  } else {
    // Resgatar debita a CAIXINHA (credita a conta) — não se resgata mais do que
    // há guardado (o guardado REAL, não valor de mercado; Guardar/Resgatar só
    // existe em caixinha manual — ver DECISOES §4).
    const box = d.boxes.find((b) => b.id === t.boxId)
    const stored = box ? boxStoredAmount(box.id, box.manualAmount, d.boxTransfers) : 0
    if (t.amount > stored) {
      throw new InsufficientBalanceError(stored, `Resgate maior que o guardado — disponível ${formatBRL(stored)}.`)
    }
  }
  d.boxTransfers.push(t)
}
export function removeBoxTransfer(d: ZentData, id: string): void {
  d.boxTransfers = dropById(d.boxTransfers, id)
}

// ── Parcela (de cartão ou avulsa) ─────────────────────────────────────────────
export function addPurchase(d: ZentData, p: Purchase): void {
  d.purchases.push(p)
}
export function removePurchase(d: ZentData, id: string): void {
  d.purchases = dropById(d.purchases, id)
}

// ── Parcela paga (contador da compra) ────────────────────────────────────────
/**
 * Marcar uma parcela como paga é mutação de CONTADOR, não lançamento de
 * dinheiro — e é de propósito que ela não debite conta nenhuma:
 *
 * - **compra de cartão**: a parcela já está dentro da fatura, que é um snapshot
 *   MANUAL digitado pelo usuário (R3 §3.4). O dinheiro sai quando a fatura é
 *   paga (`addInvoicePayment`); debitar aqui também contaria o mesmo real duas
 *   vezes — exatamente o furo que a R4 fechou.
 * - **parcela avulsa**: não há fatura nem conta vinculada no modelo; o registro
 *   é de controle do comprometido do mês.
 *
 * O efeito real é no LIMITE: `availableLimit = limite − fatura − comprometido`,
 * e `comprometido` conta só as parcelas que faltam — pagar uma devolve o valor
 * dela ao disponível, por derivação, sem código de "devolver limite".
 *
 * Mora aqui pelo motivo dos demais pares (M1 §a): `pay`/`unpay` são o inverso
 * EXATO um do outro (clamp nas duas pontas), e a página chama a mesma função
 * que o teste — não uma reencenação dela.
 */
export function payInstallment(d: ZentData, purchaseId: string): void {
  const p = d.purchases.find((x) => x.id === purchaseId)
  if (p === undefined) return
  p.paidInstallments = Math.min(p.totalInstallments, p.paidInstallments + 1)
}
export function unpayInstallment(d: ZentData, purchaseId: string): void {
  const p = d.purchases.find((x) => x.id === purchaseId)
  if (p === undefined) return
  p.paidInstallments = Math.max(0, p.paidInstallments - 1)
}

// ── Transferência entre contas ────────────────────────────────────────────────
export function addTransfer(d: ZentData, t: Transfer): void {
  // Família A: a conta de ORIGEM é debitada — bloqueio duro.
  assertCanDebit(d, t.fromBankId, t.amount, t.date)
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

// ── Realocação de orçamento (não é dinheiro; não toca o ledger) ───────────────
export function addBudgetReallocation(d: ZentData, r: BudgetReallocation): void {
  d.budgetReallocations.push(r)
}
export function removeBudgetReallocation(d: ZentData, id: string): void {
  d.budgetReallocations = dropById(d.budgetReallocations, id)
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
