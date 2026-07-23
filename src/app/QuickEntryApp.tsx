import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Check, Zap } from 'lucide-react'
import { ZentMark } from '@/design/ZentLogo'
import { useColorBlock } from '@/design/blocks'
import { Button } from '@/design/components/Button'
import { Field, Input, MoneyInput } from '@/design/components/Input'
import { Select } from '@/design/components/Select'
import { PinPad } from '@/features/security/PinPad'
import type { QuickDataDTO, QuickOriginDTO } from '../../electron/ipc-api'

type Phase = 'loading' | 'locked' | 'form' | 'saved'

/** Aplica o tema persistido (a mini é outro renderer, mas divide o localStorage). */
function applyPersistedTheme(): void {
  try {
    const raw = localStorage.getItem('zent-ui')
    const theme = raw ? (JSON.parse(raw)?.state?.theme as string | undefined) : undefined
    document.documentElement.dataset['theme'] = theme === 'light' ? 'light' : 'dark'
  } catch {
    document.documentElement.dataset['theme'] = 'dark'
  }
}

function parseOrigin(value: string): QuickOriginDTO {
  if (value.startsWith('bank:')) return { kind: 'bank', bankId: value.slice(5) }
  if (value.startsWith('card:')) return { kind: 'card', cardId: value.slice(5) }
  return null
}

/**
 * Mini-janela de lançamento rápido da bandeja (M5). Renderer separado (bundle com
 * `#quick`). Se o app está BLOQUEADO, exige o PIN antes de exibir qualquer coisa
 * — a bandeja não pode ser um furo no bloqueio. PIN certo destrava o app inteiro.
 */
export function QuickEntryApp(): ReactNode {
  const [phase, setPhase] = useState<Phase>('loading')
  const [data, setData] = useState<QuickDataDTO>({ categories: [], banks: [], cards: [] })
  const [amount, setAmount] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [origin, setOrigin] = useState('')
  const [pinResetNonce, setPinResetNonce] = useState(0)
  const [pinShakeNonce, setPinShakeNonce] = useState(0)
  const [pinMsg, setPinMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // A mini-janela herda o Bloco 1 · Comando (R10 §2), como a bandeja.
  useColorBlock('lock')
  useEffect(() => applyPersistedTheme(), [])

  const refresh = useCallback(async () => {
    applyPersistedTheme()
    const [locked, d] = await Promise.all([window.zent.quickIsLocked(), window.zent.getQuickData()])
    setData(d)
    setCategoryId((prev) => prev || (d.categories[0]?.id ?? ''))
    setPhase(locked ? 'locked' : 'form')
  }, [])

  // Boot + toda vez que a mini é exibida (reseta o rascunho e re-checa o bloqueio).
  useEffect(() => {
    void refresh()
    return window.zent.onQuickShow(() => {
      setAmount(null)
      setDescription('')
      setOrigin('')
      setPinMsg(null)
      setPhase('loading')
      void refresh()
    })
  }, [refresh])

  // Esc fecha a mini a qualquer momento.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') window.zent.closeQuick()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function onPin(pin: string): Promise<void> {
    if (busy) return
    setBusy(true)
    const res = await window.zent.verifyPin(pin)
    setBusy(false)
    if (res.ok) {
      window.zent.quickUnlock()
      setPinMsg(null)
      setPhase('form')
      return
    }
    setPinShakeNonce((n) => n + 1)
    setPinResetNonce((n) => n + 1)
    if (res.waitMs > 0) setPinMsg(`Aguarde ${Math.ceil(res.waitMs / 1000)}s.`)
    else setPinMsg('PIN incorreto.')
  }

  const valid = amount !== null && amount > 0 && categoryId !== ''

  function save(): void {
    if (!valid || amount === null) return
    window.zent.submitQuickExpense({
      amount,
      categoryId,
      description: description.trim(),
      origin: parseOrigin(origin),
    })
    setPhase('saved')
    setTimeout(() => window.zent.closeQuick(), 1500)
  }

  return (
    <div className="h-full w-full flex flex-col bg-bg text-ink" style={{ backgroundImage: 'linear-gradient(180deg, var(--bg-grad-a) 0%, var(--bg-grad-b) 100%)' }}>
      {/* Cabeçalho (identidade Zent) — também é a área de arrastar a janela */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-line"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <ZentMark size={18} />
        <span className="font-display text-[13.5px] font-semibold text-ink">Lançamento rápido</span>
        <span className="ml-auto text-[11px] text-ink-faint">Esc fecha</span>
      </div>

      {phase === 'loading' && <div className="flex-1" />}

      {phase === 'locked' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
          <p className="text-[12.5px] text-ink-soft text-center">
            Digite seu PIN para lançar pela bandeja.
          </p>
          <PinPad
            min={4}
            max={6}
            disabled={busy}
            resetNonce={pinResetNonce}
            shakeNonce={pinShakeNonce}
            onSubmit={(pin) => void onPin(pin)}
          />
          <p className={`text-[12px] h-4 ${pinMsg ? 'text-neg' : 'text-transparent'}`} role="alert">
            {pinMsg ?? ' '}
          </p>
        </div>
      )}

      {phase === 'form' && (
        <div className="flex-1 flex flex-col gap-3 px-4 py-4">
          <Field label="Valor">
            <MoneyInput value={amount} onChange={setAmount} autoFocus aria-label="Valor do gasto rápido" />
          </Field>
          <Field label="Categoria">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoria do gasto rápido">
              {data.categories.length === 0 && <option value="">— sem categorias —</option>}
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Descrição (opcional)">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && valid) save()
              }}
              placeholder="Ex.: Café, Uber…"
              aria-label="Descrição do gasto rápido"
            />
          </Field>
          <Field label="Pago com (opcional)">
            <Select value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Origem do gasto rápido">
              <option value="">Sem origem</option>
              {data.banks.map((b) => (
                <option key={b.id} value={`bank:${b.id}`}>
                  {b.name}
                </option>
              ))}
              {data.cards.map((c) => (
                <option key={c.id} value={`card:${c.id}`}>
                  {c.name} (cartão)
                </option>
              ))}
            </Select>
          </Field>
          <Button className="mt-1 w-full" disabled={!valid} onClick={save}>
            <Zap size={15} /> Lançar
          </Button>
        </div>
      )}

      {phase === 'saved' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <span className="h-12 w-12 rounded-full bg-pos-soft inline-flex items-center justify-center">
            <Check size={22} className="text-pos" />
          </span>
          <p className="text-[13px] font-medium text-ink">Gasto lançado</p>
        </div>
      )}
    </div>
  )
}
