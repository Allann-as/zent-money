import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Gift, Pencil, Plus, Repeat, Trash2, TrendingUp, Wallet } from 'lucide-react'
import { PageHeader } from '@/features/common/PageHeader'
import { MonthNav } from '@/features/common/MonthNav'
import { RecurringModal } from '@/features/common/RecurringModal'
import { Card, CardTitle } from '@/design/components/Card'
import { StatCard } from '@/design/components/StatCard'
import { AnimatedMoney } from '@/design/AnimatedMoney'
import { Button } from '@/design/components/Button'
import { Field, Input, MoneyInput } from '@/design/components/Input'
import { MoneyField } from '@/design/components/MoneyField'
import { DateField } from '@/design/components/DateField'
import { Select } from '@/design/components/Select'
import { BankPicker } from '@/design/components/BankPicker'
import { Modal } from '@/design/components/Modal'
import { EmptyState } from '@/design/components/EmptyState'
import { toast } from '@/design/components/toast'
import { confirmDialog } from '@/design/components/confirm'
import { useDataStore, useZentData } from '@/store/dataStore'
import { addExtraIncome, removeExtraIncome } from '@/store/mutations'
import { useUiStore } from '@/store/uiStore'
import { creditSalaryFor, runSalaryMaterialization } from '@/store/ledgerActions'
import { bankBalances, pendingSalaryCredits } from '@/engine/ledger'
import { groupByMonth, salaryForYm, sumByMonth } from '@/engine/aggregations'
import { useBRL } from '@/design/money'
import { currentYm, formatDateShort, formatYmLong, todayIso, ymCompare, ymOfDate } from '@/engine/dates'
import { newId } from '@/lib/id'
import type { ExtraIncome } from '@/data/schema'

