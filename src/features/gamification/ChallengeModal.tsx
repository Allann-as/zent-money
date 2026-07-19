import { useState, type ReactNode } from 'react'
import { Modal } from '@/design/components/Modal'
import { Button } from '@/design/components/Button'
import { Field, Input, MoneyInput } from '@/design/components/Input'
import { Select } from '@/design/components/Select'
import { Segmented } from '@/design/components/Segmented'
import { useZentData } from '@/store/dataStore'
import { setChallenge } from '@/store/gamificationActions'
import { toast } from '@/design/components/toast'

type Kind = 'cap' | 'reduce'

/** Criar o desafio do mês (um por vez): "máx R$ X em [cat]" ou "Y% menos". */
export function ChallengeModal({ open, onClose }: { open: boolean; onClose(): void }): ReactNode {
  const data = useZentData()
  const [kind, setKind] = useState<Kind>('cap')
  const [categoryId, setCategoryId] = useState(data.categories[0]?.id ?? '')
  const [cap, setCap] = useState<number | null>(null)
  const [percent, setPercent] = useState('')

  const percentNum = Number(percent)
  const valid =
    categoryId !== '' &&
    (kind === 'cap' ? cap !== null && cap > 0 : Number.isFinite(percentNum) && percentNum > 0 && percentNum < 100)

  function submit(): void {
    if (!valid) return
    if (kind === 'cap' && cap !== null) {
      setChallenge({ kind: 'cap', categoryId, capAmount: cap })
    } else {
      setChallenge({ kind: 'reduce', categoryId, reducePercent: percentNum })
    }
    toast.info('Desafio criado', 'Acompanhe o progresso na Visão geral.')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo desafio do mês"
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={submit}>
            Criar desafio
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {data.categories.length === 0 ? (
          <p className="text-[13px] text-ink-soft">Crie categorias em Gastos para propor um desafio.</p>
        ) : (
          <>
            <Field label="Tipo de desafio">
              <Segmented<Kind>
                ariaLabel="Tipo de desafio"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'cap', label: 'Gastar no máximo' },
                  { value: 'reduce', label: 'Gastar menos que o mês passado' },
                ]}
              />
            </Field>

            <Field label="Categoria">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoria do desafio">
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            {kind === 'cap' ? (
              <Field label="Limite do mês">
                <MoneyInput value={cap} onChange={setCap} aria-label="Limite do desafio" />
              </Field>
            ) : (
              <Field label="Reduzir em relação ao mês passado" hint="Percentual, ex.: 10 = gastar 10% menos">
                <Input
                  inputMode="numeric"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="10"
                  aria-label="Percentual de redução"
                  className="tnum"
                />
              </Field>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
