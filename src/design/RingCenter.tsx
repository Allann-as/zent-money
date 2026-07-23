import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'
import { MIN_FONT_PX, fitValue, ringBreathing, ringSafeWidth } from './ringGeometry'
import { formatBRL, formatBRLCompact } from '@/engine/money'
import { MONEY_MASK, usePrivacy } from './money'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MIOLO DE ANEL — o espaço é reservado pelo PIOR caso
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `<RingCenter>` calcula a largura útil pela corda do círculo (ver
 * `ringGeometry`) e a oferece aos filhos por contexto. `<FitValue>` usa essa
 * largura para aplicar a cascata de adaptação sem nunca transbordar.
 *
 * ── A REGRA QUE FAZ ISSO FUNCIONAR ──────────────────────────────────────
 * Quem usa `RingCenter` RESERVA sempre o conteúdo mais alto que o componente
 * pode assumir. As linhas que só aparecem no hover ficam no DOM desde o
 * repouso, ocupando espaço, apenas invisíveis (`invisible`, nunca `hidden`).
 *
 * Assim a altura medida já é o pior caso — a fórmula fica correta por
 * construção — e o layout não muda de tamanho entre estados: passar o mouse
 * não causa reflow nenhum. Foi exatamente o contrário disso que produziu o
 * vazamento original: o Donut media 2 linhas em repouso e desenhava 3 no hover.
 *
 * ── POR QUE `whitespace-nowrap` É OBRIGATÓRIO AQUI ──────────────────────
 * A altura não pode depender da largura, senão estreitar o bloco quebraria uma
 * linha, aumentaria a altura, estreitaria mais a corda, e assim por diante. Com
 * as linhas travadas em nowrap a medição converge numa passada — e, de quebra,
 * cumpre a regra de nunca quebrar linha no meio de um número.
 */

interface RingFit {
  available: number
  /** true quando o valor pediu espaço e os rótulos secundários cederam. */
  labelsHidden: boolean
  /** O valor avisa que não coube no tamanho pedido (dispara a etapa `a`). */
  requestRoom(): void
}

const RingFitContext = createContext<RingFit>({
  available: Number.POSITIVE_INFINITY,
  labelsHidden: false,
  requestRoom: () => undefined,
})

