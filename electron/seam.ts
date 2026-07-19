/**
 * Seam de teste `ZENT_NO_LOCK` — guarda de produção (M3).
 *
 * O bypass da tela de bloqueio existe para perf/screenshots dirigirem a UI sem o
 * atrito do PIN. Ele NUNCA pode existir no app que o usuário instala: no build
 * empacotado, nenhuma variável de ambiente pode destravar o bloqueio (senão
 * qualquer um lançaria o app com `ZENT_NO_LOCK=1` e pularia o PIN).
 *
 * A decisão é resolvida no processo MAIN, único que conhece `app.isPackaged`, e
 * enviada ao preload já como booleano. Esta função pura encapsula a regra para
 * ser testável sem Electron.
 */
export function resolveLockDisabled(isPackaged: boolean, envValue: string | undefined): boolean {
  // Empacotado (produção) → o seam é IGNORADO, aconteça o que acontecer no env.
  if (isPackaged) return false
  return envValue === '1'
}

/** Flag passado ao preload via `additionalArguments`. */
export const LOCK_DISABLED_ARG = '--zent-lock-disabled='

/** Lê o argumento resolvido pelo main a partir do `process.argv` do preload. */
export function readLockDisabledArg(argv: readonly string[]): boolean {
  const arg = argv.find((a) => a.startsWith(LOCK_DISABLED_ARG))
  return arg?.slice(LOCK_DISABLED_ARG.length) === 'true'
}
