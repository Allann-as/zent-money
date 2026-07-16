import type { ReactNode } from 'react'

/** Monograma "Z" do Zent Money (mesmo desenho do ícone do app). */
export function ZentLogo({ size = 34 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden="true">
      <defs>
        <linearGradient id="zent-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary-hover)" />
          <stop offset="1" stopColor="var(--primary-press)" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="240" height="240" rx="56" fill="var(--surface-2)" />
      <rect
        x="8"
        y="8"
        width="240"
        height="240"
        rx="56"
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="4"
      />
      <path
        d="M76 70 h104 a10 10 0 0 1 10 10 v6 a14 14 0 0 1 -3.2 8.9 L106 178 h74 a10 10 0 0 1 10 10 v0 a10 10 0 0 1 -10 10 H76 a10 10 0 0 1 -10 -10 v-6 a14 14 0 0 1 3.2 -8.9 L150 90 H76 a10 10 0 0 1 -10 -10 v0 a10 10 0 0 1 10 -10 Z"
        fill="url(#zent-logo-grad)"
      />
      <circle cx="196" cy="196" r="14" fill="var(--pos)" />
    </svg>
  )
}
