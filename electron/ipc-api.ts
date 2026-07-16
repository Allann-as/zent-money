/**
 * Contrato da bridge exposta ao renderer via preload (window.zent).
 * Este arquivo é a única fonte de verdade do shape da API IPC.
 */
export interface ZentBridge {
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
} as const
