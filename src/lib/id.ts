/**
 * IDs únicos por registro: timestamp base36 + 8 bytes aleatórios
 * (crypto.getRandomValues) — sem dependências, sem colisões na prática.
 */
export function newId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${Date.now().toString(36)}-${rand}`
}
