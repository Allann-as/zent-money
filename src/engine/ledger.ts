import type { SalaryCredit, ZentData } from '@/data/schema'
import { salaryForYm } from './aggregations'
import { addMonths, daysInYm, ymCompare, ymOfDate } from './dates'
import type { Ym } from './dates'

/**
 * Ledger híbrido (R4 §1) — o elo que faltava entre o fluxo declarado
 * (salário/extras/gastos) e o dinheiro que existe em cada conta.
 *
 * **O saldo é DERIVADO, nunca digitado:**
 *
 *     saldo(banco) = openingBalance
 *                  + Σ créditos de salário
 *                  + Σ extras recebidos aqui
 *                  − Σ gastos com origem NESTA CONTA
 *                  + Σ transferências recebidas − Σ transferências enviadas
 *                  − Σ pagamentos de fatura feitos por aqui
 *                  + Σ ajustes de conciliação
 *                  − Σ Guardado em caixinha daqui + Σ Resgatado para aqui (§4)
 *                  − Σ aportes com origem NESTA CONTA (§5)
 *
 * Guardar `balance` ao lado dos movimentos seria estado redundante livre para
 * divergir do próprio histórico — exatamente o defeito que esta release corrige.
 *
 * **Anti-dupla contagem (§1.7):** gasto com origem-CARTÃO não aparece aqui.
 * Ele vira dívida no cartão (fatura, que o usuário digita) e só toca a conta
 * quando a fatura é paga — via `invoicePayments`. Cada real sai da conta uma vez.
 *
 * **Custo:** uma passada por array, sem varredura por banco (nada de N²).
 */

/** Categorias de movimento de conta — a base do histórico e dos ícones da UI. */
export type MovementKind =
  | 'opening'
  | 'salary'
  | 'extra'
  | 'expense'
  | 'transfer-in'
  | 'transfer-out'
  | 'invoice'
  | 'adjustment'
  | 'box-in'
  | 'box-out'
  | 'contribution'

export interface Movement {
  /** Único no histórico (prefixado pelo tipo: um transfer gera dois movimentos). */
  id: string
  date: string
  bankId: string
  /** Assinado em centavos: positivo entra na conta, negativo sai. */
  amount: number
  kind: MovementKind
  description: string
  /** Id do registro que originou o movimento (para desfazer / navegar até ele). */
  sourceId: string
}

/**
 * Saldo derivado de cada conta, em UMA passada por array (§4 da R4).
 * Bancos sem movimento algum retornam o próprio `openingBalance` — é isso que
 * mantém o app idêntico ao de antes para quem não vinculou nada.
 */
export function bankBalances(data: ZentData): Map<string, number> {
  const out = new Map<string, number>()
  for (const b of data.banks) out.set(b.id, b.openingBalance)

  const add = (bankId: string | null, delta: number): void => {
    if (bankId === null) return
    const cur = out.get(bankId)
    // Movimento apontando para banco inexistente é ignorado em vez de criar um
    // saldo fantasma de um banco que não está na tela.
    if (cur === undefined) return
    out.set(bankId, cur + delta)
  }

  for (const c of data.salaryCredits) add(c.bankId, c.amount)
  for (const e of data.extraIncomes) add(e.receivedIn, e.amount)
  for (const e of data.expenses) {
    if (e.origin?.kind === 'bank') add(e.origin.bankId, -e.amount)
  }
  for (const t of data.transfers) {
    add(t.fromBankId, -t.amount)
    add(t.toBankId, t.amount)
  }
  for (const p of data.invoicePayments) add(p.bankId, -p.amount)
  for (const a of data.adjustments) add(a.bankId, a.amount)
  // Guardar (in) debita a conta; Resgatar (out) credita (§4).
  for (const bt of data.boxTransfers) add(bt.bankId, bt.direction === 'in' ? -bt.amount : bt.amount)
  // Aporte com conta de origem debita (§5); aporte antigo (fromBankId null) não.
  for (const c of data.contributions) add(c.fromBankId, -c.amount)

  return out
}

/** Saldo de uma conta específica. Prefira `bankBalances` quando quiser várias. */
export function bankBalance(data: ZentData, bankId: string): number {
  return bankBalances(data).get(bankId) ?? 0
}

/** Soma dos saldos de todas as contas — o "Em conta" do app inteiro. */
export function totalInAccounts(data: ZentData): number {
  let total = 0
  for (const v of bankBalances(data).values()) total += v
  return total
}

