import type { ZentData } from '@/data/schema'
import { bankMovements } from './ledger'
import { todayIso } from './dates'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SUFICIÊNCIA DE SALDO (adendo R10) — o saldo DISPONÍVEL numa data
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Tudo aqui é DERIVADO do ledger (`bankMovements`), nunca um campo gravado — a
 * mesma disciplina do saldo. A regra de dinheiro é uma só, num lugar só, para a
 * UI, a bandeja, o import e qualquer código futuro chamarem a MESMA verdade.
 *
 * ── DUAS FAMÍLIAS DE OPERAÇÃO (ver DECISOES) ────────────────────────────
 * - **Família A** (guardar · aportar · transferir · resgatar): mover o próprio
 *   dinheiro. Não existe mover o que não há → BLOQUEIO DURO na camada de
 *   mutações (`store/mutations.ts`).
 * - **Família B** (gasto com origem em conta · pagamento de fatura): a vida real
 *   permite ficar negativo (cheque especial, saldo desatualizado). Bloquear
 *   forçaria o usuário a NÃO registrar o que aconteceu — o pior resultado num
 *   app de finanças. Então só avisa; a UI confirma e o negativo aparece em coral.
 */

/**
 * Saldo corrido de uma conta AO FIM de `date` (inclusive) — o "saldo naquele
 * dia". Soma os movimentos com data ≤ `date`; o saldo inicial entra porque o
 * `bankMovements` o inclui como o movimento mais antigo.
 */
export function saldoDisponivel(data: ZentData, bankId: string, date: string = todayIso()): number {
  let bal = 0
  for (const m of bankMovements(data, bankId)) {
    if (m.date <= date) bal += m.amount
  }
  return bal
}

/**
 * Menor saldo corrido em QUALQUER dia ≥ `date`. É o teto de um débito datado em
 * `date`: debitar `v` derruba todo dia posterior em `v`, então `v` só é seguro
 * se o menor saldo futuro for ≥ `v`. Para uma operação de hoje (sem movimentos
 * depois) isto colapsa no saldo atual — o caso comum.
 *
 * É o que cobre o lançamento RETROATIVO da Família A: um Guardar numa data
 * passada não pode deixar negativo nem o dia dele nem nenhum dia à frente que o
 * histórico já mostra fechado.
 */
export function menorSaldoDesde(data: ZentData, bankId: string, date: string): number {
  const movs = bankMovements(data, bankId)
    .slice()
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)))
  let bal = 0
  let balAtDate = 0
  let futureMin = Number.POSITIVE_INFINITY
  for (const m of movs) {
    bal += m.amount
    if (m.date <= date) balAtDate = bal
    else futureMin = Math.min(futureMin, bal)
  }
  return Math.min(balAtDate, futureMin)
}

/**
 * A conta aguenta um débito de `valor` datado em `date` sem negativar nenhum
 * dia? Igualdade é permitida (zerar a conta não é erro — caso de borda 1).
 */
export function podeDebitar(data: ZentData, bankId: string, valor: number, date: string): boolean {
  return valor <= menorSaldoDesde(data, bankId, date)
}
