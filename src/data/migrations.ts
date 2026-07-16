import { DATA_VERSION } from './schema'

/**
 * Sistema de migrações do arquivo de dados.
 * Cada função em `MIGRATIONS[n]` converte a versão n para n+1.
 * `migrate` aplica em cadeia até DATA_VERSION; a validação Zod
 * acontece DEPOIS, em persistence.ts.
 */
type RawData = Record<string, unknown>

/** Emojis da era v2 das caixinhas → chaves de ícone SVG (v3). */
const BOX_EMOJI_TO_ICON: Record<string, string> = {
  '🛟': 'lifebuoy',
  '🏖️': 'umbrella',
  '✈️': 'plane',
  '🏠': 'home',
  '🚗': 'car',
  '🎓': 'gradcap',
  '💻': 'laptop',
  '📱': 'phone',
  '🎸': 'music',
  '💍': 'gem',
  '🐶': 'paw',
  '🎁': 'gift',
  '🩺': 'health',
  '🎮': 'gamepad',
  '📷': 'camera',
  '⚽': 'target',
}

const MIGRATIONS: Record<number, (data: RawData) => RawData> = {
  // v3 → v4: parcelas avulsas. As compras existentes nasceram todas vinculadas a um
  // cartão e assim permanecem (cardId intacto); só ganham `creditor: null`.
  3: (data) => {
    const purchases = Array.isArray(data['purchases'])
      ? (data['purchases'] as RawData[]).map((p) => ({ creditor: null, ...p }))
      : []
    return { ...data, version: 4, purchases }
  },
  // v2 → v3: caixinhas trocam emoji por chave de ícone SVG
  2: (data) => {
    const boxes = Array.isArray(data['boxes'])
      ? (data['boxes'] as RawData[]).map((box) => {
          const { emoji, ...rest } = box as RawData & { emoji?: unknown }
          const icon =
            typeof emoji === 'string' && BOX_EMOJI_TO_ICON[emoji]
              ? BOX_EMOJI_TO_ICON[emoji]
              : 'target'
          return { ...rest, icon }
        })
      : []
    return { ...data, version: 3, boxes }
  },
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