/**
 * true quando o usuário ligou o ledger em algum ponto (salário vinculado, extra
 * recebido em conta, gasto com origem-conta, transferência, fatura paga ou
 * ajuste). Enquanto for false, "Em conta" é só a soma dos saldos declarados e a
 * UI diz isso com todas as letras em vez de fingir que derivou algo (§1.6).
 */
export function isLedgerLinked(data: ZentData): boolean {
  return (
    data.salaryConfig.bankId !== null ||
    data.salaryCredits.length > 0 ||
    data.transfers.length > 0 ||
    data.adjustments.length > 0 ||
    data.invoicePayments.length > 0 ||
    data.extraIncomes.some((e) => e.receivedIn !== null) ||
    data.expenses.some((e) => e.origin?.kind === 'bank') ||
    data.boxTransfers.length > 0 ||
    data.contributions.some((c) => c.fromBankId !== null)
  )
}

/**
 * Guardado atual de uma caixinha MANUAL (§4): a linha de base editável à mão
 * (`manualAmount`) mais os movimentos de Guardar/Resgatar. Derivado, nunca um
 * saldo à parte — a mesma disciplina do saldo de conta. Para caixinha vinculada
 * a investimento o valor vem do investimento (ver `investmentSnapshot`), não daqui.
 */
export function boxStoredAmount(boxId: string, manualAmount: number, transfers: readonly { boxId: string; amount: number; direction: 'in' | 'out' }[]): number {
  let total = manualAmount
  for (const t of transfers) {
    if (t.boxId !== boxId) continue
    total += t.direction === 'in' ? t.amount : -t.amount
  }
  return total
}

/**
 * Histórico completo de uma conta, do mais recente para o mais antigo.
 * Varre os arrays uma vez cada, filtrando pelo banco pedido — a ordenação
 * incide só sobre os movimentos DESTA conta, nunca sobre a base inteira.
 */
export function bankMovements(data: ZentData, bankId: string): Movement[] {
  const bank = data.banks.find((b) => b.id === bankId)
  if (!bank) return []

  const out: Movement[] = []

  for (const c of data.salaryCredits) {
    if (c.bankId !== bankId) continue
    out.push({
      id: `salary-${c.id}`,
      date: c.date,
      bankId,
      amount: c.amount,
      kind: 'salary',
      description: 'Salário',
      sourceId: c.id,
    })
  }

  for (const e of data.extraIncomes) {
    if (e.receivedIn !== bankId) continue
    out.push({
      id: `extra-${e.id}`,
      date: e.date,
      bankId,
      amount: e.amount,
      kind: 'extra',
      description: e.description,
      sourceId: e.id,
    })
  }

  // Só gastos pagos PELA CONTA. Os do cartão chegam aqui como pagamento de fatura.
  for (const e of data.expenses) {
    if (e.origin?.kind !== 'bank' || e.origin.bankId !== bankId) continue
    out.push({
      id: `expense-${e.id}`,
      date: e.date,
      bankId,
      amount: -e.amount,
      kind: 'expense',
      description: e.description,
      sourceId: e.id,
    })
  }

  const bankName = (id: string): string => data.banks.find((b) => b.id === id)?.name ?? 'conta removida'

  for (const t of data.transfers) {
    if (t.fromBankId === bankId) {
      out.push({
        id: `transfer-out-${t.id}`,
        date: t.date,
        bankId,
        amount: -t.amount,
        kind: 'transfer-out',
        description: `Transferência para ${bankName(t.toBankId)}`,
        sourceId: t.id,
      })
    }
    if (t.toBankId === bankId) {
      out.push({
        id: `transfer-in-${t.id}`,
        date: t.date,
        bankId,
        amount: t.amount,
        kind: 'transfer-in',
        description: `Transferência de ${bankName(t.fromBankId)}`,
        sourceId: t.id,
      })
    }
  }

  for (const p of data.invoicePayments) {
    if (p.bankId !== bankId) continue
    const card = data.cards.find((c) => c.id === p.cardId)
    out.push({
      id: `invoice-${p.id}`,
      date: p.date,
      bankId,
      amount: -p.amount,
      kind: 'invoice',
      description: `Fatura ${card?.name ?? 'de cartão removido'}`,
      sourceId: p.id,
    })
  }

  for (const a of data.adjustments) {
    if (a.bankId !== bankId) continue
    out.push({
      id: `adjustment-${a.id}`,
      date: a.date,
      bankId,
      amount: a.amount,
      kind: 'adjustment',
      description: a.note,
      sourceId: a.id,
    })
  }

  // Guardar/Resgatar de caixinha (§4).
  for (const bt of data.boxTransfers) {
    if (bt.bankId !== bankId) continue
    const boxName = data.boxes.find((b) => b.id === bt.boxId)?.name ?? 'caixinha removida'
    out.push({
      id: `box-${bt.id}`,
      date: bt.date,
      bankId,
      amount: bt.direction === 'in' ? -bt.amount : bt.amount,
      kind: bt.direction === 'in' ? 'box-in' : 'box-out',
      description: bt.direction === 'in' ? `Guardado em ${boxName}` : `Resgatado de ${boxName}`,
      sourceId: bt.id,
    })
  }

  // Aporte com conta de origem (§5).
  for (const c of data.contributions) {
    if (c.fromBankId !== bankId) continue
    const invName = data.investments.find((i) => i.id === c.investmentId)?.name ?? 'aplicação removida'
    out.push({
      id: `contribution-${c.id}`,
      date: c.date,
      bankId,
      amount: -c.amount,
      kind: 'contribution',
      description: `Aporte em ${invName}`,
      sourceId: c.id,
    })
  }

  /**
   * O saldo inicial precisa ser SEMPRE o movimento mais antigo — é a definição
   * dele: o que havia na conta antes de tudo que o app conhece. Datá-lo em
   * `meta.createdAt` e confiar não funciona: o usuário pode lançar um gasto
   * retroativo (o campo de data é livre), que então ordenaria ANTES do saldo
   * inicial e faria a coluna de saldo corrido exibir números que nunca
   * existiram — bem na tela cujo trabalho é denunciar quando a conta não fecha.
   * Por isso a data é o mínimo entre `createdAt` e o movimento mais antigo.
   */
  let earliest = data.meta.createdAt
  for (const m of out) if (m.date < earliest) earliest = m.date
  out.push({
    id: `opening-${bank.id}`,
    date: earliest,
    bankId: bank.id,
    amount: bank.openingBalance,
    kind: 'opening',
    description: 'Saldo inicial',
    sourceId: bank.id,
  })

  // Mais recente primeiro; empate desempatado pelo id para a ordem ser estável
  // (dois movimentos do mesmo dia não podem trocar de lugar entre renders).
  // O saldo inicial tem de ficar por ÚLTIMO mesmo empatando na data: o id
  // "opening-…" não garante isso, então ele é tratado à parte.
  out.sort((x, y) => {
    if (x.kind === 'opening') return 1
    if (y.kind === 'opening') return -1
    return x.date === y.date ? x.id.localeCompare(y.id) : y.date.localeCompare(x.date)
  })
  return out
}

