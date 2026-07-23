import {
  Briefcase,
  Car,
  Gamepad2,
  Gem,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Laptop,
  LifeBuoy,
  PiggyBank,
  Plane,
  Smartphone,
  Umbrella,
  type LucideIcon,
} from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ÍCONES DAS CAIXINHAS — v2 (R10 §⑤)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Set único, zero emojis, `currentColor`, **stroke 1,6** e todos conferidos a
 * **16px** (o tamanho real do seletor). O que mudou nesta versão:
 *
 * - **Saíram** câmera, música e pet: não são objetivos de poupança, são hobbies
 *   — nenhum deles nomeia uma meta ("vou juntar para o pet" quer dizer saúde
 *   ou emergência, que já existem). Quem os usava é remapeado pela migração
 *   v10→v11, então nenhuma caixinha fica com ícone órfão.
 * - **O cofre foi refeito.** O anterior era um cadeado; com corpo, porta,
 *   segredo e alavanca ele passa a ler como cofre.
 * - **Entraram** saco de dinheiro, maleta de dinheiro, desenvolvimento pessoal,
 *   casamento e poupança.
 * - **O alvo ganhou o dardo**: dois círculos concêntricos sozinhos são um
 *   símbolo genérico; com o dardo cravado eles viram "meta atingida".
 *
 * Os desenhos próprios vivem aqui embaixo em vez de virarem arquivos soltos:
 * são cinco paths curtos, e mantê-los ao lado do registro é o que garante que
 * peso e viewBox não divirjam entre eles.
 */

/** Peso único do set. Um ícone mais grosso que o vizinho salta na grade. */
const SW = 1.6

/**
 * Contrato do registro: props OBRIGATÓRIAS.
 *
 * O projeto roda com `exactOptionalPropertyTypes`, e ali "prop opcional" e
 * "prop com valor `undefined`" são coisas diferentes — misturar o contrato
 * opcional do lucide com um contrato opcional próprio não fecha em nenhuma das
 * duas direções. Exigir `size` e `className` resolve na origem: quem chama já
 * decide os dois, e o `L()` abaixo é a única ponte para os ícones do lucide.
 */
type IconProps = { size: number; className: string }
type IconComponent = ComponentType<IconProps>

/** Adapta um ícone do lucide ao contrato do registro, com o peso do set. */
function L(Icon: LucideIcon): IconComponent {
  return function BoxLucideIcon({ size, className }: IconProps): ReactNode {
    return <Icon size={size} strokeWidth={SW} className={className} aria-hidden="true" />
  }
}

/** Casca comum dos desenhos próprios — mesmo viewBox e mesmo peso dos lucide. */
function Svg({ size, className, children }: IconProps & { children: ReactNode }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={SW}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  )
}

/**
 * Alvo com dardo CRAVADO — "meta", não "mira genérica".
 *
 * A ponta da seta fica no centro, não na outra extremidade: com o bico virado
 * para fora o desenho lia como "alvo + seta de alta", que é outra coisa.
 */
function TargetDart(p: IconProps): ReactNode {
  return (
    <Svg {...p}>
      <circle cx="11" cy="13" r="8.2" />
      <circle cx="11" cy="13" r="3.5" />
      <path d="M20.6 3.4 12 12" />
      <path d="M14.9 11.2 12 12l.8-2.9" />
      <path d="m17.9 3.6 2.5 2.5" />
    </Svg>
  )
}

/**
 * Cofre: corpo, porta, segredo e alavanca — o antigo era um cadeado.
 *
 * Os spokes cruzados da primeira tentativa viravam um losango no miolo e o
 * ícone lia como uma moldura. O segredo com UMA alavanca lateral é o que dá a
 * leitura de cofre a 16px.
 */
function Safe(p: IconProps): ReactNode {
  return (
    <Svg {...p}>
      <rect x="2.6" y="3.9" width="18.8" height="15.2" rx="2.2" />
      <rect x="5.8" y="6.7" width="12.6" height="9.6" rx="1.3" />
      <circle cx="11.2" cy="11.5" r="2" />
      <path d="M13.2 11.5h2.6" />
      <path d="M5.6 19.1v1.7M18.4 19.1v1.7" />
    </Svg>
  )
}

/** Saco de dinheiro — nó no topo, corpo bojudo e o cifrão. */
function MoneyBag(p: IconProps): ReactNode {
  return (
    <Svg {...p}>
      <path d="M9.2 2.8h5.6l-1.5 3.1h-2.6z" />
      <path d="M10.7 5.9C7.4 7.4 4.6 10.8 4.6 14.5c0 3.8 3.1 6.2 7.4 6.2s7.4-2.4 7.4-6.2c0-3.7-2.8-7.1-6.1-8.6" />
      <path d="M12 10.6v6.9" />
      <path d="M14 12.2c0-.9-.9-1.4-2-1.4s-2 .5-2 1.4.9 1.3 2 1.6 2 .7 2 1.6-.9 1.4-2 1.4-2-.5-2-1.4" />
    </Svg>
  )
}

