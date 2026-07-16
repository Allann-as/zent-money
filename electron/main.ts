import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { IPC } from './ipc-api'
import { listLogos, loadData, saveData, watchLogos } from './storage'

// Diretório de dados alternativo (usado pelo E2E para não tocar dados reais)
const customUserData = process.env['ZENT_USER_DATA']
if (customUserData) {
  app.setPath('userData', customUserData)
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Zent Money',
    backgroundColor: '#04070F',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../assets/icon/zent.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  Menu.setApplicationMenu(null)

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Links externos (ex.: "sobre") abrem no navegador, nunca na janela do app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.loadData, () => loadData())

  ipcMain.handle(IPC.saveData, (_e, json: string) => {
    saveData(json)
  })

  ipcMain.handle(IPC.exportData, async (_e, json: string, suggestedName: string) => {
    if (!mainWindow) return null
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exportar backup do Zent Money',
      defaultPath: suggestedName,
      filters: [{ name: 'Backup Zent Money', extensions: ['json'] }],
    })
    if (canceled || !filePath) return null
    fs.writeFileSync(filePath, json, 'utf-8')
    return filePath
  })

  ipcMain.handle(IPC.importData, async () => {
    if (!mainWindow) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Importar backup do Zent Money',
      properties: ['openFile'],
      filters: [{ name: 'Backup Zent Money', extensions: ['json'] }],
    })
    const first = filePaths[0]
    if (canceled || !first) return null
    return fs.readFileSync(first, 'utf-8')
  })

  ipcMain.handle(IPC.listLogos, () => listLogos())

  ipcMain.handle(IPC.getVersion, () => app.getVersion())

  watchLogos(() => {
    mainWindow?.webContents.send(IPC.logosChanged, listLogos())
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
