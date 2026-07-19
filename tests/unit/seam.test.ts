import { describe, expect, it } from 'vitest'
import { LOCK_DISABLED_ARG, readLockDisabledArg, resolveLockDisabled } from '../../electron/seam'

/**
 * Guarda de produção do seam de teste (M3). O bypass `ZENT_NO_LOCK=1` da tela de
 * bloqueio só pode existir em dev/test. No app EMPACOTADO, nenhuma variável de
 * ambiente pode destravar o bloqueio — provado aqui.
 */
describe('seam ZENT_NO_LOCK — guarda de produção', () => {
  it('NÃO empacotado: honra ZENT_NO_LOCK=1', () => {
    expect(resolveLockDisabled(false, '1')).toBe(true)
  })

  it('NÃO empacotado: qualquer valor != "1" mantém o bloqueio', () => {
    expect(resolveLockDisabled(false, undefined)).toBe(false)
    expect(resolveLockDisabled(false, '0')).toBe(false)
    expect(resolveLockDisabled(false, 'true')).toBe(false)
    expect(resolveLockDisabled(false, '')).toBe(false)
  })

  it('EMPACOTADO (produção): ignora ZENT_NO_LOCK em qualquer valor', () => {
    // O ponto central do milestone: no build instalado o seam é inerte.
    expect(resolveLockDisabled(true, '1')).toBe(false)
    expect(resolveLockDisabled(true, 'true')).toBe(false)
    expect(resolveLockDisabled(true, undefined)).toBe(false)
  })

  it('preload lê o booleano resolvido do argv, não o ambiente', () => {
    expect(readLockDisabledArg([`${LOCK_DISABLED_ARG}true`])).toBe(true)
    expect(readLockDisabledArg([`${LOCK_DISABLED_ARG}false`])).toBe(false)
    expect(readLockDisabledArg(['--outra-flag', 'x'])).toBe(false)
    expect(readLockDisabledArg([])).toBe(false)
  })

  it('a ponta a ponta: empacotado + env=1 + argv resolvido = bloqueado', () => {
    // main resolve → argv → preload lê. Empacotado corta na origem.
    const resolved = resolveLockDisabled(true, '1')
    expect(readLockDisabledArg([`${LOCK_DISABLED_ARG}${String(resolved)}`])).toBe(false)
  })
})
