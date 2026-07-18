import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * PIN de bloqueio (M2 §b) — barreira contra olhares casuais, NÃO criptografia.
 *
 * O que fica no disco é só o **hash scrypt + salt** (`pin.json` no userData); o
 * PIN em claro nunca é gravado, logado nem devolvido ao renderer. O arquivo de
 * dados continua em texto — o PIN não o cifra (isso é a proposta separada de
 * criptografia). Verificação e throttling vivem no MAIN: o renderer nunca vê o
 * hash e não tem como burlar o atraso progressivo por dentro do próprio processo.
 *
 * O throttling é em memória de propósito: reiniciar o app zera a contagem. Para
 * uma barreira visual isso basta e evita persistir um "lockedUntil" que poderia
 * travar o dono legítimo por engano; a proteção real dos dados é a criptografia,
 * decidida à parte.
 */

const PIN_FILE = 'pin.json'
const SCRYPT_KEYLEN = 64
const SALT_BYTES = 16
const FREE_ATTEMPTS = 5

interface PinRecord {
  v: 1
  salt: string
  hash: string
}

function pinFilePath(): string {
  return path.join(app.getPath('userData'), PIN_FILE)
}

function readRecord(): PinRecord | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(pinFilePath(), 'utf-8'))
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as PinRecord).v === 1 &&
      typeof (parsed as PinRecord).salt === 'string' &&
      typeof (parsed as PinRecord).hash === 'string'
    ) {
      return parsed as PinRecord
    }
    return null
  } catch {
    return null
  }
}

function scryptHash(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pin, salt, SCRYPT_KEYLEN, (err, derived) => {
      if (err) reject(err)
      else resolve(derived)
    })
  })
}

// ── Throttling progressivo (em memória) ──────────────────────────────────────
let failCount = 0
let lockedUntil = 0

/** Atraso após esgotar as tentativas livres: 1s, 2s, 4s… teto de 30s. */
function delayFor(fails: number): number {
  if (fails < FREE_ATTEMPTS) return 0
  return Math.min(30_000, 1000 * 2 ** (fails - FREE_ATTEMPTS))
}

function resetThrottle(): void {
  failCount = 0
  lockedUntil = 0
}

export function hasPin(): boolean {
  return readRecord() !== null
}

/** Define (ou troca) o PIN: grava só o hash scrypt + salt, com escrita atômica. */
export async function setPin(pin: string): Promise<void> {
  const salt = crypto.randomBytes(SALT_BYTES)
  const hash = await scryptHash(pin, salt)
  const record: PinRecord = { v: 1, salt: salt.toString('hex'), hash: hash.toString('hex') }
  fs.mkdirSync(app.getPath('userData'), { recursive: true })
  const file = pinFilePath()
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(record), 'utf-8')
  fs.renameSync(tmp, file)
  resetThrottle()
}

export interface VerifyResult {
  ok: boolean
  /** Quando > 0, o app deve esperar este tanto (ms) antes de tentar de novo. */
  waitMs: number
  /** Tentativas restantes antes de o throttling começar (0 quando já está atrasando). */
  attemptsLeft: number
}

/** Verifica o PIN em tempo constante; aplica throttling progressivo nos erros. */
export async function verifyPin(pin: string): Promise<VerifyResult> {
  const now = Date.now()
  if (now < lockedUntil) {
    return { ok: false, waitMs: lockedUntil - now, attemptsLeft: 0 }
  }
  const record = readRecord()
  if (record === null) return { ok: false, waitMs: 0, attemptsLeft: FREE_ATTEMPTS }

  const expected = Buffer.from(record.hash, 'hex')
  const actual = await scryptHash(pin, Buffer.from(record.salt, 'hex'))
  const ok = expected.length === actual.length && crypto.timingSafeEqual(expected, actual)

  if (ok) {
    resetThrottle()
    return { ok: true, waitMs: 0, attemptsLeft: FREE_ATTEMPTS }
  }
  failCount += 1
  const wait = delayFor(failCount)
  if (wait > 0) lockedUntil = Date.now() + wait
  return { ok: false, waitMs: wait, attemptsLeft: Math.max(0, FREE_ATTEMPTS - failCount) }
}

/** Troca o PIN exigindo o atual. Retorna false se o atual não confere. */
export async function changePin(current: string, next: string): Promise<boolean> {
  const res = await verifyPin(current)
  if (!res.ok) return false
  await setPin(next)
  return true
}

/**
 * "Esqueci o PIN" (§b): apaga só o PIN. Os DADOS não são tocados — o PIN não os
 * cifra. A fricção (digitar RESET) é da UI; aqui é a ação crua.
 */
export function resetPin(): void {
  try {
    fs.rmSync(pinFilePath(), { force: true })
  } catch {
    // sem arquivo, nada a fazer
  }
  resetThrottle()
}
