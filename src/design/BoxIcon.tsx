import {
  Briefcase,
  Camera,
  Car,
  Gamepad2,
  Gem,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Laptop,
  LifeBuoy,
  Lock,
  Music,
  PawPrint,
  Plane,
  Smartphone,
  Target,
  Umbrella,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Set único de ícones SVG das Caixinhas (§4 — zero emojis): traço fino,
 * cor via currentColor/tokens, legível nos dois temas.
 */
export const BOX_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  lifebuoy: { icon: LifeBuoy, label: 'Reserva' },
  plane: { icon: Plane, label: 'Viagem' },
  car: { icon: Car, label: 'Carro' },
  home: { icon: Home, label: 'Casa' },
  gem: { icon: Gem, label: 'Joia' },
  gift: { icon: Gift, label: 'Presente' },
  gradcap: { icon: GraduationCap, label: 'Estudos' },
  lock: { icon: Lock, label: 'Cofre' },
  laptop: { icon: Laptop, label: 'Computador' },
  phone: { icon: Smartphone, label: 'Celular' },
  gamepad: { icon: Gamepad2, label: 'Games' },
  camera: { icon: Camera, label: 'Câmera' },
  health: { icon: HeartPulse, label: 'Saúde' },
  umbrella: { icon: Umbrella, label: 'Férias' },
  briefcase: { icon: Briefcase, label: 'Trabalho' },
  music: { icon: Music, label: 'Música' },
  paw: { icon: PawPrint, label: 'Pet' },
  target: { icon: Target, label: 'Meta' },
}

export const BOX_ICON_KEYS = Object.keys(BOX_ICONS)

export function BoxIcon({
  name,
  size = 18,
  className,
}: {
  name: string
  size?: number
  className?: string
}): ReactNode {
  const Icon = BOX_ICONS[name]?.icon ?? Target
  return <Icon size={size} strokeWidth={1.8} className={className} aria-hidden="true" />
}
