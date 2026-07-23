/**
 * Contrato da bridge exposta ao renderer via preload (window.zent).
 * Este arquivo é a única fonte de verdade do shape da API IPC.
 */
export interface ZentBridge {
  /**
   * true quando `ZENT_NO_LOCK=1` — desliga a tela de bloqueio/primeira execução.
   * Seam SÓ de teste (perf/screenshots dirigem a UI sem o atrito do PIN); jamais
   * ligado no app empacotado. O E2E de segurança NÃO usa isto — ele exercita o
   * fluxo real de definir/confirmar/desbloquear.
   */
  lockDisabled: boolean
  /** Lê o JSON persistido; null se o arquivo ainda não existe. */
  loadData(): Promise<string | null>
  /** Grava o JSON de dados com escrita atômica + backup diário rotativo. */
  saveData(json: string): Promise<void>
  /** Abre "Salvar como" e exporta o JSON atual. Retorna o caminho ou null se cancelado. */
  exportData(json: string, suggestedName: string): Promise<string | null>
  /** Abre "Abrir arquivo" e retorna o conteúdo do JSON escolhido; null se cancelado. */
  importData(): Promise<string | null>
  /** Mapa nome-normalizado → data URL dos logos encontrados em assets/logos/. */
  listLogos(): Promise<Record<string, string>>
  /** Registra callback para mudanças na pasta de logos (retorna unsubscribe). */
  onLogosChanged(cb: (logos: Record<string, string>) => void): () => void
  /** Versão do app (package.json). */
  getVersion(): Promise<string>
  /** Instante ISO do backup mais recente, ou null se ainda não há nenhum. */
  lastBackupAt(): Promise<string | null>
  /**
   * Repinta os botões nativos da janela nas cores do tema (R3): a barra de
   * título é do sistema, então só o processo main consegue mudá-la.
   */
  setTitleBarTheme(color: string, symbolColor: string): Promise<void>
  /**
   * Busca as taxas oficiais na rede (R4 §2) — a ÚNICA conexão do app: dois GET
   * públicos, nada do usuário sai daqui. Roda no main porque o renderer bateria
   * em CORS. Retorna null em qualquer falha (rede fora, formato inesperado,
   * timeout de 5s): o chamador mantém os últimos valores em silêncio.
   */
  fetchRates(): Promise<FetchedRatesDTO | null>
  /** true se já existe um PIN definido (decide primeira execução × bloqueio). */
  hasPin(): Promise<boolean>
  /** Define/troca o PIN (primeira execução). Grava só o hash scrypt + salt. */
  setPin(pin: string): Promise<void>
  /** Verifica o PIN; aplica throttling progressivo no main. */
  verifyPin(pin: string): Promise<PinVerifyDTO>
  /** Troca o PIN exigindo o atual; false se o atual não confere. */
  changePin(current: string, next: string): Promise<boolean>
  /** "Esqueci o PIN": apaga só o PIN (os dados não são tocados). */
  resetPin(): Promise<void>

  // ── Bandeja + lançamento rápido (M5) ──────────────────────────────
  /**
   * Janela do renderer: 'main' (o app) ou 'quick' (a mini-janela da bandeja).
   * Lido do `location.hash` no boot — decide o que montar.
   */
  windowKind: 'main' | 'quick'
  /** [main] Reporta o estado de bloqueio ao processo main (fonte para a mini). */
  reportLockState(locked: boolean): void
  /** [main] Preferência "fechar minimiza para a bandeja". */
  setMinimizeToTray(on: boolean): void
  /** [main] Empurra os dados que a mini precisa (categorias/bancos/cartões). */
  pushQuickData(data: QuickDataDTO): void
  /** [main] Mostra a mini-janela (seam de UI/teste; tray e atalho fazem isto no main). */
  showQuickEntry(): void
  /** [main] Recebe um gasto lançado pela mini e o aplica no store real. */
  onQuickExpense(cb: (payload: QuickExpenseDTO) => void): () => void
  /** [main] A mini provou o PIN: destrava o app principal também. */
  onAppUnlock(cb: () => void): () => void
  /** [quick] O app está bloqueado? (a mini exige PIN antes de exibir qualquer coisa). */
  quickIsLocked(): Promise<boolean>
  /** [quick] Dados para os selects da mini (última versão empurrada pelo main). */
  getQuickData(): Promise<QuickDataDTO>
  /** [quick] Envia o gasto ao main, que o encaminha ao app (fonte única de dados). */
  submitQuickExpense(payload: QuickExpenseDTO): Promise<void>
  /** [quick] PIN correto na mini → destrava o app inteiro. */
  quickUnlock(): void
  /** [quick] Fecha (esconde) a mini-janela. */
  closeQuick(): void
  /** [quick] Notifica que a mini foi exibida (para focar/re-checar o bloqueio). */
  onQuickShow(cb: () => void): () => void
}

/** Origem do gasto rápido (espelha `ExpenseOrigin` do schema sem importá-lo). */
export type QuickOriginDTO =
  | { kind: 'bank'; bankId: string }
  | { kind: 'card'; cardId: string }
  | null

/** Gasto lançado pela mini-janela (M5). */
export interface QuickExpenseDTO {
  amount: number
  categoryId: string
  description: string
  origin: QuickOriginDTO
}

/** Dados mínimos para os selects da mini (M5). */
export interface QuickDataDTO {
  categories: { id: string; name: string }[]
  banks: { id: string; name: string }[]
  cards: { id: string; name: string; bankId: string }[]
}

/** Resultado de uma verificação de PIN (§b). Espelha `VerifyResult` do main. */
export interface PinVerifyDTO {
  ok: boolean
  /** Quando > 0, o app deve aguardar este tempo (ms) antes de tentar de novo. */
  waitMs: number
  /** Tentativas restantes antes de o throttling começar. */
  attemptsLeft: number
}

/** Taxas vindas da rede (§2). Espelha `FetchedRates` do engine sem importá-lo:
 *  o preload não deve depender do código do renderer. */
export interface FetchedRatesDTO {
  selic: number
  cdi: number
  ipca: number
  source: 'brasilapi' | 'sgs'
}

export const IPC = {
  loadData: 'zent:load-data',
  saveData: 'zent:save-data',
  exportData: 'zent:export-data',
  importData: 'zent:import-data',
  listLogos: 'zent:list-logos',
  logosChanged: 'zent:logos-changed',
  getVersion: 'zent:get-version',
  lastBackupAt: 'zent:last-backup-at',
  setTitleBarTheme: 'zent:set-titlebar-theme',
  fetchRates: 'zent:fetch-rates',
  hasPin: 'zent:has-pin',
  setPin: 'zent:set-pin',
  verifyPin: 'zent:verify-pin',
  changePin: 'zent:change-pin',
  resetPin: 'zent:reset-pin',
  // Bandeja + lançamento rápido (M5)
  reportLockState: 'zent:report-lock-state',
  setMinimizeToTray: 'zent:set-minimize-to-tray',
  pushQuickData: 'zent:push-quick-data',
  showQuickEntry: 'zent:show-quick-entry',
  quickExpense: 'zent:quick-expense',
  appUnlock: 'zent:app-unlock',
  quickIsLocked: 'zent:quick-is-locked',
  getQuickData: 'zent:get-quick-data',
  submitQuickExpense: 'zent:submit-quick-expense',
  quickUnlock: 'zent:quick-unlock',
  closeQuick: 'zent:close-quick',
  quickShow: 'zent:quick-show',
} as const
