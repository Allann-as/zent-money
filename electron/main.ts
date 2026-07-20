import { app, BrowserWindow, Menu, Tray, dialog, globalShortcut, ipcMain, nativeImage, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { IPC, type QuickDataDTO, type QuickExpenseDTO } from './ipc-api'
import { resolveLockDisabled } from './seam'
import { listLogos, loadData, saveData, watchLogos } from './storage'
import { changePin, hasPin, resetPin, setPin, verifyPin } from './pin'
import { fetchRates, type FetchLike } from '../src/engine/rates-source'

// Versão do produto injetada em build (electron.vite.config.ts) — não depende
// de `app.getVersion()`, que devolve a versão do Electron quando desempacotado.
declare const __APP_VERSION__: string
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : app.getVersion()

// Diretório de dados alternativo (usado pelo E2E para não tocar dados reais)
const customUserData = process.env['ZENT_USER_DATA']
if (customUserData) {
  app.setPath('userData', customUserData)
}

let mainWindow: BrowserWindow | null = null

// ── Bandeja + lançamento rápido (M5) ──────────────────────────────────
let quickWindow: BrowserWindow | null = null
let tray: Tray | null = null
/** app de fato encerrando? (distingue "fechar → bandeja" de "Sair"). */
let quitting = false
/**
 * O app está bloqueado? Fonte para a mini-janela — o renderer principal reporta
 * (lock/unlock) e o main guarda. Default conservador: se há PIN e o seam de
 * bypass NÃO vale, assume bloqueado até o renderer dizer o contrário. Assim a
 * bandeja NUNCA é um furo no bloqueio, nem no primeiro instante do boot.
 */
let appLocked = false
/** "Fechar minimiza para a bandeja" (configurável no perfil). Default ligado. */
let minimizeToTray = true
/** Última fatia de dados que a mini precisa (empurrada pelo renderer principal). */
let quickData: QuickDataDTO = { categories: [], banks: [], cards: [] }

const rendererIndex = (): string => path.join(__dirname, '../renderer/index.html')

/** Mostra a mini-janela centrada e avisa o renderer (para focar/re-checar PIN). */
function showQuickWindow(): void {
  if (!quickWindow || quickWindow.isDestroyed()) return
  quickWindow.center()
  quickWindow.show()
  quickWindow.focus()
  quickWindow.webContents.send(IPC.quickShow)
}

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
const TITLE_BAR_BOOT = { color: '#0B1712', symbolColor: '#879C90' }

/** Seam de bloqueio só vale em build NÃO empacotado (ver electron/seam.ts). */
function lockDisabledResolved(): boolean {
  return resolveLockDisabled(app.isPackaged, process.env['ZENT_NO_LOCK'])
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Zent Money',
    backgroundColor: '#08120E',
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
      // Guarda de produção do seam de teste: `ZENT_NO_LOCK=1` só é honrado em
      // build NÃO empacotado (dev/test). A decisão vive AQUI porque só o main
      // conhece `app.isPackaged`; o preload apenas lê o argumento resolvido — no
      // app instalado, nenhuma variável de ambiente destrava o bloqueio.
      additionalArguments: [`--zent-lock-disabled=${lockDisabledResolved()}`],
      // Auto-bloqueio por inatividade (M2 §b) roda com um `setTimeout` no
      // renderer. Com a janela ESCONDIDA na bandeja (M5), o Chromium estrangula
      // os timers de background (até ~1/min após alguns minutos oculto), o que
      // atrasaria o bloqueio. Desligar o throttling faz o timer disparar na hora
      // mesmo na bandeja — o custo é desprezível (um timer ocioso). Assim
      // "app na bandeja além da inatividade → reabrir exige PIN" vale de fato.
      backgroundThrottling: false,
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
   * janela, e `backgroundColor` já pinta o verde-abissal enquanto isso.
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

  // Fechar → minimiza para a bandeja (M5), a menos que seja um "Sair" de fato.
  // Assim o ícone e o atalho global seguem vivos com a janela principal fechada.
  mainWindow.on('close', (e) => {
    if (quitting || !minimizeToTray) return
    e.preventDefault()
    mainWindow?.hide()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(rendererIndex())
  }
}

/**
 * Mini-janela do lançamento rápido (M5): frameless, pré-criada OCULTA no boot
 * para abrir em <1s. Carrega o MESMO bundle com `#quick` — o renderer monta o
 * `QuickEntryApp` em vez do app. Nunca é destruída ao fechar: só esconde.
 */
function createQuickWindow(): void {
  quickWindow = new BrowserWindow({
    width: 380,
    height: 480,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: '#08120E',
    icon: path.join(__dirname, '../../assets/icon/zent.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--zent-lock-disabled=${lockDisabledResolved()}`],
    },
  })

  quickWindow.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    quickWindow?.hide()
  })

  const url = process.env['ELECTRON_RENDERER_URL']
  if (url) {
    void quickWindow.loadURL(`${url}#quick`)
  } else {
    void quickWindow.loadFile(rendererIndex(), { hash: 'quick' })
  }
}