export function IncomePage(): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const ym = useUiStore((s) => s.activeYm)
  const brl = useBRL()

  const [salaryModal, setSalaryModal] = useState(false)
  const [salaryDraft, setSalaryDraft] = useState<number | null>(null)
  // Recebimento do salário (R4 §1.1) — rascunhos do mesmo modal
  const [bankDraft, setBankDraft] = useState('')
  const [payDayDraft, setPayDayDraft] = useState('5')
  const [autoCreditDraft, setAutoCreditDraft] = useState(true)
  const [extraModal, setExtraModal] = useState<'closed' | 'new' | ExtraIncome>('closed')
  const [recurringOpen, setRecurringOpen] = useState(false)

  // Ação rápida vinda da paleta de comandos (Ctrl+K)
  const pendingAction = useUiStore((s) => s.pendingAction)
  const setPendingAction = useUiStore((s) => s.setPendingAction)
  useEffect(() => {
    if (pendingAction === 'new-income') {
      setPendingAction(null)
      setExtraModal('new')
    }
  }, [pendingAction, setPendingAction])

  const salary = salaryForYm(data.salaryHistory, ym)
  // agrupamento por mês memoizado — trocar de mês não varre o histórico (§10.4)
  const extrasByYm = useMemo(() => groupByMonth(data.extraIncomes), [data.extraIncomes])
  const monthExtras = useMemo(
    () => [...(extrasByYm.get(ym) ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [extrasByYm, ym],
  )
  const extrasTotal = useMemo(() => sumByMonth(monthExtras).get(ym) ?? 0, [monthExtras, ym])
  const total = salary + extrasTotal
  const viewingPast = ymCompare(ym, currentYm()) < 0

  // Salários vencidos aguardando confirmação (modo manual do §1.1)
  const pending = useMemo(() => pendingSalaryCredits(data, todayIso()), [data])
  const salaryBankName = data.banks.find((b) => b.id === data.salaryConfig.bankId)?.name ?? 'sua conta'

  function confirmPending(): void {
    let credited = 0
    for (const m of pending) if (creditSalaryFor(m)) credited++
    if (credited > 0) {
      toast.success(
        credited === 1 ? 'Salário creditado' : `${credited} salários creditados`,
        `O saldo de ${salaryBankName} já reflete a entrada.`,
      )
    }
  }

  function openSalaryModal(): void {
    setSalaryDraft(salaryForYm(data.salaryHistory, currentYm()) || null)
    setBankDraft(data.salaryConfig.bankId ?? '')
    setPayDayDraft(String(data.salaryConfig.payDay))
    setAutoCreditDraft(data.salaryConfig.autoCredit)
    setSalaryModal(true)
  }

  function saveSalary(): void {
    if (salaryDraft === null) return
    const start = currentYm()
    const payDay = Math.min(31, Math.max(1, Number(payDayDraft) || 1))
    const nextBankId = bankDraft === '' ? null : bankDraft
    const linking = nextBankId !== null && data.salaryConfig.bankId === null
    mutate((d) => {
      const existing = d.salaryHistory.find((s) => s.startYm === start)
      if (existing) existing.amount = salaryDraft
      else d.salaryHistory.push({ id: newId(), startYm: start, amount: salaryDraft })
      d.salaryConfig = { bankId: nextBankId, payDay, autoCredit: autoCreditDraft }
    })
    // Vincular a conta agora deve refletir no saldo agora, não só no próximo
    // boot — é justamente a queixa que abriu esta release ("entrou, mas Em
    // conta = 0"). A materialização é a mesma do boot, com as mesmas regras.
    if (nextBankId !== null) runSalaryMaterialization()
    setSalaryModal(false)
    const bankName = data.banks.find((b) => b.id === nextBankId)?.name
    toast.success(
      'Salário atualizado',
      linking && bankName !== undefined
        ? `Vale de ${formatYmLong(start)} em diante e passa a cair em ${bankName} todo dia ${payDay}.`
        : `Vale de ${formatYmLong(start)} em diante. Meses passados mantêm o valor da época.`,
    )
  }

  async function removeExtra(extra: ExtraIncome): Promise<void> {
    const ok = await confirmDialog({
      title: 'Excluir ganho extra',
      message: `Excluir "${extra.description}" (${brl(extra.amount)})? Essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    mutate((d) => removeExtraIncome(d, extra.id))
    toast.success('Ganho extra excluído')
  }

  return (
    <>
      <PageHeader title="Ganhos" subtitle="Salário e entradas extras" actions={<MonthNav />} />

      {/* Fila do modo "Confirmar recebimento" (R4 §1.1): só existe para quem
          desligou o crédito automático — o app não credita nada sem o clique. */}
      {pending.length > 0 && (
        <Card className="mb-4 px-5 py-4 flex items-center gap-4 border-primary/30">
          <span className="h-9 w-9 rounded-[10px] bg-primary-soft text-primary inline-flex items-center justify-center shrink-0">
            <Wallet size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-ink">
              {pending.length === 1
                ? `Salário de ${formatYmLong(pending[0] ?? '')} já venceu`
                : `${pending.length} salários já venceram e não foram creditados`}
            </p>
            <p className="text-[12.5px] text-ink-soft">
              Confirme para creditar em {salaryBankName} e atualizar o saldo da conta.
            </p>
          </div>
          <Button size="sm" onClick={confirmPending}>
            Confirmar recebimento
          </Button>
        </Card>
      )}

      {/* Cards de resumo (padrão StatCard) */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="relative">
          <StatCard
            icon={Wallet}
            value={<AnimatedMoney cents={salary} />}
            label={viewingPast ? 'Salário da época' : 'Salário vigente'}
            detail={
              data.salaryConfig.bankId !== null
                ? `cai em ${salaryBankName} todo dia ${data.salaryConfig.payDay}`
                : undefined
            }
            className="h-full"
          />
          <Button
            size="sm"
            variant="ghost"
            className="absolute top-3.5 right-3.5"
            onClick={openSalaryModal}
          >
            <Pencil size={13} /> Editar
          </Button>
        </div>
        <StatCard
          icon={Gift}
          value={<AnimatedMoney cents={extrasTotal} />}
          label="Extras do mês"
          detail={
            monthExtras.length === 0
              ? 'nenhum lançamento'
              : `${monthExtras.length} ${monthExtras.length === 1 ? 'lançamento' : 'lançamentos'}`
          }
        />
        <StatCard
          icon={TrendingUp}
          value={<AnimatedMoney cents={total} />}
          label="Total de entradas"
          tone="primary"
          detail={<span className="first-letter:uppercase inline-block">{formatYmLong(ym)}</span>}
        />
      </div>

      {/* Extras do mês */}
      <Card>
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <CardTitle>Ganhos extras de {formatYmLong(ym)}</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRecurringOpen(true)}>
              <Repeat size={13} /> Recorrentes
            </Button>
            <Button size="sm" onClick={() => setExtraModal('new')}>
              <Plus size={14} /> Novo extra
            </Button>
          </div>
        </div>
        {monthExtras.length === 0 ? (
          <EmptyState
            icon={Gift}
            title="Nenhum ganho extra neste mês"
            description={'Presente, freela, venda, reembolso… registre aqui tudo que entrou além do salário.'}
            action={
              <Button variant="soft" size="sm" onClick={() => setExtraModal('new')}>
                <Plus size={14} /> Registrar o primeiro
              </Button>
            }
          />
        ) : (
          <ul className="px-2 pb-2">
            {monthExtras.map((e) => (
              <li
                key={e.id}
                className="group flex items-center gap-3 px-3 h-12 rounded-[10px] hover:bg-surface-2 transition-colors"
              >
                <span className="text-[12px] text-ink-faint tnum w-14 shrink-0">
                  {formatDateShort(e.date)}
                </span>
                <span className="flex-1 text-[13.5px] text-ink truncate">{e.description}</span>
                <span className="text-[13.5px] font-semibold text-pos tnum">
                  +{brl(e.amount)}
                </span>
                <span className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    aria-label={`Editar ${e.description}`}
                    onClick={() => setExtraModal(e)}
                    className="h-7 w-7 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-3 cursor-pointer"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir ${e.description}`}
                    onClick={() => void removeExtra(e)}
                    className="h-7 w-7 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-neg hover:bg-neg-soft cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Modal salário: valor + recebimento (conta e dia) — R4 §1.1 */}
      <Modal
        open={salaryModal}
        onClose={() => setSalaryModal(false)}
        title="Editar salário mensal"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSalaryModal(false)}>
              Cancelar
            </Button>
            <Button disabled={salaryDraft === null} onClick={saveSalary}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field
            label="Novo salário mensal"
            hint={`Vale de ${formatYmLong(currentYm())} em diante — meses passados continuam exibindo o salário da época.`}
          >
            <MoneyInput value={salaryDraft} onChange={setSalaryDraft} autoFocus aria-label="Salário mensal" />
          </Field>

          <div className="border-t border-line pt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <Field label="Cai na conta" hint="Opcional">
                <Select
                  value={bankDraft}
                  onChange={(e) => setBankDraft(e.target.value)}
                  aria-label="Conta de recebimento do salário"
                >
                  <option value="">Não vincular</option>
                  {data.banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Dia do pagamento">
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={payDayDraft}
                  onChange={(e) => setPayDayDraft(e.target.value)}
                  className="tnum"
                  disabled={bankDraft === ''}
                  aria-label="Dia do pagamento"
                />
              </Field>
            </div>
            {bankDraft !== '' && (
              <>
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoCreditDraft}
                    onChange={(e) => setAutoCreditDraft(e.target.checked)}
                    className="h-4 w-4 mt-0.5 accent-[color:var(--primary)] cursor-pointer"
                    aria-label="Creditar automaticamente no dia"
                  />
                  <span className="text-[13px] text-ink">
                    Creditar automaticamente no dia{' '}
                    <span className="text-ink-faint">
                      — desmarque para o app pedir “Confirmar recebimento” em vez de creditar sozinho
                      (útil quando o salário costuma atrasar).
                    </span>
                  </span>
                </label>
                <p className="text-[12.5px] text-ink-soft bg-surface-2 border border-line rounded-[10px] px-3 py-2.5">
                  Todo dia {Number(payDayDraft) || 1}, o salário entra no saldo de{' '}
                  <strong className="text-ink">
                    {data.banks.find((b) => b.id === bankDraft)?.name ?? '—'}
                  </strong>{' '}
                  e aparece no histórico da conta. Dá para desfazer com um clique.
                </p>
              </>
            )}
          </div>
        </div>
      </Modal>

      <ExtraDialog state={extraModal} onClose={() => setExtraModal('closed')} />
      <RecurringModal kind="income" open={recurringOpen} onClose={() => setRecurringOpen(false)} />
    </>
  )
}

function ExtraDialog({
  state,
  onClose,
}: {
  state: 'closed' | 'new' | ExtraIncome
  onClose(): void
}): ReactNode {
  const mutate = useDataStore((s) => s.mutate)
  const data = useZentData()
  const brl = useBRL()
  const editing = state !== 'closed' && state !== 'new' ? state : null
  const open = state !== 'closed'

  const [date, setDate] = useState(todayIso())
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [receivedIn, setReceivedIn] = useState('')
  const [repeatMonthly, setRepeatMonthly] = useState(false)
  const [openedFor, setOpenedFor] = useState<'closed' | 'new' | string>('closed')

  // Reinicializa o formulário quando abre para um alvo diferente
  const target: string = editing?.id ?? (typeof state === 'string' ? state : 'closed')
  if (open && openedFor !== target) {
    setOpenedFor(target)
    setDate(editing?.date ?? todayIso())
    setDescription(editing?.description ?? '')
    setAmount(editing?.amount ?? null)
    setReceivedIn(editing?.receivedIn ?? '')
    setRepeatMonthly(false)
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const valid = description.trim() !== '' && amount !== null && amount > 0 && date !== ''

  function save(): void {
    if (!valid || amount === null) return
    const cleanDesc = description.trim()
    const account = receivedIn === '' ? null : receivedIn
    mutate((d) => {
      if (editing) {
        const e = d.extraIncomes.find((x) => x.id === editing.id)
        if (e) {
          e.date = date
          e.description = cleanDesc
          e.amount = amount
          e.receivedIn = account
        }
      } else {
        const recurringId = repeatMonthly ? newId() : null
        if (recurringId) {
          d.recurringIncomes.push({
            id: recurringId,
            description: cleanDesc,
            amount,
            dayOfMonth: Number(date.slice(8, 10)),
            startYm: ymOfDate(date),
            endYm: null,
          })
        }
        addExtraIncome(d, {
          id: newId(),
          date,
          description: cleanDesc,
          amount,
          receivedIn: account,
          ...(recurringId ? { recurringId } : {}),
        })
      }
    })
    toast.success(
      editing ? 'Ganho extra atualizado' : repeatMonthly ? 'Ganho recorrente criado' : 'Ganho extra registrado',
      repeatMonthly && !editing
        ? `${brl(amount)} — será lançado todo mês automaticamente.`
        : brl(amount),
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar ganho extra' : 'Novo ganho extra'}
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
        <Field label="Descrição">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={'Ex.: Presente da vó, Freela…'}
            autoFocus
            maxLength={60}
          />
        </Field>
        <div className="flex flex-col gap-3">
          <Field label="Data">
            <DateField value={date} onChange={setDate} />
          </Field>
          <Field label="Valor">
            <MoneyField value={amount} onChange={setAmount} aria-label="Valor do ganho extra" />
          </Field>
        </div>
        {/* "Recebido em" (R4 §1.2): opcional — sem conta, o extra segue contando
            no fluxo do mês e simplesmente não move saldo nenhum. */}
        <Field label="Recebido em" hint="Opcional — vincule para o saldo da conta subir junto">
          <BankPicker
            options={[
              { id: '', name: 'Não vincular a uma conta', logoName: '', logoColor: '#000', neutral: true, subtitle: 'só entra no fluxo do mês' },
              ...data.banks.map((b) => ({
                id: b.id,
                name: b.name,
                logoName: b.name,
                logoColor: b.color,
                subtitle: `saldo ${brl(bankBalances(data).get(b.id) ?? 0)}`,
              })),
            ]}
            value={receivedIn}
            onChange={setReceivedIn}
            ariaLabel="Conta em que o ganho foi recebido"
          />
        </Field>
        {!editing && (
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={repeatMonthly}
              onChange={(e) => setRepeatMonthly(e.target.checked)}
              className="h-4 w-4 accent-[color:var(--primary)] cursor-pointer"
              aria-label="Repetir todo mês"
            />
            <span className="text-[13px] text-ink">
              Repetir todo mês{' '}
              <span className="text-ink-faint">
                (lançado automaticamente no dia {date ? Number(date.slice(8, 10)) : '—'})
              </span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  )
}
