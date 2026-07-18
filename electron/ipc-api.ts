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
  setTitleBarTheme: 'zent:set-titlebar-theme',
  fetchRates: 'zent:fetch-rates',
  hasPin: 'zent:has-pin',
  setPin: 'zent:set-pin',
  verifyPin: 'zent:verify-pin',
  changePin: 'zent:change-pin',
  resetPin: 'zent:reset-pin',
} as const
