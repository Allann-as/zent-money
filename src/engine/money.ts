/**
 * Dinheiro no Zent Money é SEMPRE inteiro em centavos.
 * Este módulo é puro (sem IO/React) e coberto por testes unitários.
 */

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const brlNoSymbol = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 123456 → "R$ 1.234,56" */
export function formatBRL(centavos: number): string {
  return brl.format(centavos / 100)
}

/** 123456 → "1.234,56" (sem símbolo, para inputs e labels densos) */
export function formatMoneyPlain(centavos: number): string {
  return brlNoSymbol.format(centavos / 100)
}

/**
 * Formato compacto para containers apertados: 123456 → "R$ 1,2 mil".
 *
 * Escala até BILHÕES (R$ 1,2 bi) porque o app tem de aguentar magnitudes que
 * não cabem em nenhum miolo de rosca — sem o degrau de bilhão, um patrimônio
 * de nove dígitos vira "R$ 1.234,5 mi", que é mais largo que o valor exato e
 * some com a razão de existir do compacto.
 *
 * ── ONDE ISTO É PROIBIDO ────────────────────────────────────────────────
 * Campos de formulário e MoneyInput, listas de lançamentos, histórico da
 * conta, saldo em edição, faturas, valores de parcela — qualquer lugar onde o
 * usuário confere um centavo. Compactar é a única etapa da cascata que PERDE
 * informação. Onde ela acontece, o valor exato tem de continuar disponível no
 * `title` e no `aria-label`.
 */
export function formatBRLCompact(centavos: number): string {
  const v = centavos / 100
  const abs = Math.abs(v)
  if (abs < 1_000) return brl.format(v)

  /**
   * A unidade é escolhida pelo valor JÁ ARREDONDADO, não pelo bruto.
   *
   * Escolhendo pelo bruto, R$ 999.999.999,99 caía no degrau de milhão e virava
   * "R$ 1.000 mi": mais largo que o necessário, e lendo como mil milhões em vez
   * de um bilhão. Como arredondar para uma casa pode empurrar o número para
   * 1.000, a checagem tem de acontecer DEPOIS de arredondar — e aí subir de
   * degrau. Compactar que produz string mais longa perdeu a razão de existir.
   */
  const UNITS = [
    { div: 1_000, suffix: 'mil' },
    { div: 1_000_000, suffix: 'mi' },
    { div: 1_000_000_000, suffix: 'bi' },
  ]
  let chosen = UNITS[0]!
  for (const unit of UNITS) {
    if (abs >= unit.div) chosen = unit
  }
  let scaled = v / chosen.div
  const next = UNITS[UNITS.indexOf(chosen) + 1]
  if (Math.abs(Number(scaled.toFixed(1))) >= 1_000 && next !== undefined) {
    chosen = next
    scaled = v / chosen.div
  }
  return `R$ ${scaled.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${chosen.suffix}`
}

/**
 * Converte texto digitado em centavos. Aceita formato brasileiro e americano:
 *   "1.234,56" → 123456   ·   "1234.56" → 123456   ·   "1234" → 123400
 * Heurística para separador único:
 *   - só vírgula → decimal ("12,5" → 1250)
 *   - só ponto com 1–2 dígitos depois → decimal ("12.5" → 1250)
 *   - só ponto com 3 dígitos depois (e padrão de milhar) → milhar ("1.234" → 123400)
 * Retorna null para entrada inválida.
 */
export function parseMoney(input: string): number | null {
  let s = input.trim()
  if (s === '') return null
  s = s.replace(/^R\$\s*/i, '')
  let negative = false
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1).trim()
  }
  if (!/^[\d.,\s]+$/.test(s)) return null
  s = s.replace(/\s/g, '')
  if (s === '') return null

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let integerPart: string
  let fractionPart: string

  if (lastComma !== -1 && lastDot !== -1) {
    // Os dois presentes: o ÚLTIMO separador é o decimal.
    const sep = Math.max(lastComma, lastDot)
    integerPart = s.slice(0, sep).replace(/[.,]/g, '')
    fractionPart = s.slice(sep + 1)
  } else if (lastComma !== -1) {
    // Só vírgula: decimal (múltiplas vírgulas = inválido)
    if (s.indexOf(',') !== lastComma) return null
    integerPart = s.slice(0, lastComma)
    fractionPart = s.slice(lastComma + 1)
  } else if (lastDot !== -1) {
    const after = s.slice(lastDot + 1)
    const multipleDots = s.indexOf('.') !== lastDot
    if (multipleDots || (after.length === 3 && /^\d{1,3}(\.\d{3})+$/.test(s))) {
      // padrão de milhar: 1.234 / 1.234.567
      if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return null
      integerPart = s.replace(/\./g, '')
      fractionPart = ''
    } else {
      integerPart = s.slice(0, lastDot)
      fractionPart = after
    }
  } else {
    integerPart = s
    fractionPart = ''
  }

  if (integerPart === '' && fractionPart === '') return null
  if (!/^\d*$/.test(integerPart) || !/^\d*$/.test(fractionPart)) return null
  if (fractionPart.length > 2) return null

  const cents =
    Number(integerPart || '0') * 100 + Number((fractionPart || '0').padEnd(2, '0').slice(0, 2))
  if (!Number.isSafeInteger(cents)) return null
  return negative ? -cents : cents
}

/** Percentual pt-BR: 0.1234 → "12,34%" (frac = casas decimais). */
export function formatPercent(ratio: number, frac = 1): string {
  return `${(ratio * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  })}%`
}