/**
 * Saldo somado de TODAS as contas ao fim de cada mês da janela (R4 §3).
 *
 * Existe porque a R4 tornou falsa a premissa que o app carregava desde a v2 —
 * "saldo em conta não tem histórico, então repete-se o de hoje em todos os
 * meses". Agora todo movimento é datado, e o passado é derivável. Sem isto, o
 * sparkline de patrimônio embutia o saldo de HOJE em janeiro (superestimando o
 * passado) e a variação do hero ficava **cega ao salário**: `total` e
 * `prevTotal` carregavam o mesmo saldo, então só o investido variava.
 *
 * Custo: uma passada por array + uma pelos meses (prefix-sum), não uma varredura
 * por mês.
 */
export function accountBalanceSeries(data: ZentData, months: readonly Ym[]): number[] {
  const opening = data.banks.reduce((a, b) => a + b.openingBalance, 0)
  const known = new Set(data.banks.map((b) => b.id))

  // mês → delta do mês (só movimentos de contas que ainda existem)
  const deltas = new Map<Ym, number>()
  const add = (bankId: string | null, date: string, amount: number): void => {
    if (bankId === null || !known.has(bankId)) return
    const m = ymOfDate(date)
    deltas.set(m, (deltas.get(m) ?? 0) + amount)
  }
  for (const c of data.salaryCredits) add(c.bankId, c.date, c.amount)
  for (const e of data.extraIncomes) add(e.receivedIn, e.date, e.amount)
  for (const e of data.expenses) {
    if (e.origin?.kind === 'bank') add(e.origin.bankId, e.date, -e.amount)
  }
  for (const t of data.transfers) {
    // transferência entre contas não muda o TOTAL — mas se uma das pontas foi
    // excluída, a outra ponta muda, e é isso que estas duas linhas capturam
    add(t.fromBankId, t.date, -t.amount)
    add(t.toBankId, t.date, t.amount)
  }
  for (const p of data.invoicePayments) add(p.bankId, p.date, -p.amount)
  for (const a of data.adjustments) add(a.bankId, a.date, a.amount)
  for (const bt of data.boxTransfers) add(bt.bankId, bt.date, bt.direction === 'in' ? -bt.amount : bt.amount)
  for (const c of data.contributions) add(c.fromBankId, c.date, -c.amount)

  // Tudo que aconteceu ANTES da janela já está embutido no primeiro ponto.
  const first = months[0]
  if (first === undefined) return []
  let running = opening
  for (const [m, delta] of deltas) if (ymCompare(m, first) < 0) running += delta

  return months.map((m) => {
    running += deltas.get(m) ?? 0
    return running
  })
}

