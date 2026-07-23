import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { ZentMark } from '@/design/ZentLogo'
import { Backdrop } from '@/design/Backdrop'
import { Button } from '@/design/components/Button'
import { useColorBlock } from '@/design/blocks'
import { useSecurityStore } from '@/store/securityStore'
import { useDataStore, useZentData } from '@/store/dataStore'
import { usePrivacy } from '@/design/money'
import { lockInsights } from '@/engine/lockInsight'
import { PinPad } from './PinPad'
import { NameField } from './NameField'

const MIN = 4
const MAX = 6

/**
 * Tela de bloqueio / primeira execução — o primeiro contato com o app, tratada
 * como peça de design final (M3): fundo em camadas via <Backdrop> (base
 * full-bleed + glows + arcos), logo com halo, bolinhas que preenchem.
 *
 * ── PRIMEIRA EXECUÇÃO EM TRÊS PASSOS (R10 §⑦) ───────────────────────────
 * Mesmo layout do bloqueio (não há card centralizado): criar senha → confirmar
 * senha → escolher o nome. O cursor de terminal na lateral do texto pisca
 * durante todo o fluxo — a impressão de que o sistema está "digitando ao vivo"
 * não se interrompe entre os passos.
 *
 * ── DESBLOQUEIO ─────────────────────────────────────────────────────────
 * Saúda pelo nome ("Seja bem-vindo de volta, {nome}") e mostra a LINHA VIVA:
 * uma frase rotativa com dado real (sequência, meta, score, marco), com
 * variante sem número quando a privacidade está ativa.
 *
 * Segurança intocada: hash scrypt + salt e throttling vivem no MAIN; o renderer
 * nunca vê o hash. O nome é dado de perfil (não segredo) e é gravado só no fim,
 * junto do PIN.
 */
export function LockScreen({ mode }: { mode: 'setup' | 'unlock' }): ReactNode {
  const markPinSet = useSecurityStore((s) => s.markPinSet)
  const unlock = useSecurityStore((s) => s.unlock)
  const mutate = useDataStore((s) => s.mutate)
  // Bloqueio e primeira execução pertencem ao Bloco 1 · Comando (R10 §2).
  useColorBlock('lock')
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.zent.getVersion().then(setVersion)
  }, [])

  // setup: 'create' → 'confirm' → 'name'; unlock: sempre 'create' (uma etapa)
  const [step, setStep] = useState<'create' | 'confirm' | 'name'>('create')
  const [firstPin, setFirstPin] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resetNonce, setResetNonce] = useState(0)
  const [shakeNonce, setShakeNonce] = useState(0)

  const fail = (msg: string): void => {
    setMessage(msg)
    setShakeNonce((n) => n + 1)
    setResetNonce((n) => n + 1)
  }

  async function handlePinSubmit(pin: string): Promise<void> {
    if (busy) return
    if (mode === 'setup') {
      if (step === 'create') {
        setFirstPin(pin)
        setStep('confirm')
        setMessage(null)
        setResetNonce((n) => n + 1)
        return
      }
      // confirm: bate com o primeiro? Se sim, vai ao passo do nome — a senha só
      // vai ao disco no fim, junto do nome (um commit só da primeira execução).
      if (pin !== firstPin) {
        setStep('create')
        setFirstPin('')
        fail('As senhas não coincidem. Vamos de novo.')
        return
      }
      setStep('name')
      setMessage(null)
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
      fail(`Senha incorreta. ${res.attemptsLeft} ${res.attemptsLeft === 1 ? 'tentativa' : 'tentativas'} antes de uma pausa.`)
    } else {
      fail('Senha incorreta.')
    }
  }

  async function finishSetup(): Promise<void> {
    if (busy) return
    const clean = name.trim()
    if (clean === '') {
      setMessage('Como você quer ser chamado?')
      return
    }
    setBusy(true)
    // Ordem: grava o nome, depois define a senha e só então libera. A senha ser
    // a última garante que, se algo falhar antes, o app não fica "com PIN e sem
    // nome" num estado meio-configurado.
    mutate((d) => {
      d.profile.name = clean
    })
    await window.zent.setPin(firstPin)
    markPinSet()
  }

  return (
    <div className="fixed inset-0 z-[70] anim-fade-in">
      {/* Fundo em camadas (M3): base full-bleed + glows + arcos. */}
      <Backdrop section="lock" />

      <div className="relative z-10 h-full flex flex-col items-center">
        <div className="flex-1 flex flex-col items-center justify-center px-8 w-full max-w-sm pb-[9vh]">
          {/* Logo com halo no acento */}
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

          {mode === 'setup' ? (
            <SetupBody
              step={step}
              name={name}
              setName={setName}
              busy={busy}
              min={MIN}
              max={MAX}
              resetNonce={resetNonce}
              shakeNonce={shakeNonce}
              onPin={(p) => void handlePinSubmit(p)}
              onFinish={() => void finishSetup()}
            />
          ) : (
            <UnlockBody
              busy={busy}
              min={MIN}
              max={MAX}
              resetNonce={resetNonce}
              shakeNonce={shakeNonce}
              onPin={(p) => void handlePinSubmit(p)}
            />
          )}

          <p className={cnMsg(message)} role={message ? 'alert' : undefined} aria-live="polite">
            {message ?? ' '}
          </p>

          {mode === 'setup' && step !== 'name' && (
            <p className="mt-6 flex items-center gap-1.5 text-[11.5px] text-ink-faint text-center max-w-[19rem] leading-relaxed">
              <ShieldCheck size={13} className="shrink-0" />
              A senha protege de olhares casuais; ela não criptografa o arquivo de dados.
            </p>
          )}
        </div>

        <footer className="pb-5 text-[11px] text-ink-faint tracking-wide">
          Zent Money{version ? ` · v${version}` : ''}
        </footer>
      </div>
    </div>
  )
}

