import type { ZentBridge } from '../../electron/ipc-api'
import { zentDataSchema, type ZentData } from './schema'
import { migrate } from './migrations'
import { createSeedData } from './seed'

declare global {
  interface Window {
    zent: ZentBridge
  }
}

/**
 * Carrega os dados persistidos: parse → migração → validação Zod.
 * Se não existir arquivo (primeiro uso), retorna o seed e já persiste.
 * Se o arquivo estiver corrompido, lança — o App mostra tela de erro
 * (os backups rotativos em /backups permitem recuperação manual).
 */
export async function loadZentData(): Promise<ZentData> {
  const raw = await window.zent.loadData()
  if (raw === null) {
    const seed = createSeedData()
    await window.zent.saveData(JSON.stringify(seed))
    return seed
  }
  const parsed: unknown = JSON.parse(raw)
  const migrated = migrate(parsed)
  return zentDataSchema.parse(migrated)
}

/** Valida um JSON importado manualmente (Exportar/Importar do menu de perfil). */
export function parseImportedData(raw: string): ZentData {
  const parsed: unknown = JSON.parse(raw)
  const migrated = migrate(parsed)
  return zentDataSchema.parse(migrated)
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pending: ZentData | null = null

/** Persiste com debounce de 400ms — toda mutação do store chama isto. */
export function scheduleSave(data: ZentData): void {
  pending = data
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (pending) void window.zent.saveData(JSON.stringify(pending))
    pending = null
    saveTimer = null
  }, 400)
}

/** Grava imediatamente qualquer save pendente (usado antes de exportar). */
export async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (pending) {
    await window.zent.saveData(JSON.stringify(pending))
    pending = null
  }
}