/**
 * Data do crédito do salário de um mês: o dia configurado, limitado ao último
 * dia do mês — mesma regra do dia 31 das recorrências (fev → 28/29).
 */
export function salaryCreditDate(ym: Ym, payDay: number): string {
  const day = Math.min(payDay, daysInYm(ym))
  return `${ym}-${String(day).padStart(2, '0')}`
}

export interface MaterializedSalary {
  credits: Omit<SalaryCredit, 'id'>[]
  /** Novo `meta.lastSalaryCreditYm`, ou o antigo se nada foi creditado. */
  lastYm: Ym | null
}

/**
 * Créditos de salário a lançar (R4 §1.1) — pura: o chamador cria os ids e persiste.
 *
 * Regras, todas com um porquê:
 * - **Sem conta vinculada ou com `autoCredit` desligado, não faz nada.** É o que
 *   preserva o app de quem não quer ledger (§1.6) e o que faz o modo
 *   "Confirmar recebimento" ser de fato manual.
 * - **Nunca credita antes do dia.** Chegou num mês cujo dia de pagamento ainda
 *   não veio → para ali, sem avançar o marcador, e credita quando o dia chegar.
 * - **Não inventa passado.** Na primeira vez (marcador null) começa no mês
 *   corrente; meses anteriores à configuração jamais são creditados — o saldo
 *   que o usuário digitou já os embute, e creditá-los contaria em dobro.
 * - **O marcador só avança para meses efetivamente creditados**, e é ele (não a
 *   existência do crédito) que faz o "Desfazer" grudar: apagado o crédito, o
 *   mês já está marcado como processado e não volta no próximo boot.
 * - **Mês sem salário vigente é pulado** sem consumir o marcador.
 */
export function materializeSalaryCredits(data: ZentData, todayIsoStr: string): MaterializedSalary {
  const { bankId, payDay, autoCredit } = data.salaryConfig
  const marker = data.meta.lastSalaryCreditYm
  if (bankId === null || !autoCredit) return { credits: [], lastYm: marker }
  if (!data.banks.some((b) => b.id === bankId)) return { credits: [], lastYm: marker }

  const today = ymOfDate(todayIsoStr)
  const credited = new Set(data.salaryCredits.map((c) => c.ym))
  const credits: Omit<SalaryCredit, 'id'>[] = []
  let lastYm = marker

  let ym = marker === null ? today : addMonths(marker, 1)
  while (ymCompare(ym, today) <= 0) {
    const date = salaryCreditDate(ym, payDay)
    if (date > todayIsoStr) break // o dia ainda não chegou — volta quando chegar
    const amount = salaryForYm(data.salaryHistory, ym)
    if (amount > 0 && !credited.has(ym)) {
      credits.push({ ym, date, bankId, amount })
      lastYm = ym
    }
    ym = addMonths(ym, 1)
  }

  return { credits, lastYm }
}

/**
 * Meses cujo salário já venceu e ainda não foi creditado — a fila do modo
 * "Confirmar recebimento" (`autoCredit: false`). Mesmas regras de data e de
 * não-inventar-passado do automático; só o gatilho muda (o clique do usuário).
 */
export function pendingSalaryCredits(data: ZentData, todayIsoStr: string): Ym[] {
  const { bankId, payDay, autoCredit } = data.salaryConfig
  if (bankId === null || autoCredit) return []
  // Mesma guarda do automático: sem a conta, não há onde creditar. Sem ela, o
  // banner ofereceria "Confirmar recebimento" numa conta que não existe mais.
  if (!data.banks.some((b) => b.id === bankId)) return []
  const today = ymOfDate(todayIsoStr)
  const credited = new Set(data.salaryCredits.map((c) => c.ym))
  const out: Ym[] = []
  let ym = data.meta.lastSalaryCreditYm === null ? today : addMonths(data.meta.lastSalaryCreditYm, 1)
  while (ymCompare(ym, today) <= 0) {
    if (salaryCreditDate(ym, payDay) > todayIsoStr) break
    if (!credited.has(ym) && salaryForYm(data.salaryHistory, ym) > 0) out.push(ym)
    ym = addMonths(ym, 1)
  }
  return out
}
