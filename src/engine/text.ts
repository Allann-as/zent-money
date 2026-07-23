/**
 * ═══════════════════════════════════════════════════════════════════════
 * CONCORDÂNCIA POR NÚMERO — frases geradas por template
 * ═══════════════════════════════════════════════════════════════════════
 *
 * O app monta muita frase com contagem, e o erro clássico é pluralizar só o
 * SUBSTANTIVO e esquecer o adjetivo ou o verbo: "1 mês **seguidos**",
 * "**Faltam** 1 parcela". Estas duas funções existem para que a unidade de
 * concordância seja a EXPRESSÃO INTEIRA, não a palavra solta — quem escreve o
 * template passa "mês seguido"/"meses seguidos" e não tem como esquecer metade.
 */

/**
 * Número + expressão concordando: `counted(1, 'mês seguido', 'meses seguidos')`
 * → "1 mês seguido"; com 3 → "3 meses seguidos".
 *
 * A expressão vai inteira (substantivo + adjetivo) de propósito: é o que impede
 * o "1 mês seguidos" de nascer de novo.
 */
export function counted(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/**
 * Verbo que concorda com a contagem: `verbFor(1, 'Falta', 'Faltam')` → "Falta".
 * Separado de `counted` porque o verbo costuma vir ANTES do número na frase
 * ("Faltam 3 parcelas"), então não dá para embutir os dois numa string só.
 */
export function verbFor(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural
}
