import {
  PiggyBank,
  Sparkles,
  Coins,
  TrendingUp,
  Flame,
  Gauge,
  Target,
  CheckCircle2,
  Download,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import type { MedalIcon } from '@/engine/achievements'

/** Ícone de cada medalha — traço fino do set do app (sobriedade, M4). */
export const MEDAL_ICONS: Record<MedalIcon, LucideIcon> = {
  piggy: PiggyBank,
  sparkle: Sparkles,
  coins: Coins,
  trend: TrendingUp,
  flame: Flame,
  gauge: Gauge,
  target: Target,
  check: CheckCircle2,
  download: Download,
  trophy: Trophy,
}

/** Banda de cor do score (linguagem do orçamento: acento → âmbar → vermelho). */
export function scoreTone(score: number): { color: string; label: string } {
  if (score >= 70) return { color: 'var(--primary)', label: 'saudável' }
  if (score >= 40) return { color: 'var(--warn)', label: 'atenção' }
  return { color: 'var(--neg)', label: 'apertado' }
}
