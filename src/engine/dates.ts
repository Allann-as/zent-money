/**
 * Motor de datas do Zent Money — aritmética de meses pura sobre strings.
 * `Ym` = "YYYY-MM" · datas completas = "YYYY-MM-DD" (ISO).
 * Testado para funcionar corretamente até 2100 (viradas de ano inclusas).
 */

export type Ym = string // "YYYY-MM"

/** Data local de hoje em ISO (YYYY-MM-DD) — sem UTC para não virar o dia errado. */
export function todayIso(now: Date = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${mm}-${dd}`
}

/** "2026-07-16" → "2026-07" */
export function ymOfDate(isoDate: string): Ym {
  return isoDate.slice(0, 7)
}

/** Ym do mês corrente. */
export function currentYm(now: Date = new Date()): Ym {
  return ymOfDate(todayIso(now))
}

/** "2026-07" → índice absoluto de mês (2026*12 + 6). Base da aritmética. */
export function ymToIndex(ym: Ym): number {
  const year = Number(ym.slice(0, 4))
  const month = Number(ym.slice(5, 7))
  return year * 12 + (month - 1)
}

/** Inverso de ymToIndex. */
export function indexToYm(index: number): Ym {
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

/** Soma (ou subtrai) meses a um Ym: addMonths("2099-12", 1) → "2100-01". */
export function addMonths(ym: Ym, delta: number): Ym {
  return indexToYm(ymToIndex(ym) + delta)
}

/** Diferença em meses: diffMonths("2026-01", "2026-07") = 6. */
export function diffMonths(from: Ym, to: Ym): number {
  return ymToIndex(to) - ymToIndex(from)
}

/** Compara Ym cronologicamente (strings ISO ordenam naturalmente). */
export function ymCompare(a: Ym, b: Ym): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Janela móvel: os últimos `n` meses TERMINANDO em `end` (inclusive). */
export function lastMonths(end: Ym, n: number): Ym[] {
  const endIdx = ymToIndex(end)
  const out: Ym[] = []
  for (let i = n - 1; i >= 0; i--) out.push(indexToYm(endIdx - i))
  return out
}

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const

const MONTHS_PT_SHORT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
] as const

const WEEKDAYS_PT = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado',
] as const

/** "2026-07" → "julho de 2026" */
export function formatYmLong(ym: Ym): string {
  const month = MONTHS_PT[Number(ym.slice(5, 7)) - 1] ?? ''
  return `${month} de ${ym.slice(0, 4)}`
}

/** "2026-07" → "jul/2026" */
export function formatYmShort(ym: Ym): string {
  const month = MONTHS_PT_SHORT[Number(ym.slice(5, 7)) - 1] ?? ''
  return `${month}/${ym.slice(0, 4)}`
}

/** "2026-07" → "jul" */
export function formatYmTiny(ym: Ym): string {
  return MONTHS_PT_SHORT[Number(ym.slice(5, 7)) - 1] ?? ''
}

/** Data de hoje por extenso: "quarta-feira, 16 de julho de 2026". */
export function formatTodayLong(now: Date = new Date()): string {
  const weekday = WEEKDAYS_PT[now.getDay()] ?? ''
  const month = MONTHS_PT[now.getMonth()] ?? ''
  return `${weekday}, ${now.getDate()} de ${month} de ${now.getFullYear()}`
}

/** "2026-07-16" → "16/07/2026" */
export function formatDateBR(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

/** "2026-07-16" → "16 jul" */
export function formatDateShort(isoDate: string): string {
  const day = Number(isoDate.slice(8, 10))
  return `${day} ${formatYmTiny(ymOfDate(isoDate))}`
}

/** Dias no mês de um Ym (regra de bissexto correta até 2100+). */
export function daysInYm(ym: Ym): number {
  const year = Number(ym.slice(0, 4))
  const month = Number(ym.slice(5, 7))
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return leap ? 29 : 28
  }
  return lengths[month - 1] ?? 30
}

/** Diferença em dias entre duas datas ISO (b − a). */
export function diffDays(aIso: string, bIso: string): number {
  const a = Date.UTC(Number(aIso.slice(0, 4)), Number(aIso.slice(5, 7)) - 1, Number(aIso.slice(8, 10)))
  const b = Date.UTC(Number(bIso.slice(0, 4)), Number(bIso.slice(5, 7)) - 1, Number(bIso.slice(8, 10)))
  return Math.round((b - a) / 86_400_000)
}

/** Soma (ou subtrai) dias a uma data ISO, via UTC para não pular por fuso. */
export function addDaysIso(iso: string, delta: number): string {
  const t = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
  const d = new Date(t + delta * 86_400_000)
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${mm}-${dd}`
}

/**
 * Dia da semana de uma data ISO (0 = domingo … 6 = sábado), via UTC — o mesmo
 * critério de `addDaysIso`, para não divergir por fuso.
 */
export function weekdayOfIso(iso: string): number {
  const t = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
  return new Date(t).getUTCDay()
}

/** Segunda-feira da semana que contém `iso` (semana Seg→Dom da fita "Hoje"). */
export function mondayOfIso(iso: string): string {
  const wd = weekdayOfIso(iso) // 0=dom … 6=sáb
  const backToMonday = wd === 0 ? 6 : wd - 1
  return addDaysIso(iso, -backToMonday)
}

const WEEKDAYS_PT_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

/** Rótulo curto do dia da semana de uma data ISO: "Seg", "Ter"… */
export function weekdayShort(iso: string): string {
  return WEEKDAYS_PT_SHORT[weekdayOfIso(iso)] ?? ''
}
