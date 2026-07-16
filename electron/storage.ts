import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Persistência local do Zent Money.
 * - Arquivo único JSON no diretório de dados do app.
 * - Escrita atômica: grava em `.tmp` e renomeia por cima (rename é atômico e
 *   sobrescreve no Windows via MOVEFILE_REPLACE_EXISTING).
 * - Backup rotativo: 1 cópia por dia de uso, máximo de 10, em /backups.
 */

const DATA_FILE = 'zent-data.json'
const BACKUP_DIR = 'backups'
const MAX_BACKUPS = 10

function dataDir(): string {
  return app.getPath('userData')
}

function dataFilePath(): string {
  return path.join(dataDir(), DATA_FILE)
}

function backupDirPath(): string {
  return path.join(dataDir(), BACKUP_DIR)
}

function todayStamp(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function loadData(): string | null {
  const file = dataFilePath()
  try {
    return fs.readFileSync(file, 'utf-8')
  } catch {
    return null
  }
}

/** Copia o arquivo atual para /backups uma vez por dia de uso e poda para 10. */
function rotateBackup(): void {
  const file = dataFilePath()
  if (!fs.existsSync(file)) return
  const dir = backupDirPath()
  fs.mkdirSync(dir, { recursive: true })
  const target = path.join(dir, `zent-${todayStamp()}.json`)
  if (fs.existsSync(target)) return // já existe backup de hoje
  fs.copyFileSync(file, target)
  const backups = fs
    .readdirSync(dir)
    .filter((f) => /^zent-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort() // nome = data ISO, ordena cronologicamente
  while (backups.length > MAX_BACKUPS) {
    const oldest = backups.shift()
    if (oldest) fs.rmSync(path.join(dir, oldest), { force: true })
  }
}

export function saveData(json: string): void {
  const file = dataFilePath()
  fs.mkdirSync(dataDir(), { recursive: true })
  rotateBackup()
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, json, 'utf-8')
  fs.renameSync(tmp, file)
}

// ── Logos de bancos ──────────────────────────────────────────────────────────

const LOGO_EXTENSIONS: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

/** Pasta de logos: `assets/logos` no projeto (dev) ou em resources (empacotado). */
export function logosDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', 'logos')
  }
  return path.join(app.getAppPath(), 'assets', 'logos')
}

/**
 * Lê os logos disponíveis. A chave é o nome do arquivo normalizado
 * (minúsculas, sem acentos/espaços) — ex.: `nubank.svg` → `nubank`.
 */
export function listLogos(): Record<string, string> {
  const dir = logosDir()
  const result: Record<string, string> = {}
  let files: string[]
  try {
    files = fs.readdirSync(dir)
  } catch {
    return result
  }
  for (const f of files) {
    const ext = path.extname(f).toLowerCase()
    const mime = LOGO_EXTENSIONS[ext]
    if (!mime) continue
    const key = path
      .basename(f, ext)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '')
    try {
      const buf = fs.readFileSync(path.join(dir, f))
      result[key] = `data:${mime};base64,${buf.toString('base64')}`
    } catch {
      // arquivo ilegível — ignora e segue para o próximo
    }
  }
  return result
}

/** Observa a pasta de logos; chama `cb` (debounced) a cada mudança. */
export function watchLogos(cb: () => void): void {
  const dir = logosDir()
  try {
    fs.mkdirSync(dir, { recursive: true })
    let timer: NodeJS.Timeout | null = null
    fs.watch(dir, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(cb, 300)
    })
  } catch {
    // watch é best-effort; sem watcher os logos são lidos no boot
  }
}
