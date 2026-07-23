import { DATA_VERSION } from './schema'

/**
 * Sistema de migrações do arquivo de dados.
 * Cada função em `MIGRATIONS[n]` converte a versão n para n+1.
 * `migrate` aplica em cadeia até DATA_VERSION; a validação Zod
 * acontece DEPOIS, em persistence.ts.
 */
type RawData = Record<string, unknown>

/**
 * Acentos de UI dos dois BTG (v5). Literais aqui de propósito: uma migração
 * descreve o passado e não pode mudar de resultado quando o seed evoluir.
 * A distinção visual entre os dois é o LOGO (invertido), não estas cores.
 */
const BTG_BANKING_ACCENT = '#2C5EA9'
const BTG_INVEST_ACCENT = '#0A2540'

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
  // v10 → v11: ícones das caixinhas v2 (R10 §⑤). Câmera, música e pet saíram do
  // set e o cadeado virou o cofre novo — sem esta migração, uma caixinha que
  // usasse uma chave aposentada cairia no fallback e o seletor abriria sem nada
  // marcado. O mapa vive em `design/BoxIcon` (fonte única com o registro), mas é
  // COPIADO aqui de propósito: uma migração descreve o passado e não pode mudar
  // de resultado quando o set evoluir de novo (mesma disciplina dos hex do BTG).
  10: (data) => {
    const retired: Record<string, string> = {
      camera: 'gift',
      music: 'gift',
      paw: 'health',
      lock: 'safe',
    }
    const boxes = Array.isArray(data['boxes'])
      ? (data['boxes'] as RawData[]).map((b) => {
          const icon = typeof b['icon'] === 'string' ? b['icon'] : 'target'
          return { ...b, icon: retired[icon] ?? icon }
        })
      : []
    return { ...data, version: 11, boxes }
  },
  // v9 → v10: Guardar/Resgatar de caixinhas (§4) e aporte com conta de origem
  // (§5). `boxTransfers` nasce vazio e cada aporte antigo ganha `fromBankId: null`
  // — sem vínculo, não debita conta nenhuma, então o saldo derivado de quem já
  // usa o app fica idêntico (retrocompatível, como toda migração desta linhagem).
  9: (data) => {
    const contributions = Array.isArray(data['contributions'])
      ? (data['contributions'] as RawData[]).map((c) => ({ fromBankId: null, ...c }))
      : []
    return { ...data, version: 10, boxTransfers: [], contributions }
  },
  // v8 → v9: gamificação sóbria (M4). Nasce vazia; `gamificationOnboarded: false`
  // faz o 1º boot avaliar as conquistas retroativas EM SILÊNCIO (sem toasts).
  // Score e streak são derivados — não há nada a migrar deles.
  8: (data) => {
    const meta =
      typeof data['meta'] === 'object' && data['meta'] !== null
        ? { ...(data['meta'] as RawData), gamificationOnboarded: false }
        : { gamificationOnboarded: false }
    return {
      ...data,
      version: 9,
      gamification: { achievements: [], activeChallenge: null, challengeHistory: [] },
      meta,
    }
  },
  // v7 → v8: realocação de orçamento entre categorias (M1 §c). Nasce vazia — quem
  // nunca realocar tem o limite EFETIVO idêntico ao base, e o app segue idêntico.
  7: (data) => ({ ...data, version: 8, budgetReallocations: [] }),
  // v6 → v7: ledger híbrido (R4 §1). O saldo digitado de cada banco vira o PONTO
  // DE PARTIDA (`openingBalance`) e o saldo exibido passa a ser derivado dele mais
  // os movimentos. Como todos os arrays de movimento nascem vazios, o saldo
  // derivado de quem já usa o app é idêntico ao que ele via ontem — só que agora
  // com um histórico que explica de onde veio.
  6: (data) => {
    const banks = Array.isArray(data['banks'])
      ? (data['banks'] as RawData[]).map((b) => {
          const { balance, ...rest } = b as RawData & { balance?: unknown }
          return { ...rest, openingBalance: typeof balance === 'number' ? balance : 0 }
        })
      : []
    const extraIncomes = Array.isArray(data['extraIncomes'])
      ? (data['extraIncomes'] as RawData[]).map((e) => ({ receivedIn: null, ...e }))
      : []
    const rawRates = typeof data['rates'] === 'object' && data['rates'] !== null ? (data['rates'] as RawData) : {}
    const meta =
      typeof data['meta'] === 'object' && data['meta'] !== null
        ? { ...(data['meta'] as RawData), lastSalaryCreditYm: null }
        : { lastSalaryCreditYm: null }
    return {
      ...data,
      version: 7,
      banks,
      extraIncomes,
      // Sem conta vinculada, nada é creditado: quem não configurar segue como antes.
      salaryConfig: { bankId: null, payDay: 5, autoCredit: true },
      salaryCredits: [],
      transfers: [],
      adjustments: [],
      invoicePayments: [],
      rates: {
        ...rawRates,
        autoUpdate: true,
        // As taxas atuais vieram da mão do usuário (ou do seed) — nunca do automático.
        lastAutoAt: null,
        overrides: { selic: false, cdi: false, ipca: false },
      },
      meta,
    }
  },
  // v5 → v6: campo "Pago com" nos gastos (R3 §3.4). Gastos antigos ficam sem
  // origem — o campo é opcional e tudo continua funcionando sem ele.
  5: (data) => {
    const expenses = Array.isArray(data['expenses'])
      ? (data['expenses'] as RawData[]).map((e) => ({ origin: null, ...e }))
      : []
    return { ...data, version: 6, expenses }
  },
  // v4 → v5: BTG vira dois bancos distintos (R3 §3.1).
  // O "BTG" existente VIRA "BTG Banking" mantendo o mesmo id — assim cartões,
  // ativos e parcelas continuam apontando para ele e nada é perdido. "BTG
  // Investimentos" nasce vazio ao lado. Quem já tem os dois (seed da R2) não muda.
  4: (data) => {
    const banks = Array.isArray(data['banks']) ? [...(data['banks'] as RawData[])] : []
    const nameOf = (b: RawData): string => (typeof b['name'] === 'string' ? b['name'] : '')
    const norm = (s: string): string =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '')

    const legacy = banks.find((b) => norm(nameOf(b)) === 'btg')
    if (legacy) {
      legacy['name'] = 'BTG Banking'
      legacy['color'] = BTG_BANKING_ACCENT
    }

    const hasInvestimentos = banks.some((b) => norm(nameOf(b)) === 'btginvestimentos')
    if (legacy && !hasInvestimentos) {
      banks.push({
        id: `btg-inv-${String(legacy['id'] ?? 'x')}`,
        name: 'BTG Investimentos',
        color: BTG_INVEST_ACCENT,
        balance: 0,
      })
    }
    return { ...data, version: 5, banks }
  },
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
