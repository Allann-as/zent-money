import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ZentBridge } from './ipc-api'

const bridge: ZentBridge = {
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
}

contextBridge.exposeInMainWorld('zent', bridge)
