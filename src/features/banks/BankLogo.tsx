import type { ReactNode } from 'react'
import { useDataStore } from '@/store/dataStore'

/** Normaliza o nome do banco para casar com os arquivos de assets/logos/. */
export function normalizeBankName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Logo do banco: usa o arquivo de assets/logos/ se existir (detecção
 * automática); senão, fallback em monograma SVG na cor da marca.
 */
export function BankLogo({
  name,
  color,
  size = 36,
}: {
  name: string
  color: string
  size?: number
}): ReactNode {
  const logos = useDataStore((s) => s.logos)
  const src = logos[normalizeBankName(name)]

  if (src) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-[10px] bg-white/95 border border-line overflow-hidden shrink-0"
        style={{ width: size, height: size }}
      >
        <img
          src={src}
          alt={`Logo ${name}`}
          style={{ width: size - 8, height: size - 8, objectFit: 'contain' }}
        />
      </span>
    )
  }

  const initial = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <span
      aria-label={`Monograma ${name}`}
      className="inline-flex items-center justify-center rounded-[10px] font-display font-bold text-white shrink-0 select-none"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: size * 0.44,
        textShadow: '0 1px 2px rgba(0,0,0,0.25)',
      }}
    >
      {initial}
    </span>
  )
}