/**
 * Maleta de dinheiro — o cifrão é o que a separa da maleta de TRABALHO, que
 * também está no set. O retângulo com um círculo no meio (1ª tentativa) lia
 * como câmera.
 */
function MoneyCase(p: IconProps): ReactNode {
  return (
    <Svg {...p}>
      <rect x="2.6" y="6.6" width="18.8" height="13.4" rx="2.2" />
      <path d="M9 6.6V5.2a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 5.2v1.4" />
      <path d="M12 10.2v7.2" />
      <path d="M14 11.9c0-.85-.9-1.35-2-1.35s-2 .5-2 1.35.9 1.3 2 1.55 2 .7 2 1.55-.9 1.35-2 1.35-2-.5-2-1.35" />
    </Svg>
  )
}

/** Desenvolvimento pessoal — a pessoa e a curva que sobe. */
function PersonalGrowth(p: IconProps): ReactNode {
  return (
    <Svg {...p}>
      <circle cx="7.4" cy="5.9" r="2.6" />
      <path d="M2.9 20.4v-1.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5v1.5" />
      <path d="m14.2 16.6 2.8-3.5 2.2 1.8 2.2-4.4" />
      <path d="M18.4 10h3.2v3.2" />
    </Svg>
  )
}

/** Casamento — as duas alianças entrelaçadas, uma com a pedra. */
function WeddingRings(p: IconProps): ReactNode {
  return (
    <Svg {...p}>
      <circle cx="8.8" cy="15.6" r="4.9" />
      <circle cx="15.6" cy="15.6" r="4.9" />
      <path d="m15.6 5.7 2.3 2.5-2.3 2.5-2.3-2.5z" />
    </Svg>
  )
}

export const BOX_ICONS: Record<string, { icon: IconComponent; label: string }> = {
  target: { icon: TargetDart, label: 'Meta' },
  lifebuoy: { icon: L(LifeBuoy), label: 'Emergência' },
  piggy: { icon: L(PiggyBank), label: 'Poupança' },
  safe: { icon: Safe, label: 'Cofre' },
  moneybag: { icon: MoneyBag, label: 'Saco de dinheiro' },
  moneycase: { icon: MoneyCase, label: 'Maleta de dinheiro' },
  growth: { icon: PersonalGrowth, label: 'Desenvolvimento pessoal' },
  plane: { icon: L(Plane), label: 'Viagem' },
  car: { icon: L(Car), label: 'Carro' },
  home: { icon: L(Home), label: 'Casa' },
  rings: { icon: WeddingRings, label: 'Casamento' },
  gift: { icon: L(Gift), label: 'Presente' },
  gradcap: { icon: L(GraduationCap), label: 'Estudos' },
  laptop: { icon: L(Laptop), label: 'Notebook' },
  phone: { icon: L(Smartphone), label: 'Celular' },
  gamepad: { icon: L(Gamepad2), label: 'Games' },
  health: { icon: L(HeartPulse), label: 'Saúde' },
  briefcase: { icon: L(Briefcase), label: 'Trabalho' },
  gem: { icon: L(Gem), label: 'Joia' },
  umbrella: { icon: L(Umbrella), label: 'Férias' },
}

export const BOX_ICON_KEYS = Object.keys(BOX_ICONS)

/**
 * Chaves aposentadas na v2 → substituta. A migração v10→v11 reescreve as
 * caixinhas que as usavam; o mapa fica exportado porque o teste da migração o
 * usa como fonte única (um mapa duplicado no teste seria livre para divergir).
 */
export const RETIRED_BOX_ICONS: Record<string, string> = {
  camera: 'gift',
  music: 'gift',
  paw: 'health',
  lock: 'safe',
}

export function BoxIcon({
  name,
  size = 18,
  className,
}: {
  name: string
  size?: number
  className?: string
}): ReactNode {
  // Chave aposentada ainda no arquivo (pré-migração) resolve pelo mapa; o que
  // não existir em lugar nenhum cai na meta, nunca num buraco.
  const entry = BOX_ICONS[name] ?? BOX_ICONS[RETIRED_BOX_ICONS[name] ?? ''] ?? BOX_ICONS['target']
  const Icon = entry?.icon
  if (Icon === undefined) return null
  return <Icon size={size} className={className ?? ''} />
}
