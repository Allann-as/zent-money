import { useState, type ReactNode } from 'react'
import { Modal } from '@/design/components/Modal'
import { Button } from '@/design/components/Button'
import { Field, Input, MoneyInput } from '@/design/components/Input'
import { Select } from '@/design/components/Select'
import { Segmented } from '@/design/components/Segmented'
import { ColorPicker } from '@/design/components/ColorPicker'
import { toast } from '@/design/components/toast'
import { useDataStore, useZentData } from '@/store/dataStore'
import { addPurchase } from '@/store/mutations'
import { reconcileBankBalance } from '@/store/ledgerActions'
import { bankBalances } from '@/engine/ledger'
import { useBRL } from '@/design/money'
import { currentYm, formatYmLong, formatYmShort, todayIso, addMonths } from '@/engine/dates'
import { installmentImpact } from '@/engine/credit'
import { newId } from '@/lib/id'
import { cn } from '@/lib/cn'
import type { Bank, Card, Purchase } from '@/data/schema'

// ── Banco ────────────────────────────────────────────────────────────────────

export type BankDialogState = 'closed' | 'new' | Bank

export function BankDialog({
  state,
  onClose,
}: {
  state: BankDialogState
  onClose(): void
}): ReactNode {
  const mutate = useDataStore((s) => s.mutate)
  const data = useZentData()
  const brl = useBRL()
  const editing = state !== 'closed' && state !== 'new' ? state : null
  const open = state !== 'closed'

  // Saldo EXIBIDO é o derivado (v7), nunca o openingBalance cru: é ele que o
  // usuário vê na tela e é contra ele que a conciliação calcula a diferença.
  const currentBalance = editing ? (bankBalances(data).get(editing.id) ?? 0) : 0

  const [name, setName] = useState('')
  const [color, setColor] = useState('#6fa894')
  const [balance, setBalance] = useState<number | null>(0)
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const target: string = editing?.id ?? (typeof state === 'string' ? state : 'closed')
  if (open && openedFor !== target) {
    setOpenedFor(target)
    setName(editing?.name ?? '')
    setColor(editing?.color ?? '#6fa894')
    setBalance(currentBalance)
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const valid = name.trim() !== ''
  const delta = editing ? (balance ?? 0) - currentBalance : 0

  function save(): void {
    if (!valid) return
    const clean = name.trim()
    mutate((d) => {
      if (editing) {
        const b = d.banks.find((x) => x.id === editing.id)
        if (b) {
          b.name = clean
          b.color = color
        }
      } else {
        // Banco novo: o saldo digitado é o PONTO DE PARTIDA. Não há histórico
        // para conciliar contra — o app está conhecendo esta conta agora.
        d.banks.push({ id: newId(), name: clean, color, openingBalance: balance ?? 0 })
      }
    })
    // Saldo editado num banco existente vira ajuste de conciliação (§1.5), não
    // uma sobrescrita: o histórico continua fechando com o saldo.
    if (editing) {
      const applied = reconcileBankBalance(editing.id, balance ?? 0)
      if (applied !== 0) {
        toast.success(
          'Saldo conciliado',
          `${clean}: ajuste de ${applied > 0 ? '+' : '−'}${brl(Math.abs(applied))} registrado no histórico da conta.`,
        )
        onClose()
        return
      }
    }
    toast.success(editing ? 'Banco atualizado' : `Banco "${clean}" adicionado`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar banco' : 'Novo banco'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={save}>
            {editing ? 'Salvar' : 'Adicionar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Nubank"
            autoFocus
            maxLength={32}
          />
        </Field>
        <Field label="Cor da marca">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field
          label="Saldo em conta"
          hint={
            editing
              ? 'Digite o saldo que o app do banco mostra. A diferença entra no histórico como ajuste de conciliação.'
              : 'Ponto de partida da conta. Daqui em diante o saldo acompanha os movimentos.'
          }
        >
          <MoneyInput value={balance} onChange={setBalance} allowNegative aria-label="Saldo em conta" />
        </Field>
        {editing && delta !== 0 && (
          <p className="text-[12.5px] text-ink-soft bg-surface-2 border border-line rounded-[10px] px-3 py-2.5">
            Vai registrar{' '}
            <strong className="text-ink tnum">
              Ajuste de conciliação: {delta > 0 ? '+' : '−'}
              {brl(Math.abs(delta))}
            </strong>{' '}
            — o saldo de hoje é {brl(currentBalance)}.
          </p>
        )}
      </div>
    </Modal>
  )
}

// ── Cartão ───────────────────────────────────────────────────────────────────

export type CardDialogState = 'closed' | { mode: 'new'; bankId: string } | { mode: 'edit'; card: Card }

export function CardDialog({
  state,
  onClose,
}: {
  state: CardDialogState
  onClose(): void
}): ReactNode {
  const mutate = useDataStore((s) => s.mutate)
  const open = state !== 'closed'
  const editing = open && state.mode === 'edit' ? state.card : null

  const [name, setName] = useState('')
  const [limit, setLimit] = useState<number | null>(null)
  const [invoice, setInvoice] = useState<number | null>(0)
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const target = !open ? 'closed' : editing ? `edit-${editing.id}` : `new-${state.mode === 'new' ? state.bankId : ''}`
  if (open && openedFor !== target) {
    setOpenedFor(target)
    setName(editing?.name ?? '')
    setLimit(editing?.limit ?? null)
    setInvoice(editing?.invoice ?? 0)
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const valid = name.trim() !== '' && limit !== null && limit > 0

  function save(): void {
    if (!open || !valid || limit === null) return
    const clean = name.trim()
    mutate((d) => {
      if (editing) {
        const c = d.cards.find((x) => x.id === editing.id)
        if (c) {
          c.name = clean
          c.limit = limit
          c.invoice = invoice ?? 0
        }
      } else if (state.mode === 'new') {
        d.cards.push({ id: newId(), bankId: state.bankId, name: clean, limit, invoice: invoice ?? 0 })
      }
    })
    toast.success(editing ? 'Cartão atualizado' : `Cartão "${clean}" adicionado`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar cartão' : 'Novo cartão'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={save}>
            {editing ? 'Salvar' : 'Adicionar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome do cartão">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Ultravioleta"
            autoFocus
            maxLength={32}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Limite total">
            <MoneyInput value={limit} onChange={setLimit} aria-label="Limite total do cartão" />
          </Field>
          <Field label="Fatura atual">
            <MoneyInput value={invoice} onChange={setInvoice} aria-label="Fatura atual" />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

// ── Compra parcelada ─────────────────────────────────────────────────────────

export type PurchaseDialogState =
  | 'closed'
  /** `cardId: null` abre já no tipo avulsa (R3 §2). */
  | { mode: 'new'; cardId: string | null }
  | { mode: 'edit'; purchase: Purchase }

export function PurchaseDialog({
  state,
  onClose,
}: {
  state: PurchaseDialogState
  onClose(): void
}): ReactNode {
  const mutate = useDataStore((s) => s.mutate)
  const data = useZentData()
  const allCards = data.cards
  const brl = useBRL()
  const open = state !== 'closed'
  const editing = open && state.mode === 'edit' ? state.purchase : null

  const [name, setName] = useState('')
  const [cardId, setCardId] = useState('')
  /** true = parcela avulsa (empréstimo, crediário…): não consome limite de cartão. */
  const [standalone, setStandalone] = useState(false)
  const [creditor, setCreditor] = useState('')
  const [installment, setInstallment] = useState<number | null>(null)
  const [total, setTotal] = useState('12')
  const [paid, setPaid] = useState('0')
  const [startYm, setStartYm] = useState(currentYm())
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const target = !open ? 'closed' : editing ? `edit-${editing.id}` : `new-${state.mode === 'new' ? (state.cardId ?? 'avulsa') : ''}`
  if (open && openedFor !== target) {
    setOpenedFor(target)
    setName(editing?.name ?? '')
    const initialCard = editing ? editing.cardId : state.mode === 'new' ? state.cardId : null
    setStandalone(initialCard === null)
    setCardId(initialCard ?? allCards[0]?.id ?? '')
    setCreditor(editing?.creditor ?? '')
    setInstallment(editing?.installmentAmount ?? null)
    setTotal(String(editing?.totalInstallments ?? 12))
    setPaid(String(editing?.paidInstallments ?? 0))
    setStartYm(editing?.startYm ?? currentYm())
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const totalN = Number(total)
  const paidN = Number(paid)
  const valid =
    name.trim() !== '' &&
    (standalone || cardId !== '') && // avulsa não exige cartão
    installment !== null &&
    installment > 0 &&
    Number.isInteger(totalN) &&
    totalN >= 1 &&
    totalN <= 120 &&
    Number.isInteger(paidN) &&
    paidN >= 0 &&
    paidN <= totalN &&
    /^\d{4}-\d{2}$/.test(startYm)

  function save(): void {
    if (!open || !valid || installment === null) return
    const clean = name.trim()
    const nextCardId = standalone ? null : cardId
    const nextCreditor = standalone ? creditor.trim() || null : null
    mutate((d) => {
      if (editing) {
        const p = d.purchases.find((x) => x.id === editing.id)
        if (p) {
          p.name = clean
          p.cardId = nextCardId
          p.creditor = nextCreditor
          p.installmentAmount = installment
          p.totalInstallments = totalN
          p.paidInstallments = paidN
          p.startYm = startYm
        }
      } else if (state.mode === 'new') {
        addPurchase(d, {
          id: newId(),
          cardId: nextCardId,
          creditor: nextCreditor,
          name: clean,
          installmentAmount: installment,
          totalInstallments: totalN,
          paidInstallments: paidN,
          startYm,
        })
      }
    })
    toast.success(
      editing ? 'Parcela atualizada' : standalone ? 'Parcela avulsa adicionada' : 'Compra parcelada adicionada',
      standalone
        ? `${clean} · ${totalN}x — entra no comprometido do mês; nenhum limite de cartão é afetado.`
        : `${clean} · ${totalN}x — o limite disponível do cartão já reflete as parcelas.`,
    )
    onClose()
  }

  // opções de mês: 24 para trás até 1 à frente
  const monthOptions: string[] = []
  for (let i = -24; i <= 1; i++) monthOptions.push(addMonths(currentYm(), i))
  if (!monthOptions.includes(startYm)) monthOptions.unshift(startYm)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar parcela' : standalone ? 'Nova parcela avulsa' : 'Nova compra parcelada'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={save}>
            {editing ? 'Salvar' : 'Adicionar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Tipo do parcelamento (R3 §2) — avulsa não consome limite de cartão.
            Sem <Field>: um <label> em volta de um tablist rouba o nome das abas. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-soft">Tipo</span>
          <Segmented<'card' | 'standalone'>
            ariaLabel="Tipo da parcela"
            value={standalone ? 'standalone' : 'card'}
            onChange={(v) => setStandalone(v === 'standalone')}
            options={[
              { value: 'card', label: 'Vinculada a cartão' },
              { value: 'standalone', label: 'Avulsa' },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={standalone ? 'Nome da parcela' : 'Nome da compra'}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={standalone ? 'Ex.: Empréstimo pessoal' : 'Ex.: Notebook'}
              autoFocus
              maxLength={48}
            />
          </Field>
          {standalone ? (
            <Field label="Credor" hint="Opcional">
              <Input
                value={creditor}
                onChange={(e) => setCreditor(e.target.value)}
                placeholder="Ex.: Banco X"
                maxLength={48}
                aria-label="Credor da parcela avulsa"
              />
            </Field>
          ) : (
            <Field label="Cartão">
              <Select value={cardId} onChange={(e) => setCardId(e.target.value)} aria-label="Cartão da compra">
                {allCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor da parcela">
            <MoneyInput value={installment} onChange={setInstallment} aria-label="Valor da parcela" />
          </Field>
          <Field label="Total de parcelas">
            <Input
              type="number"
              min={1}
              max={120}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className="tnum"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Parcelas já pagas">
            <Input
              type="number"
              min={0}
              max={totalN || 0}
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              className="tnum"
            />
          </Field>
          <Field label="Mês da 1ª parcela">
            <Select value={startYm} onChange={(e) => setStartYm(e.target.value)}>
              {monthOptions.map((ym) => (
                <option key={ym} value={ym}>
                  {formatYmLong(ym)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {/* Parcela avulsa: resumo simples (não consome limite de cartão). */}
        {standalone && installment !== null && installment > 0 && valid && (
          <p className="text-[12.5px] text-ink-soft bg-surface-2 border border-line rounded-[10px] px-3 py-2.5 tnum">
            Compromisso total:{' '}
            <strong className="text-ink">{brl(installment * totalN)}</strong> · restam{' '}
            {totalN - paidN} parcelas · não consome limite de cartão
          </p>
        )}

        {/* Prévia de impacto (§7): o freio consciente antes de confirmar. */}
        {!standalone && !editing && installment !== null && installment > 0 && valid && (
          <ImpactPreview cardId={cardId} installment={installment} totalN={totalN} data={data} brl={brl} />
        )}
      </div>
    </Modal>
  )
}

/** Painel de impacto do parcelamento (§7): limite após, saúde antes→depois e salário disponível. */
function ImpactPreview({
  cardId,
  installment,
  totalN,
  data,
  brl,
}: {
  cardId: string
  installment: number
  totalN: number
  data: ReturnType<typeof useZentData>
  brl: (c: number) => string
}): ReactNode {
  const imp = installmentImpact(data, cardId, installment, totalN, todayIso())
  if (!imp) return null
  return (
    <div className="rounded-[12px] border border-line bg-surface-2 p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-pos mb-2.5">o que acontece se confirmar</p>
      <Row label="Valor por mês" value={`${totalN}× ${brl(imp.perMonth)}`} highlight />
      <Row label="1ª parcela em" value={formatYmShort(imp.firstYm)} />
      <Row label="Última parcela em" value={formatYmShort(imp.lastYm)} />
      <Row label="Limite do cartão após a compra" value={`${brl(imp.limitAfter)} livre`} tone="text-pos" />
      {imp.healthBefore !== null && imp.healthAfter !== null && (
        <Row
          label="Saúde financeira"
          value={`${imp.healthBefore} → ${imp.healthAfter}`}
          tone={imp.healthAfter < imp.healthBefore ? 'text-warn' : 'text-pos'}
        />
      )}
      <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-line">
        <span className="text-[12px] text-ink-soft">Salário disponível após</span>
        <span className="tnum text-[13px] font-bold text-ink">
          {brl(imp.salaryAvailableBefore)} → <span className={imp.salaryAvailableAfter < 0 ? 'text-neg' : 'text-primary'}>{brl(imp.salaryAvailableAfter)}</span>
        </span>
      </div>
    </div>
  )
}

function Row({ label, value, tone, highlight }: { label: string; value: string; tone?: string; highlight?: boolean }): ReactNode {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[12px] text-ink-soft">{label}</span>
      <span className={cn('tnum text-[12.5px] font-semibold', highlight ? 'text-primary' : (tone ?? 'text-ink'))}>{value}</span>
    </div>
  )
}
