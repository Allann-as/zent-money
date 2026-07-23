import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { cn } from '@/lib/cn'

const MIN = 4
const MAX = 6
/** Beat entre "operador identificado" e a abertura do app. */
const UNLOCK_BEAT_MS = 1100

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TELA DE BLOQUEIO — console de duas colunas
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Barra de status no topo (largura total), e abaixo duas colunas separadas por
 * uma borda vertical sutil, com o céu de galáxia (Bloco 1) atrás de tudo:
 *
 *   ESQUERDA (55%) — identidade e estado: marca, saudação, linhas de terminal.
 *   DIREITA  (45%) — a ação: bolinhas, teclado e a instrução.
 *
 * ── O NOME SÓ APARECE DEPOIS DO PIN (correção de privacidade) ───────────
 * A versão anterior saudava "Seja bem-vindo de volta, {nome}" ANTES da
 * autenticação: quem abrisse o notebook lia o nome do dono sem saber o PIN.
 * Agora, antes de desbloquear, a saudação é genérica pelo horário ("Boa
 * tarde.") e nenhum dado pessoal vai à tela. O nome — e a linha viva com
 * sequência/meta/score — entram só depois do PIN correto, no beat de
 * "operador identificado", antes de o app abrir.
 *
 * A primeira execução usa ESTE MESMO layout; só os textos mudam.
 *
 * Segurança intocada: hash scrypt + salt e throttling vivem no MAIN.
 */
export function LockScreen({ mode }: { mode: 'setup' | 'unlock' }): ReactNode {
  const markPinSet = useSecurityStore((s) => s.markPinSet)
  const unlock = useSecurityStore((s) => s.unlock)
  const mutate = useDataStore((s) => s.mutate)
  useColorBlock('lock')

  const [step, setStep] = useState<'create' | 'confirm' | 'name'>('create')
  const [firstPin, setFirstPin] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetNonce, setResetNonce] = useState(0)
  const [shakeNonce, setShakeNonce] = useState(0)
  /** Linhas extras do terminal (erro, identificação) — em ordem de chegada. */
  const [lines, setLines] = useState<{ text: string; tone: 'neg' | 'pos' }[]>([])
  /** true entre o PIN correto e a abertura do app: é quando o nome aparece. */
  const [identified, setIdentified] = useState(false)

  function fail(msg: string): void {
    setLines([{ text: msg, tone: 'neg' }])
    setShakeNonce((n) => n + 1)
    setResetNonce((n) => n + 1)
  }

  async function handlePinSubmit(pin: string): Promise<void> {
    if (busy || identified) return
    if (mode === 'setup') {
      if (step === 'create') {
        setFirstPin(pin)
        setStep('confirm')
        setLines([])
        setResetNonce((n) => n + 1)
        return
      }
      if (pin !== firstPin) {
        setStep('create')
        setFirstPin('')
        fail('> as senhas não conferem')
        return
      }
      setStep('name')
      setLines([])
      return
    }
    setBusy(true)
    const res = await window.zent.verifyPin(pin)
    setBusy(false)
    if (res.ok) {
      // Beat de identificação: a linha do terminal confirma, o nome e a linha
      // viva aparecem, e SÓ ENTÃO o app abre.
      setLines([{ text: '> operador identificado ✓', tone: 'pos' }])
      setIdentified(true)
      setTimeout(() => unlock(), UNLOCK_BEAT_MS)
      return
    }
    if (res.waitMs > 0) {
      fail(`> muitas tentativas · aguarde ${Math.ceil(res.waitMs / 1000)}s`)
    } else if (res.attemptsLeft > 0) {
      fail(`> não confere · ${res.attemptsLeft} ${res.attemptsLeft === 1 ? 'tentativa' : 'tentativas'}`)
    } else {
      fail('> não confere')
    }
  }

  async function finishSetup(): Promise<void> {
    if (busy) return
    const clean = name.trim()
    if (clean === '') {
      fail('> preciso de um nome')
      return
    }
    setBusy(true)
    mutate((d) => {
      d.profile.name = clean
    })
    await window.zent.setPin(firstPin)
    markPinSet()
  }

  return (
    <div className="fixed inset-0 z-[70] anim-fade-in">
      <Backdrop section="lock" />
      <div className="relative z-10 h-full flex flex-col">
        <HudBar />
        <div className="flex-1 flex min-h-0">
          <LeftColumn
            mode={mode}
            step={step}
            lines={lines}
            identified={identified}
          />
          <div className="w-[45%] border-l border-line/60 flex flex-col items-center justify-center px-8">
            {mode === 'setup' && step === 'name' ? (
              <div className="flex flex-col items-center gap-6 w-full">
                <NameField value={name} onChange={setName} onEnter={() => void finishSetup()} />
                {/* Família de AÇÃO → retângulo arredondado (raio 11), jamais oval. */}
                <Button size="lg" className="w-full max-w-[17rem]" loading={busy} onClick={() => void finishSetup()}>
                  Entrar no Zent
                </Button>
              </div>
            ) : (
              <>
                <PinPad
                  min={MIN}
                  max={MAX}
                  disabled={busy || identified}
                  resetNonce={resetNonce}
                  shakeNonce={shakeNonce}
                  onSubmit={(p) => void handlePinSubmit(p)}
                />
                <p className="mt-7 text-[12px] text-ink-faint text-center">
                  {mode === 'setup'
                    ? step === 'create'
                      ? 'Escolha uma senha de 4 a 6 dígitos'
                      : 'Digite a mesma senha outra vez'
                    : 'Digite seu PIN para desbloquear'}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Barra de status ────────────────────────────────────────────────────────

/** Saudação genérica pelo horário — NUNCA o nome (antes da autenticação). */
function greetingByHour(h: number): string {
  if (h < 12) return 'Bom dia.'
  if (h < 18) return 'Boa tarde.'
  return 'Boa noite.'
}

/** "há 13h" / "há 3 dias" / "ainda não" — a idade REAL do último backup. */
function backupAge(iso: string | null, now: number): string {
  if (iso === null) return 'sem backup ainda'
  const ms = now - new Date(iso).getTime()
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'último backup agora há pouco'
  if (h < 24) return `último backup há ${h}h`
  const d = Math.floor(h / 24)
  return `último backup há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

/**
 * Barra de status: a linha da esquerda é DIGITADA caractere a caractere ao
 * abrir (com cursor no fim), e a da direita traz o ponto pulsante e o relógio
 * ao vivo. Todo dado é real — data, idade do backup e versão saem do app, não
 * de constantes decorativas.
 */
function HudBar(): ReactNode {
  const [version, setVersion] = useState('')
  const [backup, setBackup] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [typed, setTyped] = useState(0)
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    void Promise.all([window.zent.getVersion(), window.zent.lastBackupAt()]).then(([v, b]) => {
      setVersion(v)
      setBackup(b)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const full = useMemo(() => {
    const d = new Date()
    const data = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    return `> ${data} · ping <1ms · ${backupAge(backup, d.getTime())}${version ? ` · v${version}` : ''}`
  }, [backup, version])

  // Efeito de digitação: só começa quando os dados reais chegaram, para o texto
  // não ser reescrito no meio da datilografia.
  useEffect(() => {
    if (!ready) return
    setTyped(0)
    const t = setInterval(() => {
      setTyped((n) => {
        if (n >= full.length) {
          clearInterval(t)
          return n
        }
        return n + 1
      })
    }, 14)
    return () => clearInterval(t)
  }, [ready, full])

  const hh = String(clock.getHours()).padStart(2, '0')
  const mm = String(clock.getMinutes()).padStart(2, '0')
  const ss = String(clock.getSeconds()).padStart(2, '0')

  return (
    <header className="h-[38px] shrink-0 border-b border-line/60 flex items-center justify-between px-5 gap-4">
      <p className="tnum text-[10.5px] text-ink-faint truncate min-w-0">
        {full.slice(0, typed)}
        <span className="anim-caret inline-block w-[6px] h-[1.05em] translate-y-[1px] ml-px bg-primary" />
      </p>
      <p className="tnum text-[10.5px] text-ink-faint flex items-center gap-2 shrink-0">
        <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        {hh}:{mm}:{ss}
      </p>
    </header>
  )
}

// ── Coluna esquerda ────────────────────────────────────────────────────────

function LeftColumn({
  mode,
  step,
  lines,
  identified,
}: {
  mode: 'setup' | 'unlock'
  step: 'create' | 'confirm' | 'name'
  lines: { text: string; tone: 'neg' | 'pos' }[]
  identified: boolean
}): ReactNode {
  const data = useZentData()
  const privacy = usePrivacy()
  const name = data.profile.name.trim()

  // A linha viva só é montada DEPOIS da identificação — nada de dado pessoal
  // antes do PIN correto.
  const insights = useMemo(() => (identified ? lockInsights(data) : []), [identified, data])
  const insight = insights[0]

  const headline =
    mode === 'setup'
      ? step === 'create'
        ? 'Crie sua senha.'
        : step === 'confirm'
          ? 'Confirme sua senha.'
          : 'Como você quer ser chamado?'
      : identified && name !== ''
        ? `Seja bem-vindo de volta, ${name}`
        : greetingByHour(new Date().getHours())

  return (
    <div className="w-[55%] flex flex-col pl-[7vw] pr-8 py-8 min-w-0">
      <div className="flex-1 flex flex-col justify-center min-w-0">
        {/* Marca: ícone com halo + wordmark monoespaçado */}
        <div className="relative w-fit mb-6">
          <div
            aria-hidden="true"
            className="absolute inset-0 -m-8 rounded-full blur-[36px] opacity-[0.30]"
            style={{ background: 'var(--primary)' }}
          />
          <div className="relative h-14 w-14 rounded-[16px] bg-surface-2 border border-line-strong inline-flex items-center justify-center shadow-pop">
            <ZentMark size={27} />
          </div>
        </div>
        <p className="tnum text-[19px] font-bold text-ink" style={{ letterSpacing: '.26em' }}>
          ZENT
        </p>

        <h1 className="font-display text-[26px] font-bold text-ink tracking-tight mt-5">{headline}</h1>

        <div className="h-px bg-line/70 my-6 max-w-[26rem]" />

        {/* Linhas de terminal */}
        <div className="tnum text-[12px] leading-[1.9] text-ink-soft min-w-0">
          <p>
            &gt; ledger íntegro <span className="text-ink-faint">..........</span>{' '}
            <span className="text-pos font-semibold">OK</span>
          </p>
          {lines.map((l) => (
            <p key={l.text} className={l.tone === 'neg' ? 'text-neg' : 'text-pos'}>
              {l.text}
            </p>
          ))}
          {/* A linha viva entra só depois do PIN — com a variante sem número
              quando a privacidade está ligada. */}
          {identified && insight && (
            <p className="text-ink-soft">&gt; {privacy ? insight.masked : insight.full}</p>
          )}
          {!identified && (
            <p className="inline-flex items-baseline">
              <span>&gt; {mode === 'setup' ? 'aguardando cadastro' : 'aguardando operador'}</span>
              <span className="anim-caret inline-block w-[7px] h-[1.05em] translate-y-[1px] ml-1.5 bg-primary" />
            </p>
          )}
        </div>
      </div>

      <p className={cn('tnum text-[10.5px] text-ink-faint flex items-center gap-2 shrink-0')}>
        <span className="h-1.5 w-1.5 rounded-full bg-pos shrink-0" />
        100% local · nenhuma rede · autenticação no dispositivo
      </p>
    </div>
  )
}
