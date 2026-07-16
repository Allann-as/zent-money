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

/**
 * Altura da faixa de título do app (px). Precisa bater com a do TitleBar do
 * renderer: é ela que reserva o espaço dos botões nativos sobrepostos.
 */
const TITLE_BAR_HEIGHT = 36

/**
 * Cores dos botões nativos no primeiro frame, antes de o renderer subir e
 * mandar os tokens reais. Espelham --titlebar-bg/--titlebar-symbol do tema
 * escuro (o padrão) só para não haver um flash branco no boot.
 */
const TITLE_BAR_BOOT = { color: '#060D1F', symbolColor: '#8FA3BF' }

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
    // Barra de título do sistema fora: o app desenha a sua e o Windows só
    // sobrepõe os botões, pintados nas cores do tema (R3).
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...TITLE_BAR_BOOT, height: TITLE_BAR_HEIGHT },
    icon: path.join(__dirname, '../../assets/icon/zent.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  Menu.setApplicationMenu(null)

  /**
   * Exibir a janela: `ready-to-show` **NÃO dispara** quando a janela usa
   * `titleBarOverlay` (Electron 33 no Windows). Com `show: false`, a janela ficava
   * invisível para sempre — o app subia (processo vivo, renderer carregado) e nada
   * aparecia. Diagnóstico: `dom-ready` e `did-finish-load` disparam, `ready-to-show`
   * nunca. Ver AUDITORIA.md.
   *
   * `did-finish-load` dispara e basta: o conteúdo já está carregado, então não há
   * flash. O timer é rede de segurança — nenhum evento perdido justifica um app sem
   * janela, e `backgroundColor` já pinta o navy enquanto isso.
   */
  let revealed = false
  const reveal = (): void => {
    if (revealed) return
    revealed = true
    mainWindow?.show()
  }
  mainWindow.once('ready-to-show', reveal)
  mainWindow.webContents.once('did-finish-load', reveal)
  setTimeout(reveal, 4000)

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

  ipcMain.handle(IPC.setTitleBarTheme, (_e, color: string, symbolColor: string) => {
    // setTitleBarOverlay só existe onde há overlay (Windows). Em outras
    // plataformas a chamada é um no-op silencioso.
    try {
      mainWindow?.setTitleBarOverlay({ color, symbolColor, height: TITLE_BAR_HEIGHT })
    } catch {
      // plataforma sem overlay — nada a fazer
    }
  })

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