/** Bandeja: ícone + menu de contexto (Abrir · Lançamento rápido · Sair). */
function createTray(): void {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../../assets/icon/zent.ico'))
  // Em ambiente sem bandeja (alguns headless de CI/teste), `new Tray` pode
  // lançar — a bandeja é um extra, jamais deve derrubar o app.
  try {
    tray = new Tray(icon)
  } catch {
    tray = null
    return
  }
  tray.setToolTip('Zent Money')
  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Zent Money', click: () => showMainWindow() },
    { label: 'Lançamento rápido', click: () => showQuickWindow() },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        quitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(menu)
  // Clique no ícone abre o app (atalho comum de bandeja).
  tray.on('click', () => showMainWindow())
}

/** Traz a janela principal de volta (da bandeja). */
function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (!mainWindow.isVisible()) mainWindow.show()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
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

  ipcMain.handle(IPC.getVersion, () => APP_VERSION)

  /**
   * Taxas oficiais (R4 §2) — a única conexão de rede do app. Fica no main
   * porque o renderer bateria em CORS nas duas APIs. Falha vira `null`: o
   * renderer mantém os últimos valores em silêncio, sem toast de erro a cada
   * boot num café sem wi-fi.
   */
  ipcMain.handle(IPC.fetchRates, async () => {
    // `ZENT_OFFLINE=1` corta a rede na raiz. É o que garante que a suíte JAMAIS
    // bate na internet (um teste que depende do BC estar de pé é aposta, não
    // teste) e, de quebra, é o modo em que o E2E prova que o app funciona
    // inteiro sem conexão — o caminho de falha vira um caminho testado.
    if (process.env['ZENT_OFFLINE'] === '1') return null
    try {
      return await fetchRates(globalThis.fetch as unknown as FetchLike)
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.setTitleBarTheme, (_e, color: string, symbolColor: string) => {
    // setTitleBarOverlay só existe onde há overlay (Windows). Em outras
    // plataformas a chamada é um no-op silencioso.
    try {
      mainWindow?.setTitleBarOverlay({ color, symbolColor, height: TITLE_BAR_HEIGHT })
    } catch {
      // plataforma sem overlay — nada a fazer
    }
  })

  // ── PIN de bloqueio (M2 §b): hash/verify/throttle vivem no main ──
  ipcMain.handle(IPC.hasPin, () => hasPin())
  ipcMain.handle(IPC.setPin, (_e, pin: string) => setPin(pin))
  ipcMain.handle(IPC.verifyPin, (_e, pin: string) => verifyPin(pin))
  ipcMain.handle(IPC.changePin, (_e, current: string, next: string) => changePin(current, next))
  ipcMain.handle(IPC.resetPin, () => resetPin())

  // ── Bandeja + lançamento rápido (M5) ──────────────────────────────
  // O renderer principal é a fonte do estado de bloqueio; o main só o espelha
  // para a mini — que assim nunca fura o bloqueio.
  ipcMain.on(IPC.reportLockState, (_e, locked: boolean) => {
    appLocked = locked
  })
  ipcMain.on(IPC.setMinimizeToTray, (_e, on: boolean) => {
    minimizeToTray = on
  })
  ipcMain.on(IPC.pushQuickData, (_e, data: QuickDataDTO) => {
    quickData = data
  })
  ipcMain.on(IPC.showQuickEntry, () => showQuickWindow())
  ipcMain.handle(IPC.quickIsLocked, () => appLocked)
  ipcMain.handle(IPC.getQuickData, () => quickData)
  // A mini NÃO tem store própria: manda o gasto ao renderer principal, que o
  // aplica no dataStore real (fonte única; reflete na hora, sem race de escrita).
  ipcMain.handle(IPC.submitQuickExpense, (_e, payload: QuickExpenseDTO) => {
    mainWindow?.webContents.send(IPC.quickExpense, payload)
  })
  // PIN correto na mini: destrava o app inteiro (uma prova de identidade vale
  // para tudo — o throttling é o mesmo do main, então não há bypass).
  ipcMain.on(IPC.quickUnlock, () => {
    appLocked = false
    mainWindow?.webContents.send(IPC.appUnlock)
  })
  ipcMain.on(IPC.closeQuick, () => {
    if (!quickWindow?.isDestroyed()) quickWindow?.hide()
  })

  watchLogos(() => {
    mainWindow?.webContents.send(IPC.logosChanged, listLogos())
  })
}

app.whenReady().then(() => {
  // Default conservador do bloqueio: com PIN e sem o seam de bypass, a bandeja
  // assume bloqueado até o renderer principal reportar — nunca um furo no boot.
  appLocked = !lockDisabledResolved() && hasPin()

  registerIpc()
  createWindow()
  createQuickWindow()
  createTray()

  // Atalho GLOBAL de lançamento rápido (M5). `register` devolve false se o SO já
  // tomou a combinação — nesse caso a bandeja e o menu seguem funcionando.
  globalShortcut.register('CommandOrControl+Shift+Z', () => showQuickWindow())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// "Sair" real: libera os handlers de 'close' que seguravam a janela na bandeja.
app.on('before-quit', () => {
  quitting = true
})
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  tray?.destroy()
})

app.on('window-all-closed', () => {
  // Com a bandeja, a mini-janela oculta mantém o app vivo de propósito; só
  // encerra quando o usuário escolhe "Sair" (quitting) ou desligou a bandeja.
  if (quitting || !minimizeToTray) app.quit()
})
