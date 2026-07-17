import { useDataStore } from './dataStore'
import { bankBalances, materializeSalaryCredits, salaryCreditDate } from '@/engine/ledger'
import { salaryForYm } from '@/engine/aggregations'
import { todayIso } from '@/engine/dates'
import type { Ym } from '@/engine/dates'
import { newId } from '@/lib/id'

/**
 * Ações que movem dinheiro entre as contas (R4 §1). Ficam juntas de propósito:
 * são as ÚNICAS escritoras dos arrays de movimento, então a regra de cada
 * movimento tem um lugar só para ser lida (e corrigida).
 */

/**
 * Conciliação (§1.5): o usuário digita o saldo que o app do banco mostra e o
 * app registra a DIFERENÇA como ajuste. O saldo continua derivado e o histórico
 * explica como se chegou nele — em vez de um número sobrescrito sem rastro.
 *
 * O texto "Ajuste de conciliação: +R$ 137,50" é montado pela UI a partir de
 * `amount`; a nota guarda só o motivo. Guardar o valor no texto seria o mesmo
 * dado em dois lugares, livre para divergir do movimento que ele descreve.
 *
 * Retorna a diferença aplicada (0 = nada a fazer, nenhum ajuste criado).
 */
export function reconcileBankBalance(bankId: string, targetBalance: number): number {
  const data = useDataStore.getState().data
  if (!data) return 0
  const current = bankBalances(data).get(bankId)
  if (current === undefined) return 0
  const delta = targetBalance - current
  if (delta === 0) return 0
  useDataStore.getState().mutate((d) => {
    d.adjustments.push({
      id: newId(),
      date: todayIso(),
      bankId,
      amount: delta,
      note: 'Ajuste de conciliação',
    })
  })
  return delta
}

/** Transferência entre contas (§1.4): um registro, dois movimentos derivados. */
export function createTransfer(fromBankId: string, toBankId: string, amount: number, date: string): void {
  if (fromBankId === toBankId || amount <= 0) return
  useDataStore.getState().mutate((d) => {
    d.transfers.push({ id: newId(), date, fromBankId, toBankId, amount })
  })
}

/**
 * Pagamento de fatura (§1.7): debita a conta e abate a fatura na mesma
 * transação. São dois efeitos de um fato só — separá-los deixaria o app num
 * estado onde o dinheiro saiu da conta mas a fatura continua cheia.
 * O abatimento nunca deixa a fatura negativa (o schema não permite, e uma
 * fatura negativa não significa nada).
 */
export function payInvoice(cardId: string, bankId: string, amount: number, date: string): void {
  if (amount <= 0) return
  useDataStore.getState().mutate((d) => {
    const card = d.cards.find((c) => c.id === cardId)
    if (!card) return
    d.invoicePayments.push({ id: newId(), date, cardId, bankId, amount })
    card.invoice = Math.max(0, card.invoice - amount)
  })
}

/**
 * Credita o salário de um mês na conta configurada (confirmação manual do §1.1,
 * ou o botão de "creditar agora"). Não duplica: mês já creditado é no-op.
 */
export function creditSalaryFor(ym: Ym): boolean {
  const data = useDataStore.getState().data
  if (!data) return false
  const { bankId, payDay } = data.salaryConfig
  if (bankId === null) return false
  // A conta precisa existir. Sem esta guarda, um vínculo apontando para banco
  // excluído criaria um crédito que `bankBalances` ignora — e o toast diria "o
  // saldo já reflete a entrada" sobre um saldo que não se moveu. Mentir sobre
  // dinheiro é o pior defeito que este app pode ter.
  if (!data.banks.some((b) => b.id === bankId)) return false
  if (data.salaryCredits.some((c) => c.ym === ym)) return false
  const amount = salaryForYm(data.salaryHistory, ym)
  if (amount <= 0) return false
  useDataStore.getState().mutate((d) => {
    d.salaryCredits.push({ id: newId(), ym, date: salaryCreditDate(ym, payDay), bankId, amount })
    // O marcador acompanha o mês creditado: é ele que impede o boot de recriar
    // um crédito que o usuário desfez (ver materializeSalaryCredits).
    if (d.meta.lastSalaryCreditYm === null || d.meta.lastSalaryCreditYm < ym) {
      d.meta.lastSalaryCreditYm = ym
    }
  })
  return true
}

/**
 * Desfaz um crédito de salário (§1.1). Só apaga o evento — o marcador fica onde
 * está, senão o próximo boot recriaria exatamente o que o usuário acabou de
 * desfazer.
 */
export function undoSalaryCredit(creditId: string): void {
  useDataStore.getState().mutate((d) => {
    d.salaryCredits = d.salaryCredits.filter((c) => c.id !== creditId)
  })
}

/**
 * Aplica a materialização automática dos créditos de salário (§1.1) e persiste.
 * Roda no boot e logo após vincular a conta — a mesma função nos dois casos,
 * para não existirem duas regras de "quando o salário cai".
 * Retorna quantos créditos foram criados.
 */
export function runSalaryMaterialization(todayIsoStr: string = todayIso()): number {
  const data = useDataStore.getState().data
  if (!data) return 0
  const { credits, lastYm } = materializeSalaryCredits(data, todayIsoStr)
  if (credits.length === 0 && data.meta.lastSalaryCreditYm === lastYm) return 0
  useDataStore.getState().mutate((d) => {
    for (const c of credits) d.salaryCredits.push({ id: newId(), ...c })
    d.meta.lastSalaryCreditYm = lastYm
  })
  return credits.length
}
