import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type FetchedRatesDTO,
  type PinVerifyDTO,
  type QuickDataDTO,
  type QuickExpenseDTO,
  type ZentBridge,
} from './ipc-api'
import { readLockDisabledArg } from './seam'

const bridge: ZentBridge = {
  // Seam de teste: NÃO lê o ambiente diretamente — lê o booleano já resolvido
  // pelo main (que aplica a guarda `!app.isPackaged`). Assim, no app instalado,
  // `ZENT_NO_LOCK` no ambiente é inerte: o main envia sempre `false`.
  lockDisabled: readLockDisabledArg(process.argv),
  loadData: () => ipcRenderer.invoke(IPC.loadData) as Promise<string | null>,
  saveData: (json) => ipcRenderer.invoke(IPC.saveData, json) as Promise<void>,
  exportData: (json, suggestedName) =>
    ipcRenderer.invoke(IPC.exportData, json, suggestedName) as Promise<string | null>,
  importData: () => ipcRenderer.invoke(IPC.importData) as Promise<string | null>,
  listLogos: () => ipcRenderer.invoke(IPC.listLogos) as Promise<Record<string, string>>,
  onLogosChanged: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, logos: Record<string, string>): void => cb(logos)
    ipcRenderer.on(IPC.logosChanged, listener)
    return () => ipcRenderer.removeListener(IPC.logosChanged, listener)
  },
  getVersion: () => ipcRenderer.invoke(IPC.getVersion) as Promise<string>,
  lastBackupAt: () => ipcRenderer.invoke(IPC.lastBackupAt) as Promise<string | null>,
  setTitleBarTheme: (color, symbolColor) =>
    ipcRenderer.invoke(IPC.setTitleBarTheme, color, symbolColor) as Promise<void>,
  fetchRates: () => ipcRenderer.invoke(IPC.fetchRates) as Promise<FetchedRatesDTO | null>,
  hasPin: () => ipcRenderer.invoke(IPC.hasPin) as Promise<boolean>,
  setPin: (pin) => ipcRenderer.invoke(IPC.setPin, pin) as Promise<void>,
  verifyPin: (pin) => ipcRenderer.invoke(IPC.verifyPin, pin) as Promise<PinVerifyDTO>,
  changePin: (current, next) => ipcRenderer.invoke(IPC.changePin, current, next) as Promise<boolean>,
  resetPin: () => ipcRenderer.invoke(IPC.resetPin) as Promise<void>,

  // ── Bandeja + lançamento rápido (M5) ──────────────────────────────
  // 'quick' = mini-janela da bandeja; 'main' = o app. Vem do hash da URL (o
  // preload é compilado sob o tsconfig node, sem DOM — daí o acesso via globalThis).
  windowKind:
    (globalThis as { location?: { hash?: string } }).location?.hash === '#quick' ? 'quick' : 'main',
  reportLockState: (locked) => ipcRenderer.send(IPC.reportLockState, locked),
  setMinimizeToTray: (on) => ipcRenderer.send(IPC.setMinimizeToTray, on),
  pushQuickData: (data) => ipcRenderer.send(IPC.pushQuickData, data),
  showQuickEntry: () => ipcRenderer.send(IPC.showQuickEntry),
  onQuickExpense: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: QuickExpenseDTO): void => cb(payload)
    ipcRenderer.on(IPC.quickExpense, listener)
    return () => ipcRenderer.removeListener(IPC.quickExpense, listener)
  },
  onAppUnlock: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.appUnlock, listener)
    return () => ipcRenderer.removeListener(IPC.appUnlock, listener)
  },
  quickIsLocked: () => ipcRenderer.invoke(IPC.quickIsLocked) as Promise<boolean>,
  getQuickData: () => ipcRenderer.invoke(IPC.getQuickData) as Promise<QuickDataDTO>,
  submitQuickExpense: (payload) => ipcRenderer.invoke(IPC.submitQuickExpense, payload) as Promise<void>,
  quickUnlock: () => ipcRenderer.send(IPC.quickUnlock),
  closeQuick: () => ipcRenderer.send(IPC.closeQuick),
  onQuickShow: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.quickShow, listener)
    return () => ipcRenderer.removeListener(IPC.quickShow, listener)
  },
}

contextBridge.exposeInMainWorld('zent', bridge)
