import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type FetchedRatesDTO, type PinVerifyDTO, type ZentBridge } from './ipc-api'
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
  setTitleBarTheme: (color, symbolColor) =>
    ipcRenderer.invoke(IPC.setTitleBarTheme, color, symbolColor) as Promise<void>,
  fetchRates: () => ipcRenderer.invoke(IPC.fetchRates) as Promise<FetchedRatesDTO | null>,
  hasPin: () => ipcRenderer.invoke(IPC.hasPin) as Promise<boolean>,
  setPin: (pin) => ipcRenderer.invoke(IPC.setPin, pin) as Promise<void>,
  verifyPin: (pin) => ipcRenderer.invoke(IPC.verifyPin, pin) as Promise<PinVerifyDTO>,
  changePin: (current, next) => ipcRenderer.invoke(IPC.changePin, current, next) as Promise<boolean>,
  resetPin: () => ipcRenderer.invoke(IPC.resetPin) as Promise<void>,
}

contextBridge.exposeInMainWorld('zent', bridge)
