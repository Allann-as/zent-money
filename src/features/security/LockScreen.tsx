import { useEffect, useState, type ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { ZentMark } from '@/design/ZentLogo'
import { Backdrop } from '@/design/Backdrop'
import { useColorBlock } from '@/design/blocks'
import { useSecurityStore } from '@/store/securityStore'
import { PinPad } from './PinPad'

const MIN = 4
const MAX = 6

/**
 * Tela de bloqueio / primeira execução (M2 §b) — o primeiro contato com o app,
 * tratada como peça de design final (M3): fundo em camadas via <Backdrop>
 * (base full-bleed + glows + arcos descentralizados cortados pela borda), logo
 * com halo no acento, bolinhas que preenchem e tremem no erro.
 *
 * A composição é centrada opticamente (viés leve pra cima, ~45% da altura) com
 * um rodapé de versão discreto fechando a base — corrige o "terço inferior
 * vazio" que a QA do M2 leu como uma faixa preta, sem ancorar tudo no topo.
 *
 * Dois modos:
 * - **setup** (sem PIN ainda): boas-vindas → definir → confirmar.
 * - **unlock** (PIN existe): digitar para desbloquear, com throttling do main.
 */
export function LockScreen({ mode }: { mode: 'setup' | 'unlock' }): ReactNode {
  const markPinSet = useSecurityStore((s) => s.markPinSet)
  const unlock = useSecurityStore((s) => s.unlock)
  // Bloqueio e primeira execução pertencem ao Bloco 1 · Comando (R10 §2).
  useColorBlock('lock')
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.zent.getVersion().then(setVersion)
  }, [])

  // setup: 'create' → 'confirm'; unlock: sempre 'create' (uma etapa)
  const [step, setStep] = useState<'create' | 'confirm'>('create')
  const [firstPin, setFirstPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resetNonce, setResetNonce] = useState(0)
  const [shakeNonce, setShakeNonce] = useState(0)

  const fail = (msg: string): void => {
    setMessage(msg)
    setShakeNonce((n) => n + 1)
    setResetNonce((n) => n + 1)
  }

  async function handleSubmit(pin: string): Promise<void> {
    if (busy) return
    if (mode === 'setup') {
      if (step === 'create') {
        setFirstPin(pin)
        setStep('confirm')
        setMessage(null)
        setResetNonce((n) => n + 1)
        return
      }
      // confirm
      if (pin !== firstPin) {
        setStep('create')
        setFirstPin('')
        fail('Os PINs não coincidem. Vamos de novo.')
        return
      }
      setBusy(true)
      await window.zent.setPin(pin)
      markPinSet()
      return
    }
    // unlock
    setBusy(true)
    const res = await window.zent.verifyPin(pin)
    setBusy(false)
    if (res.ok) {
      unlock()
      return
    }
    if (res.waitMs > 0) {
      const secs = Math.ceil(res.waitMs / 1000)
      fail(`Muitas tentativas. Aguarde ${secs}s antes de tentar de novo.`)
    } else if (res.attemptsLeft > 0) {
      fail(`PIN incorreto. ${res.attemptsLeft} ${res.attemptsLeft === 1 ? 'tentativa' : 'tentativas'} antes de uma pausa.`)
    } else {
      fail('PIN incorreto.')
    }
  }

  const title =
    mode === 'setup'
      ? step === 'create'
        ? 'Bem-vindo ao Zent Money'
        : 'Confirme seu PIN'
      : 'Zent Money'
  const subtitle =
    mode === 'setup'
      ? step === 'create'
        ? 'Crie um PIN de 4 a 6 dígitos para proteger seus dados de olhares casuais.'
        : 'Digite o mesmo PIN outra vez.'
      : 'Digite seu PIN para desbloquear.'

  return (
    <div className="fixed inset-0 z-[70] anim-fade-in">
      {/* Fundo em camadas (M3): base full-bleed + glows + arcos descentralizados
          cortados pela borda. Fonte única com o resto do app — e é o que fecha a
          "faixa preta" do terço inferior reportada na QA do M2. */}
      <Backdrop section="lock" />

      {/* Centro óptico com viés leve pra cima (~45% da altura) e rodapé de versão
          fechando a base. */}
      <div className="relative z-10 h-full flex flex-col items-center">
        <div className="flex-1 flex flex-col items-center justify-center px-8 w-full max-w-sm pb-[9vh]">
          {/* Logo com halo no acento — presença sem virar mancha */}
          <div className="relative mb-7">
            <div
              aria-hidden="true"
              className="absolute inset-0 -m-10 rounded-full blur-[42px] opacity-[0.32]"
              style={{ background: 'var(--primary)' }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 -m-4 rounded-full blur-xl opacity-[0.42]"
              style={{ background: 'var(--primary)' }}
            />
            <div className="relative h-16 w-16 rounded-[18px] bg-surface-2 border border-line-strong inline-flex items-center justify-center shadow-pop">
              <ZentMark size={30} />
            </div>
          </div>

          <h1 className="font-display text-[20px] font-bold text-ink tracking-tight text-center">{title}</h1>
          <p className="text-[13px] text-ink-soft text-center mt-2 mb-8 leading-relaxed max-w-[19rem]">
            {subtitle}
          </p>

          <PinPad
            min={MIN}
            max={MAX}
            disabled={busy}
            resetNonce={resetNonce}
            shakeNonce={shakeNonce}
            onSubmit={(pin) => void handleSubmit(pin)}
          />

          <p
            className={cnMsg(message)}
            role={message ? 'alert' : undefined}
            aria-live="polite"
          >
            {message ?? ' '}
          </p>

          {mode === 'setup' && (
            <p className="mt-6 flex items-center gap-1.5 text-[11.5px] text-ink-faint text-center max-w-[19rem] leading-relaxed">
              <ShieldCheck size={13} className="shrink-0" />
              O PIN protege de olhares casuais; ele não criptografa o arquivo de dados.
            </p>
          )}
        </div>

        {/* Rodapé de versão — fecha a composição na base sem competir com o cofre */}
        <footer className="pb-5 text-[11px] text-ink-faint tracking-wide">
          Zent Money{version ? ` · v${version}` : ''}
        </footer>
      </div>
    </div>
  )
}

/** Classe da linha de mensagem — vermelha quando há erro, reservando a altura. */
function cnMsg(message: string | null): string {
  return `text-[12.5px] mt-5 h-4 text-center ${message ? 'text-neg' : 'text-transparent'}`
}
