import { useState, type ReactNode } from 'react'
import { Modal } from '@/design/components/Modal'
import { toast } from '@/design/components/toast'
import { PinPad } from './PinPad'

/**
 * Alterar o PIN (M2 §b): confirma o atual, define o novo e repete para confirmar.
 * O PIN atual é verificado no main (com throttling) antes de seguir.
 */
export function ChangePinModal({ open, onClose }: { open: boolean; onClose(): void }): ReactNode {
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current')
  const [newPin, setNewPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resetNonce, setResetNonce] = useState(0)
  const [shakeNonce, setShakeNonce] = useState(0)
  const [openedFor, setOpenedFor] = useState(false)

  if (open !== openedFor) {
    setOpenedFor(open)
    if (open) {
      setStep('current')
      setNewPin('')
      setMessage(null)
      setBusy(false)
    }
  }

  const fail = (msg: string): void => {
    setMessage(msg)
    setShakeNonce((n) => n + 1)
    setResetNonce((n) => n + 1)
  }

  async function submit(pin: string): Promise<void> {
    if (busy) return
    if (step === 'current') {
      setBusy(true)
      const res = await window.zent.verifyPin(pin)
      setBusy(false)
      if (!res.ok) {
        fail(res.waitMs > 0 ? `Muitas tentativas. Aguarde ${Math.ceil(res.waitMs / 1000)}s.` : 'PIN atual incorreto.')
        return
      }
      setStep('new')
      setMessage(null)
      setResetNonce((n) => n + 1)
      return
    }
    if (step === 'new') {
      setNewPin(pin)
      setStep('confirm')
      setMessage(null)
      setResetNonce((n) => n + 1)
      return
    }
    if (pin !== newPin) {
      setStep('new')
      setNewPin('')
      fail('Os PINs não coincidem. Escolha o novo PIN de novo.')
      return
    }
    setBusy(true)
    await window.zent.setPin(pin)
    setBusy(false)
    toast.success('PIN alterado', 'Use o novo PIN na próxima vez que o app bloquear.')
    onClose()
  }

  const title = step === 'current' ? 'PIN atual' : step === 'new' ? 'Novo PIN' : 'Confirme o novo PIN'
  const hint =
    step === 'current'
      ? 'Digite seu PIN atual para continuar.'
      : step === 'new'
        ? 'Escolha um novo PIN de 4 a 6 dígitos.'
        : 'Digite o novo PIN outra vez.'

  return (
    <Modal open={open} onClose={onClose} title="Alterar PIN" width={360}>
      <div className="flex flex-col items-center gap-6 py-2">
        <p className="text-[13px] text-ink-soft text-center">
          <strong className="text-ink font-semibold">{title}</strong>
          <br />
          {hint}
        </p>
        <PinPad
          min={4}
          max={6}
          disabled={busy}
          resetNonce={resetNonce}
          shakeNonce={shakeNonce}
          onSubmit={(pin) => void submit(pin)}
        />
        <p className={`text-[12.5px] h-4 text-center ${message ? 'text-neg' : 'text-transparent'}`} role="alert" aria-live="polite">
          {message ?? ' '}
        </p>
      </div>
    </Modal>
  )
}
