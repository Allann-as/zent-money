import { useDataStore } from './dataStore'
import { useSecurityStore } from './securityStore'
import { useUiStore } from './uiStore'
import { addExpense } from './mutations'
import { todayIso } from '@/engine/dates'
import { newId } from '@/lib/id'
import type { Expense } from '@/data/schema'
import type { QuickDataDTO, QuickExpenseDTO } from '../../electron/ipc-api'

/**
 * Monta o `Expense` de um lançamento rápido (pura, testável). Data = hoje;
 * essential = true (o quick não pergunta Necessário×Supérfluo — o mais comum é
 * "necessário", e dá para reclassificar depois na lista de Gastos).
 */
export function buildQuickExpense(payload: QuickExpenseDTO, id: string, date: string): Expense {
  return {
    id,
    date,
    categoryId: payload.categoryId,
    description: payload.description,
    amount: payload.amount,
    essential: true,
    origin: payload.origin,
  }
}

/**
 * Ponte da bandeja (M5). Vive SÓ no renderer principal (a janela do app). A
 * mini-janela não tem store: ela manda o gasto pelo main, que o encaminha para
 * cá — assim há UMA fonte de dados (o `dataStore`), sem race de escrita entre as
 * duas janelas, e o gasto rápido reflete na hora no mês e no saldo da origem.
 */

/** Aplica um gasto vindo da mini no store real (mesma persistência e conquistas). */
export function applyQuickExpense(payload: QuickExpenseDTO): void {
  useDataStore.getState().mutate((d) => {
    addExpense(d, buildQuickExpense(payload, newId(), todayIso()))
  })
}

/** Fatia mínima que a mini precisa para os selects. */
function quickDataSnapshot(): QuickDataDTO {
  const data = useDataStore.getState().data
  if (!data) return { categories: [], banks: [], cards: [] }
  return {
    categories: data.categories.map((c) => ({ id: c.id, name: c.name })),
    banks: data.banks.map((b) => ({ id: b.id, name: b.name })),
    cards: data.cards.map((c) => ({ id: c.id, name: c.name, bankId: c.bankId })),
  }
}

/**
 * Liga a ponte no boot do app e devolve o cleanup. Reporta o estado de bloqueio
 * (fonte da mini), empurra os dados dos selects, aplica gastos da mini e destrava
 * o app quando a mini prova o PIN.
 */
export function wireTrayBridge(): () => void {
  const zent = window.zent

  // A mini aplica gastos aqui (fonte única).
  const offExpense = zent.onQuickExpense(applyQuickExpense)
  // PIN provado na mini → destrava o app inteiro.
  const offUnlock = zent.onAppUnlock(() => useSecurityStore.getState().unlock())

  // Estado de bloqueio: reporta agora e SÓ quando muda (evita IPC redundante).
  let lastLocked: boolean | null = null
  const reportLock = (locked: boolean): void => {
    if (locked !== lastLocked) {
      lastLocked = locked
      zent.reportLockState(locked)
    }
  }
  reportLock(useSecurityStore.getState().locked)
  const offSec = useSecurityStore.subscribe((s) => reportLock(s.locked))

  // Dados dos selects: empurra agora e a cada mudança de dados (snapshot pequeno).
  zent.pushQuickData(quickDataSnapshot())
  const offData = useDataStore.subscribe(() => zent.pushQuickData(quickDataSnapshot()))

  // Preferência "fechar → bandeja": reporta agora e SÓ quando muda (o uiStore
  // muda a cada navegação — não convém disparar IPC toda vez).
  let lastTray: boolean | null = null
  const reportTray = (on: boolean): void => {
    if (on !== lastTray) {
      lastTray = on
      zent.setMinimizeToTray(on)
    }
  }
  reportTray(useUiStore.getState().minimizeToTray)
  const offUi = useUiStore.subscribe((s) => reportTray(s.minimizeToTray))

  return () => {
    offExpense()
    offUnlock()
    offSec()
    offData()
    offUi()
  }
}
