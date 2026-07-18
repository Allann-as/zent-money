import { useState, type ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { ZentMark } from '@/design/ZentLogo'
import { useChartColors } from '@/design/charts/useChartColors'
import { useSecurityStore } from '@/store/securityStore'
import { PinPad } from './PinPad'

const MIN = 4
const MAX = 6

/**
 * Tela de bloqueio / primeira execução (M2 §b) — o primeiro contato com o app,
 * tratada como peça de design final (padrão M3): fundo em camadas (gradiente do
 * body + dois glows radiais + geometria de arcos cortada pela borda), logo com
 * halo no acento, bolinhas que preenchem e tremem no erro.
 *
 * Dois modos:
 * - **setup** (sem PIN ainda): boas-vindas → definir → confirmar.
 * - **unlock** (PIN existe): digitar para desbloquear, com throttling do main.
 */
export function LockScreen({ mode }: { mode: 'setup' | 'unlock' }): ReactNode {
  const colors = useChartColors()
  const markPinSet = useSecurityStore((s) => s.markPinSet)
  const unlock = useSecurityStore((s) => s.unlock)

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
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden anim-fade-in">
      {/* Camadas de fundo (padrão M3): glows + geometria de arcos cortada pela borda */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 h-[900px] w-[900px] rounded-full blur-3xl opacity-[0.07]"
          style={{ background: colors.primary }}
        />
        <div
          className="absolute -bottom-52 -right-40 h-[560px] w-[560px] rounded-full blur-3xl opacity-[0.04]"
          style={{ background: colors.primary }}
        />
        <svg
          className="absolute -top-24 left-1/2 -translate-x-1/2 opacity-[0.04]"
          width="760"
          height="760"
          viewBox="0 0 760 760"
          fill="none"
          stroke={colors.primary}
          strokeWidth="1"
        >
          <circle cx="380" cy="380" r="200" />
          <circle cx="380" cy="380" r="280" />
          <circle cx="380" cy="380" r="360" />
        </svg>
      </div>

      <div className="relative flex flex-col items-center px-8 py-10 w-full max-w-sm">
        {/* Logo com halo no acento */}
        <div className="relative mb-7">
          <div
            aria-hidden="true"
            className="absolute inset-0 -m-6 rounded-full blur-2xl opacity-30"
            style={{ background: colors.primary }}
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
          {message ?? ' '}
        </p>

        {mode === 'setup' && (
          <p className="mt-6 flex items-center gap-1.5 text-[11.5px] text-ink-faint text-center max-w-[19rem] leading-relaxed">
            <ShieldCheck size={13} className="shrink-0" />
            O PIN protege de olhares casuais; ele não criptografa o arquivo de dados.
          </p>
        )}
      </div>
    </div>
  )
}

/** Classe da linha de mensagem — vermelha quando há erro, reservando a altura. */
function cnMsg(message: string | null): string {
  return `text-[12.5px] mt-5 h-4 text-center ${message ? 'text-neg' : 'text-transparent'}`
}
