import { useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { Modal } from '@/design/components/Modal'
import { Button } from '@/design/components/Button'
import { Field, Input, MoneyInput } from '@/design/components/Input'
import { MoneyField } from '@/design/components/MoneyField'
import { DateField } from '@/design/components/DateField'
import { Select } from '@/design/components/Select'
import { BankSelect } from '@/design/components/BankSelect'
import { BankPicker, type BankPickerOption } from '@/design/components/BankPicker'
import { toast } from '@/design/components/toast'
import { confirmDialog } from '@/design/components/confirm'
import { useDataStore, useZentData } from '@/store/dataStore'
import { addContribution } from '@/store/mutations'
import { bankBalances } from '@/engine/ledger'
import { formatDateBR, todayIso } from '@/engine/dates'
import { useBRL } from '@/design/money'
import { ASSET_CLASS_LABELS, type AssetClass } from '@/engine/rates'
import { newId } from '@/lib/id'
import type { Investment, RateType } from '@/data/schema'

/** Subtipos de rendimento da classe "Renda fixa pós". */
type PosSubtype = 'selic' | 'cdi'

function parseParam(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '' || !/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const CLASS_OPTIONS: { value: AssetClass; label: string; hint: string }[] = [
  { value: 'pos', label: ASSET_CLASS_LABELS.pos, hint: 'Rende Selic cheia ou um % do CDI.' },
  { value: 'ipca', label: ASSET_CLASS_LABELS.ipca, hint: 'Rende IPCA + um juro fixo ao ano.' },
  { value: 'pre', label: ASSET_CLASS_LABELS.pre, hint: 'Taxa fixa contratada, % ao ano.' },
  {
    value: 'outros',
    label: ASSET_CLASS_LABELS.outros,
    hint: 'Fundos, ações/FIIs, cripto — você atualiza o valor de mercado manualmente.',
  },
]

export type InvestmentDialogState = 'closed' | 'new' | Investment

export function InvestmentDialog({
  state,
  onClose,
}: {
  state: InvestmentDialogState
  onClose(): void
}): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const editing = state !== 'closed' && state !== 'new' ? state : null
  const open = state !== 'closed'

  const [name, setName] = useState('')
  const [bankId, setBankId] = useState('')
  const [assetClassDraft, setAssetClassDraft] = useState<AssetClass>('pos')
  const [posSubtype, setPosSubtype] = useState<PosSubtype>('cdi')
  const [param, setParam] = useState('100')
  const [initialValue, setInitialValue] = useState<number | null>(null)
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const target: string = editing?.id ?? (typeof state === 'string' ? state : 'closed')
  if (open && openedFor !== target) {
    setOpenedFor(target)
    setName(editing?.name ?? '')
    setBankId(editing?.bankId ?? data.banks[0]?.id ?? '')
    if (editing) {
      const cls: AssetClass =
        editing.rateType === 'selic' || editing.rateType === 'cdi'
          ? 'pos'
          : editing.rateType === 'ipca'
            ? 'ipca'
            : editing.rateType === 'prefixado'
              ? 'pre'
              : 'outros'
      setAssetClassDraft(cls)
      setPosSubtype(editing.rateType === 'selic' ? 'selic' : 'cdi')
      setParam(String(editing.rateParam).replace('.', ','))
    } else {
      setAssetClassDraft('pos')
      setPosSubtype('cdi')
      setParam('100')
    }
    setInitialValue(null)
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const rateType: RateType =
    assetClassDraft === 'pos'
      ? posSubtype
      : assetClassDraft === 'ipca'
        ? 'ipca'
        : assetClassDraft === 'pre'
          ? 'prefixado'
          : 'manual'

  const paramLabel =
    rateType === 'cdi' ? '% do CDI' : rateType === 'ipca' ? 'Juro fixo (% a.a.)' : rateType === 'prefixado' ? 'Taxa (% a.a.)' : null
  const needsParam = paramLabel !== null
  const paramValue = needsParam ? parseParam(param) : 0
  const classInfo = CLASS_OPTIONS.find((c) => c.value === assetClassDraft)

  const valid =
    name.trim() !== '' &&
    bankId !== '' &&
    (!needsParam || paramValue !== null) &&
    (rateType !== 'manual' || editing !== null || (initialValue !== null && initialValue >= 0))

  function save(): void {
    if (!valid) return
    const clean = name.trim()
    const p = paramValue ?? 0
    mutate((d) => {
      if (editing) {
        const inv = d.investments.find((x) => x.id === editing.id)
        if (inv) {
          inv.name = clean
          inv.bankId = bankId
          inv.rateType = rateType
          inv.rateParam = p
        }
      } else {
        d.investments.push({
          id: newId(),
          name: clean,
          bankId,
          rateType,
          rateParam: p,
          valueUpdates:
            rateType === 'manual' && initialValue !== null
              ? [{ id: newId(), date: todayIso(), value: initialValue }]
              : [],
        })
      }
    })
    toast.success(
      editing ? 'Ativo atualizado' : `Ativo "${clean}" criado`,
      rateType === 'manual'
        ? 'Atualize o valor de mercado sempre que quiser — a série é registrada a cada atualização.'
        : 'Agora registre os aportes.',
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar ativo' : 'Novo ativo'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={save}>
            {editing ? 'Salvar' : 'Criar ativo'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <Field label="Nome">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: CDB Liquidez Diária"
              autoFocus
              maxLength={48}
            />
          </Field>
          <Field label="Banco / corretora">
            <BankSelect
              banks={data.banks}
              value={bankId}
              onChange={setBankId}
              aria-label="Banco do ativo"
            />
          </Field>
        </div>
        <Field label="Classe do ativo">
          <Select
            value={assetClassDraft}
            onChange={(e) => setAssetClassDraft(e.target.value as AssetClass)}
            aria-label="Classe do ativo"
          >
            {CLASS_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        {classInfo && <p className="text-[12px] text-ink-faint -mt-2">{classInfo.hint}</p>}

        {assetClassDraft === 'pos' && (
          <div className="flex flex-col gap-3">
            <Field label="Rendimento">
              <Select
                value={posSubtype}
                onChange={(e) => setPosSubtype(e.target.value as PosSubtype)}
                aria-label="Tipo de rendimento pós-fixado"
              >
                <option value="selic">Selic cheia</option>
                <option value="cdi">% do CDI</option>
              </Select>
            </Field>
            {posSubtype === 'cdi' && (
              <Field label="% do CDI">
                <Input
                  value={param}
                  onChange={(e) => setParam(e.target.value)}
                  inputMode="decimal"
                  className="tnum"
                  aria-label="% do CDI"
                />
              </Field>
            )}
          </div>
        )}
        {(assetClassDraft === 'ipca' || assetClassDraft === 'pre') && paramLabel && (
          <Field label={paramLabel}>
            <Input
              value={param}
              onChange={(e) => setParam(e.target.value)}
              inputMode="decimal"
              className="tnum"
              aria-label={paramLabel}
            />
          </Field>
        )}
        {assetClassDraft === 'outros' &&
          (editing ? (
            <p className="text-[12.5px] text-ink-soft bg-surface-2 border border-line rounded-[10px] px-3 py-2.5">
              O valor deste ativo é atualizado pelo botão “Atualizar valor” no card do ativo.
            </p>
          ) : (
            <Field label="Valor de mercado atual" hint="Vira a primeira atualização da série.">
              <MoneyInput
                value={initialValue}
                onChange={setInitialValue}
                aria-label="Valor de mercado atual"
              />
            </Field>
          ))}
      </div>
    </Modal>
  )
}

export type ContributionDialogState = 'closed' | { investment: Investment }

export function ContributionDialog({
  state,
  onClose,
}: {
  state: ContributionDialogState
  onClose(): void
}): ReactNode {
  const mutate = useDataStore((s) => s.mutate)
  const open = state !== 'closed'
  const investment = open ? state.investment : null
  const brl = useBRL()

  const data = useZentData()
  const [date, setDate] = useState(todayIso())
  const [amount, setAmount] = useState<number | null>(null)
  const [fromBankId, setFromBankId] = useState<string | null>(null)
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const target = investment?.id ?? 'closed'
  if (open && openedFor !== target) {
    setOpenedFor(target)
    setDate(todayIso())
    setAmount(null)
    setFromBankId(null)
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const balances = bankBalances(data)
  // BankPicker do aporte (§5): conta de origem, com uma opção neutra "não debitar
  // conta" para quem só quer registrar o aporte sem mexer no saldo (fromBankId
  // null — o comportamento antigo). Conta zerada fica desabilitada.
  const NONE = '__none__'
  const bankOptions: BankPickerOption[] = [
    { id: NONE, name: 'Não debitar conta', logoName: '', logoColor: '#000', neutral: true, subtitle: 'só registrar o aporte' },
    ...data.banks.map((b) => {
      const bal = balances.get(b.id) ?? 0
      const disabled = bal <= 0
      return {
        id: b.id,
        name: b.name,
        logoName: b.name,
        logoColor: b.color,
        subtitle: `saldo ${brl(bal)}`,
        danger: bal <= 0,
        disabled,
        ...(disabled ? { reason: 'sem saldo' } : {}),
      }
    }),
  ]
  const pickerValue = fromBankId ?? NONE
  const enoughBalance = fromBankId === null || amount === null || (balances.get(fromBankId) ?? 0) >= amount
  const valid = amount !== null && amount > 0 && date !== '' && enoughBalance

  function save(): void {
    if (!valid || amount === null || !investment) return
    mutate((d) => {
      addContribution(d, { id: newId(), investmentId: investment.id, date, amount, fromBankId })
    })
    toast.success('Aporte registrado', `${brl(amount)} em ${investment.name}`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Novo aporte — ${investment?.name ?? ''}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={save}>
            Registrar aporte
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Data">
          <DateField value={date} onChange={setDate} autoFocus />
        </Field>
        <Field label="Valor">
          <MoneyField value={amount} onChange={setAmount} aria-label="Valor do aporte" />
        </Field>
      </div>
      <p className="text-[12px] font-semibold text-ink-soft mt-4 mb-2">De qual conta sai</p>
      <BankPicker
        options={bankOptions}
        value={pickerValue}
        onChange={(id) => setFromBankId(id === NONE ? null : id)}
        ariaLabel="Conta de origem do aporte"
      />
    </Modal>
  )
}

export type ValueUpdateDialogState = 'closed' | { investment: Investment }

/** Atualização de valor de mercado de um ativo manual, com histórico. */
export function ValueUpdateDialog({
  state,
  onClose,
}: {
  state: ValueUpdateDialogState
  onClose(): void
}): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const open = state !== 'closed'
  const investmentId = open ? state.investment.id : null
  // lê a versão viva do store (histórico atualiza após salvar)
  const investment = data.investments.find((i) => i.id === investmentId) ?? null
  const brl = useBRL()

  const [date, setDate] = useState(todayIso())
  const [value, setValue] = useState<number | null>(null)
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const target = investmentId ?? 'closed'
  if (open && openedFor !== target) {
    setOpenedFor(target)
    setDate(todayIso())
    setValue(null)
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const valid = value !== null && value >= 0 && date !== ''
  const history = [...(investment?.valueUpdates ?? [])].sort((a, b) => b.date.localeCompare(a.date))

  function save(): void {
    if (!valid || value === null || !investment) return
    mutate((d) => {
      const inv = d.investments.find((x) => x.id === investment.id)
      if (inv) inv.valueUpdates.push({ id: newId(), date, value })
    })
    toast.success('Valor atualizado', `${investment.name}: ${brl(value)}`)
    setValue(null)
  }

  async function removeUpdate(id: string, updValue: number): Promise<void> {
    if (!investment) return
    const ok = await confirmDialog({
      title: 'Excluir atualização',
      message: `Excluir a atualização de ${brl(updValue)}? A série do ativo será recalculada.`,
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    mutate((d) => {
      const inv = d.investments.find((x) => x.id === investment.id)
      if (inv) inv.valueUpdates = inv.valueUpdates.filter((u) => u.id !== id)
    })
    toast.success('Atualização excluída')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Atualizar valor — ${investment?.name ?? ''}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button disabled={!valid} onClick={save}>
            Registrar valor
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <Field label="Data">
            <DateField value={date} onChange={setDate} />
          </Field>
          <Field label="Valor de mercado">
            <MoneyInput value={value} onChange={setValue} autoFocus aria-label="Novo valor de mercado" />
          </Field>
        </div>
        {history.length > 0 && (
          <div>
            <p className="text-[12px] font-medium text-ink-soft mb-1.5">Histórico de atualizações</p>
            <ul className="max-h-44 overflow-y-auto border border-line rounded-[10px] divide-y divide-[color:var(--border)]">
              {history.map((u) => (
                <li key={u.id} className="group flex items-center gap-3 px-3 h-9">
                  <span className="text-[12px] text-ink-faint tnum">{formatDateBR(u.date)}</span>
                  <span className="ml-auto text-[12.5px] font-semibold text-ink tnum">
                    {brl(u.value)}
                  </span>
                  <button
                    type="button"
                    aria-label="Excluir atualização"
                    onClick={() => void removeUpdate(u.id, u.value)}
                    className="h-6.5 w-6.5 rounded-[7px] inline-flex items-center justify-center text-ink-faint hover:text-neg hover:bg-neg-soft cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