/**
 * Linha de "sistema digitando ao vivo": o texto seguido de um cursor de
 * terminal que pisca. Presente em TODOS os passos, para a impressão não se
 * interromper (R10 §⑦).
 */
function TypedLine({ children }: { children: ReactNode }): ReactNode {
  return (
    <p className="text-[13px] text-ink-soft text-center leading-relaxed max-w-[19rem] inline-flex items-baseline justify-center gap-1">
      <span>{children}</span>
      <span className="anim-caret inline-block w-[7px] h-[1.05em] translate-y-[1px] bg-primary shrink-0" />
    </p>
  )
}

function SetupBody({
  step,
  name,
  setName,
  busy,
  min,
  max,
  resetNonce,
  shakeNonce,
  onPin,
  onFinish,
}: {
  step: 'create' | 'confirm' | 'name'
  name: string
  setName(v: string): void
  busy: boolean
  min: number
  max: number
  resetNonce: number
  shakeNonce: number
  onPin(pin: string): void
  onFinish(): void
}): ReactNode {
  const title =
    step === 'create' ? 'Crie sua senha' : step === 'confirm' ? 'Confirme sua senha' : 'Como você quer ser chamado?'
  const subtitle =
    step === 'create'
      ? 'Escolha uma senha de 4 a 6 dígitos para proteger seus dados.'
      : step === 'confirm'
        ? 'Digite a mesma senha outra vez.'
        : 'É assim que o Zent vai te receber toda vez.'

  return (
    <>
      <h1 className="font-display text-[20px] font-bold text-ink tracking-tight text-center">{title}</h1>
      <div className="mt-2 mb-8">
        <TypedLine>{subtitle}</TypedLine>
      </div>

      {step === 'name' ? (
        <div className="flex flex-col items-center gap-6 w-full">
          <NameField value={name} onChange={setName} onEnter={onFinish} />
          {/* Família de AÇÃO → retângulo arredondado (raio 11), jamais oval. */}
          <Button size="lg" className="w-full max-w-[17rem]" loading={busy} onClick={onFinish}>
            Entrar no Zent
          </Button>
        </div>
      ) : (
        <PinPad
          min={min}
          max={max}
          disabled={busy}
          resetNonce={resetNonce}
          shakeNonce={shakeNonce}
          onSubmit={onPin}
        />
      )}
    </>
  )
}

function UnlockBody({
  busy,
  min,
  max,
  resetNonce,
  shakeNonce,
  onPin,
}: {
  busy: boolean
  min: number
  max: number
  resetNonce: number
  shakeNonce: number
  onPin(pin: string): void
}): ReactNode {
  const data = useZentData()
  const privacy = usePrivacy()
  const name = data.profile.name.trim()

  const insights = useMemo(() => lockInsights(data), [data])
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (insights.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % insights.length), 4500)
    return () => clearInterval(t)
  }, [insights.length])
  const insight = insights[idx % insights.length]

  return (
    <>
      <h1 className="font-display text-[20px] font-bold text-ink tracking-tight text-center">
        {name ? `Seja bem-vindo de volta, ${name}` : 'Zent Money'}
      </h1>
      {/* Linha viva: dado real, com variante SEM número sob privacidade (§⑦).
          `data-testid` fixo para o teste apontar sem depender do texto. */}
      <div className="mt-2 mb-8 min-h-[2.4rem] flex items-center" data-testid="lock-insight">
        <TypedLine>{insight ? (privacy ? insight.masked : insight.full) : 'Digite sua senha para desbloquear.'}</TypedLine>
      </div>

      <PinPad
        min={min}
        max={max}
        disabled={busy}
        resetNonce={resetNonce}
        shakeNonce={shakeNonce}
        onSubmit={onPin}
      />
    </>
  )
}

/** Classe da linha de mensagem — vermelha quando há erro, reservando a altura. */
function cnMsg(message: string | null): string {
  return `text-[12.5px] mt-5 h-4 text-center ${message ? 'text-neg' : 'text-transparent'}`
}
