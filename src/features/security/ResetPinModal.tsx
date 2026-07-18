import { useState, type ReactNode } from 'react'
import { Modal } from '@/design/components/Modal'
import { Button } from '@/design/components/Button'
import { Input } from '@/design/components/Input'
import { toast } from '@/design/components/toast'
import { useSecurityStore } from '@/store/securityStore'

/**
 * "Esqueci o PIN" (M2 §b) — reseta SÓ o PIN, com fricção (digitar RESET). Os
 * dados não são tocados: o PIN é barreira visual, não criptografia. Sem PIN, a
 * próxima abertura cai na primeira execução para definir um novo.
 */
export function ResetPinModal({ open, onClose }: { open: boolean; onClose(): void }): ReactNode {
  const [text, setText] = useState('')
  const [openedFor, setOpenedFor] = useState(false)
  const clearPin = useSecurityStore((s) => s.clearPin)

  if (open !== openedFor) {
    setOpenedFor(open)
    if (open) setText('')
  }

  const canReset = text.trim().toUpperCase() === 'RESET'

  async function doReset(): Promise<void> {
    if (!canReset) return
    await window.zent.resetPin()
    clearPin()
    toast.success('PIN removido', 'Você definirá um novo PIN na próxima vez que abrir o app.')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Esqueci o PIN"
      width={400}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={!canReset} onClick={() => void doReset()}>
            Remover PIN
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-ink-soft leading-relaxed">
          Isto remove <strong className="text-ink">apenas o PIN</strong> — seus lançamentos, contas e
          tudo o mais ficam intactos (o PIN nunca criptografou nada). Na próxima vez que abrir o app,
          você definirá um novo PIN.
        </p>
        <p className="text-[12.5px] text-ink-faint">
          Para confirmar, digite <strong className="text-ink tracking-wide">RESET</strong> abaixo.
        </p>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="RESET"
          autoFocus
          aria-label="Digite RESET para confirmar"
        />
      </div>
    </Modal>
  )
}
