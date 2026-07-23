/**
 * Throttling progressivo do PIN (M2 §b) — a MATEMÁTICA pura, sem Electron nem
 * relógio, para ser testável (como `seam.ts`).
 *
 * Após esgotar as tentativas livres, cada erro dobra a espera até um teto. O
 * estado (quantas falhas, até quando está travado) mora no `pin.ts`, que chama
 * estas funções; aqui não há efeito colateral nenhum.
 */

export const FREE_ATTEMPTS = 5
export const MAX_DELAY_MS = 30_000

/**
 * Atraso após o n-ésimo erro: 0 enquanto há tentativas livres, depois 1s, 2s,
 * 4s… dobrando até o teto de 30s. `fails` é a contagem ACUMULADA de erros.
 */
export function delayForFails(fails: number): number {
  if (fails < FREE_ATTEMPTS) return 0
  return Math.min(MAX_DELAY_MS, 1000 * 2 ** (fails - FREE_ATTEMPTS))
}

/** Tentativas ainda livres antes de o atraso começar (nunca negativo). */
export function attemptsLeftFor(fails: number): number {
  return Math.max(0, FREE_ATTEMPTS - fails)
}