export function RingCenter({
  innerRadius,
  children,
  className,
}: {
  /** Raio interno do anel, em px (ver `innerRadiusPx`). */
  innerRadius: number
  children: ReactNode
  className?: string
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(() => innerRadius * 2)
  /**
   * Etapa (a) da cascata: o rótulo secundário some ANTES de o número encolher.
   *
   * Vai a `true` e nunca volta dentro do mesmo miolo. É o que garante
   * convergência: esconder rótulo só diminui a altura, e altura menor só
   * aumenta a corda — nunca existe um segundo passo que reduza o espaço e
   * reabra o pedido.
   *
   * Quem decide não é este componente e sim o VALOR, porque só ele sabe se
   * coube; e não é o valor que decide o que é secundário, porque só quem
   * monta o miolo sabe disso. Daí o pedido em vez de um comando.
   */
  const [labelsHidden, setLabelsHidden] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    const measure = (): void => {
      // offsetHeight é o pior caso porque o conteúdo do pior caso está sempre
      // montado — ver o cabeçalho.
      setAvailable(ringSafeWidth(innerRadius, el.offsetHeight))
    }
    measure()
    // A altura muda quando a fonte carrega, quando o tema troca de tamanho e
    // quando os rótulos secundários somem.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [innerRadius])

  const fit: RingFit = {
    available,
    labelsHidden,
    requestRoom: () => setLabelsHidden(true),
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <RingFitContext.Provider value={fit}>
        <div
          ref={ref}
          /**
           * O raio interno vai para o DOM porque o teste de estresse precisa
           * verificar a promessa GEOMÉTRICA, não só a de largura: que os quatro
           * cantos do bloco de texto caibam dentro do círculo. Sem o raio, o
           * teste só saberia dizer "não estourou a caixa" — que é justamente a
           * verificação fraca que deixou o vazamento original passar.
           */
          data-ring-inner-radius={innerRadius}
          /* A folga esperada vai ao DOM junto do raio: o teste de estresse
             afere a DISTÂNCIA de cada canto/linha até a borda interna contra
             este valor — uma fonte só para app e teste (se a fórmula mudar, o
             teste acompanha). */
          data-ring-breathing={ringBreathing(innerRadius)}
          className={cn('flex flex-col items-center justify-center text-center whitespace-nowrap', className)}
          style={{ maxWidth: available }}
        >
          {children}
        </div>
      </RingFitContext.Provider>
    </div>
  )
}

/** Largura útil oferecida pelo `<RingCenter>` mais próximo. */
export function useAvailableWidth(): number {
  return useContext(RingFitContext).available
}

/**
 * A mesma cascata FORA de um anel — para mini-cards, badges e contadores.
 *
 * Um anel restringe por geometria; uma caixa comum restringe pela própria
 * largura. O que não muda é a regra: o número se adapta, o container não cede.
 * Sem isto, cada lugar apertado do app precisaria da sua própria gambiarra de
 * `truncate` — que corta o número, exatamente o que a regra proíbe.
 */
export function FitBox({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(Number.POSITIVE_INFINITY)

  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    const measure = (): void => setAvailable(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    /**
     * Só `min-w-0` de base: a LARGURA é assunto de quem chama.
     *
     * A primeira versão embutia `w-full`, e um chamador que passasse `w-auto`
     * caía no conflito de utilitárias do Tailwind (mesma propriedade, decidido
     * pela ordem no CSS gerado) — a coluna de valor virou linha inteira e
     * empurrou a descrição do gasto para fora da tela. `min-w-0` é o único
     * default legítimo aqui: ele não escolhe largura, só permite encolher.
     */
    <div ref={ref} className={cn('min-w-0', className)}>
      <RingFitContext.Provider value={{ available, labelsHidden: false, requestRoom: () => undefined }}>
        {children}
      </RingFitContext.Provider>
    </div>
  )
}

/**
 * Rótulo secundário do miolo — a primeira coisa a ceder espaço (etapa `a`).
 *
 * Ele SAI do fluxo quando cede, e não fica invisível ocupando lugar: o ganho
 * pretendido é justamente reduzir a altura do bloco, que é o que alarga a
 * corda. Isso não conflita com a regra de "não mudar de tamanho entre estados"
 * — aquela regra é sobre estados de INTERAÇÃO (hover), e isto aqui é função da
 * magnitude do valor, que não muda ao passar o mouse.
 */
export function RingLabel({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  const { labelsHidden } = useContext(RingFitContext)
  if (labelsHidden) return null
  return <span className={className}>{children}</span>
}

/**
 * Valor monetário que se adapta ao espaço em vez de transbordar.
 *
 * Aplica as etapas (b), (c) e (e) da cascata: prefixo `R$` menor, redução da
 * fonte até o piso e, só em último caso, notação compacta — sempre com o valor
 * exato no `title` e no `aria-label`.
 */
export function FitValue({
  cents,
  fontPx,
  weight = 800,
  allowCompact = true,
  hideCurrency = false,
  prefix = '',
  secondary = false,
  className,
}: {
  cents: number
  /** Tamanho desejado, em px. A cascata só desce a partir daqui. */
  fontPx: number
  weight?: number
  /**
   * Rótulo SECUNDÁRIO do miolo (ex.: o teto "de …" do anel de Hoje). Ele se
   * adapta à largura como qualquer valor, mas: (1) NÃO dispara o pedido-de-
   * espaço — quem manda a etapa (a) da cascata é o valor PRINCIPAL, e um
   * secundário a 12px vive perto do piso por natureza, não por aperto; (2) some
   * junto dos demais rótulos quando o principal pede espaço (como um RingLabel).
   */
  secondary?: boolean
  /**
   * Texto fixo antes do número (ex.: "de "), INCLUÍDO na medição. Sem isso, um
   * rótulo secundário como "de R$ 94 mi" mediria só o número e o "de " empurraria
   * a linha para fora do anel — o defeito que a régua de folga pegou no anel de
   * Hoje quando o gasto é pequeno mas o teto é gigante.
   */
  prefix?: string
  /**
   * Compactar é PROIBIDO onde o usuário confere centavo (formulários, listas,
   * histórico, faturas, parcelas). Nesses lugares, passe `false`: o valor
   * encolhe até o piso e para — nunca vira "R$ 10,4 mi".
   */
  allowCompact?: boolean
  /**
   * Omite o glifo `R$` — para o MIOLO DE ANEL (§⑦-fix). Dentro de um anel o
   * símbolo é redundante (o rótulo e o app inteiro já dizem "reais") e é
   * justamente ele que encosta na curva; tirá-lo libera ~15% de largura e some
   * com a assimetria óptica do glifo pequeno colado no anel. Fora dos anéis
   * (cards, listas, formulários) o `R$` continua normal.
   */
  hideCurrency?: boolean
  className?: string
}): ReactNode {
  const { available, requestRoom, labelsHidden } = useContext(RingFitContext)
  const privacy = usePrivacy()

  // Sob privacidade o valor real NÃO vai ao DOM (M2 §a) — mas a máscara também
  // tem largura e passa pela mesma cascata, senão ela é que transborda.
  const exactFull = privacy ? MONEY_MASK : formatBRL(cents)
  const compactFull = privacy || !allowCompact ? null : formatBRLCompact(cents)

  // No miolo de anel, o "R$ " sai do texto MEDIDO e RENDERIZADO (a máscara vira
  // só "••••••"). O `title`/`aria` de um compacto guardam a forma cheia, com R$.
  const strip = (s: string): string => s.replace(/^R\$\s*/, '')
  const exact = prefix + (hideCurrency ? strip(exactFull) : exactFull)
  const compact = compactFull === null ? null : prefix + (hideCurrency ? strip(compactFull) : compactFull)

  const fit = fitValue({ text: exact, compact, available, fontPx, weight })

  /**
   * Pede espaço só quando o número está REALMENTE em apuros.
   *
   * A primeira versão pedia a qualquer encolhimento — e o rótulo "gasto hoje"
   * sumia já em R$ 150,00, porque 30px nunca coube naquele anel com três
   * linhas. Trocar um rótulo útil por 6px de fonte é péssimo negócio: encolher
   * de 30 para 24 não custa legibilidade nenhuma, perder o rótulo custa
   * sentido.
   *
   * A etapa (a) da cascata continua vindo antes da (c) onde importa: quando o
   * valor chega perto do PISO ou precisa compactar, aí sim o rótulo cede — é
   * nesse ponto que o espaço vale mais que a decoração.
   */
  useLayoutEffect(() => {
    // Só o valor PRINCIPAL pede espaço. Um secundário a 12px está sempre perto
    // do piso — pedir espaço por isso esconderia os rótulos para sempre.
    if (secondary) return
    if (fit.compacted || fit.overflow || fit.fontPx <= MIN_FONT_PX + 3) requestRoom()
  }, [secondary, fit.compacted, fit.overflow, fit.fontPx, requestRoom])

  // Secundário some quando o principal pede espaço — igual a um <RingLabel>.
  if (secondary && labelsHidden) return null

  return (
    <span
      className={cn('tnum leading-none', className)}
      style={{ fontSize: fit.fontPx, fontWeight: weight }}
      // O exato só entra em title/aria quando houve compactação — e nunca sob
      // privacidade, onde o número real não pode existir no DOM de jeito nenhum.
      // Guarda a forma CHEIA (com R$), que é a leitura humana do valor exato.
      {...(fit.compacted && !privacy ? { title: exactFull, 'aria-label': exactFull } : {})}
    >
      {/* (b) o prefixo em 0.6em devolve ~15% de largura ao número, que é a
          parte que importa ler. */}
      {fit.text.startsWith('R$ ') ? (
        <>
          <span style={{ fontSize: '0.6em' }} className="text-ink-faint mr-0.5">
            R$
          </span>
          {fit.text.slice(3)}
        </>
      ) : (
        fit.text
      )}
    </span>
  )
}
