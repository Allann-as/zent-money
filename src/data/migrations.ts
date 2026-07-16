import { DATA_VERSION } from './schema'

/**
 * Sistema de migrações do arquivo de dados.
 * Cada função em `MIGRATIONS[n]` converte a versão n para n+1.
 * `migrate` aplica em cadeia até DATA_VERSION; a validação Zod
 * acontece DEPOIS, em persistence.ts.
 */
type RawData = Record<string, unknown>

const MIGRATIONS: Record<number, (data: RawData) => RawData> = {
  // v1 → v2: ativos manuais (valueUpdates) + recorrências
  1: (data) => {
    const investments = Array.isArray(data['investments'])
      ? (data['investments'] as RawData[]).map((inv) => ({ valueUpdates: [], ...inv }))
      : []
    const meta =
      typeof data['meta'] === 'object' && data['meta'] !== null
        ? { ...(data['meta'] as RawData), lastRecurringYm: null }
        : { lastRecurringYm: null }
    return {
      ...data,
      version: 2,
      investments,
      recurringExpenses: [],
      recurringIncomes: [],
      meta,
    }
  },
}

export function migrate(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Arquivo de dados inválido: não é um objeto JSON')
  }
  let data = input as RawData
  let version = typeof data['version'] === 'number' ? (data['version'] as number) : 0
  if (version === 0) {
    throw new Error('Arquivo de dados sem campo "version"')
  }
  if (version > DATA_VERSION) {
    throw new Error(
      `Arquivo de dados da versão ${version} é mais novo que este app (v${DATA_VERSION}). Atualize o Zent Money.`,
    )
  }
  while (version < DATA_VERSION) {
    const step = MIGRATIONS[version]
    if (!step) throw new Error(`Migração da versão ${version} não encontrada`)
    data = step(data)
    version = data['version'] as number
  }
  return data
}
