import { useMemo, useState, type ReactNode } from 'react'
import { Modal } from '@/design/components/Modal'
import { Button } from '@/design/components/Button'
import { Field, Input } from '@/design/components/Input'
import { DateField } from '@/design/components/DateField'
import { MoneyField } from '@/design/components/MoneyField'
import { LimitIndicator } from '@/design/components/LimitIndicator'
import { Select } from '@/design/components/Select'
import { BankPicker, type BankPickerOption } from '@/design/components/BankPicker'
import { toast } from '@/design/components/toast'
import { useDataStore, useZentData } from '@/store/dataStore'
import { useBRL } from '@/design/money'
import { bankBalances } from '@/engine/ledger'
import { todayIso, ymOfDate } from '@/engine/dates'
import { effectiveLimit } from '@/engine/budget'
import { newId } from '@/lib/id'
import { addExpense } from '@/store/mutations'
import { cn } from '@/lib/cn'
import type { Expense, ExpenseOrigin } from '@/data/schema'

export type ExpenseDialogState = 'closed' | 'new' | Expense

/** Origem → valor do <select> ('' = sem origem). */
function originToValue(o: ExpenseOrigin | null): string {
  if (o === null) return ''
  return o.kind === 'bank' ? `bank:${o.bankId}` : `card:${o.cardId}`
}

/** Valor do <select> → origem persistida. */
function valueToOrigin(v: string): ExpenseOrigin | null {
  if (v.startsWith('bank:')) return { kind: 'bank', bankId: v.slice(5) }
  if (v.startsWith('card:')) return { kind: 'card', cardId: v.slice(5) }
  return null
}

export function ExpenseDialog({
  state,
  onClose,
  onReallocate,
}: {
  state: ExpenseDialogState
  onClose(): void
  /** Pedido de realocação de orçamento para a categoria do gasto (aviso de estouro). */
  onReallocate?(categoryId: string): void
}): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const brl = useBRL()
  const editing = state !== 'closed' && state !== 'new' ? state : null
  const open = state !== 'closed'

  /**
   * Valor do gasto mais recente — alimenta o atalho "último valor" (§7).
   * O gasto mais recente é o de maior DATA, e não o último do array: a lista é
   * ordem de criação, e quem lança hoje uma conta de ontem inverteria os dois.
   */
  const lastExpenseAmount = useMemo(() => {
    let best: { date: string; amount: number } | null = null
    for (const e of data.expenses) {
      if (best === null || e.date > best.date) best = { date: e.date, amount: e.amount }
    }
    return best?.amount ?? null
  }, [data.expenses])

  /** Dias que já têm gasto — viram os pontos do calendário (§8). */
  const datesWithExpense = useMemo(() => {
    const set = new Set<string>()
    for (const e of data.expenses) set.add(e.date)
    return set
  }, [data.expenses])

  const [date, setDate] = useState(todayIso())
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [essential, setEssential] = useState(true)
  const [repeatMonthly, setRepeatMonthly] = useState(false)
  /** "Pago com" (R3 §3.4): '' = sem origem · 'bank:<id>' · 'card:<id>'. */
  const [origin, setOrigin] = useState('')
  /** Opt-in explícito de somar este gasto à fatura do cartão (ver DECISOES). */
  const [addToInvoice, setAddToInvoice] = useState(false)
  const [openedFor, setOpenedFor] = useState<string>('closed')

  const target: string = editing?.id ?? (typeof state === 'string' ? state : 'closed')
  if (open && openedFor !== target) {
    setOpenedFor(target)
    setDate(editing?.date ?? todayIso())
    setCategoryId(editing?.categoryId ?? data.categories[0]?.id ?? '')
    setDescription(editing?.description ?? '')
    setAmount(editing?.amount ?? null)
    setEssential(editing?.essential ?? true)
    setRepeatMonthly(false)
    setOrigin(originToValue(editing?.origin ?? null))
    setAddToInvoice(false)
  }
  if (!open && openedFor !== 'closed') setOpenedFor('closed')

  const originCardId = origin.startsWith('card:') ? origin.slice(5) : null

  // Origem "pago com" no BankPicker (§5): "Sem origem" neutro + contas (com saldo)
  // + cartões (logo do banco, contexto da fatura). Aqui NÃO se desabilita conta
  // zerada — um gasto pode deixar a conta negativa (o app permite e o histórico
  // denuncia); a trava de saldo é só onde se CEDE dinheiro (Guardar/aporte).
  const balances = bankBalances(data)
  const originOptions: BankPickerOption[] = [
    { id: '', name: 'Sem origem', logoName: '', logoColor: '#000', neutral: true, subtitle: 'não debita conta nem cartão' },
    ...data.banks.map((b) => ({
      id: `bank:${b.id}`,
      name: b.name,
      logoName: b.name,
      logoColor: b.color,
      subtitle: `saldo ${brl(balances.get(b.id) ?? 0)}`,
    })),
    ...data.cards.map((c) => {
      const bank = data.banks.find((b) => b.id === c.bankId)
      return {
        id: `card:${c.id}`,
        name: `${c.name}${bank ? ` · ${bank.name}` : ''}`,
        logoName: bank?.name ?? c.name,
        logoColor: bank?.color ?? '#888',
        subtitle: `fatura ${brl(c.invoice)}`,
      }
    }),
  ]

  const valid = categoryId !== '' && amount !== null && amount > 0 && date !== ''

  // ── Orçamento (M1 §c): limite EFETIVO do mês do gasto (base ± realocações) ──
  const expenseYm = date !== '' ? ymOfDate(date) : ''
  const budgetCategory = data.categories.find((c) => c.id === categoryId)
  const effLimit =
    budgetCategory && expenseYm !== ''
      ? effectiveLimit(budgetCategory, data.budgetReallocations, expenseYm)
      : null
  /** Já gasto na categoria neste mês, sem contar o gasto em edição. */
  const spentBefore =
    effLimit === null
      ? 0
      : data.expenses.reduce(
          (a, e) =>
            e.categoryId === categoryId && ymOfDate(e.date) === expenseYm && e.id !== (editing?.id ?? '')
              ? a + e.amount
              : a,
          0,
        )
  const spentAfter = spentBefore + (amount ?? 0)
  /** Estoura o orçamento se, com este gasto, o mês passa do limite efetivo. */
  const overflow = effLimit !== null && amount !== null && amount > 0 && spentAfter > effLimit

  /** Aviso âmbar ao cruzar 80% sem estourar (o estouro é barrado no rodapé). */
  function checkNearLimit(): void {
    if (effLimit === null || amount === null) return
    if (spentAfter <= effLimit && spentAfter >= effLimit * 0.8 && spentBefore < effLimit * 0.8) {
      toast.warning(
        `${budgetCategory?.name ?? 'Categoria'} perto do limite`,
        `${brl(spentAfter)} de ${brl(effLimit)} (${Math.round((spentAfter / effLimit) * 100)}% do orçamento do mês).`,
      )
    }
  }

  function save(): void {
    if (!valid || amount === null) return
    const cleanDesc = description.trim()
    const nextOrigin = valueToOrigin(origin)
    // Micro-recompensa do loop diário (v2.1 §2): o hábito rende +15 XP na PRIMEIRA
    // vez que se registra num dia (nunca por lançamento — ver engine/xp.ts). Só
    // aqui a UI sabe se este gasto abre o dia; a mensagem reforça a sequência.
    const isNewToday = !editing && date === todayIso()
    const firstOfDay = isNewToday && !data.expenses.some((e) => e.date === date)
    // Opt-in: soma pontual à fatura do cartão. NÃO é um vínculo vivo — a fatura
    // segue sendo o snapshot que o usuário mantém (ver DECISOES.md, R3 §3.4).
    const invoiceCardId = addToInvoice && originCardId !== null ? originCardId : null
    mutate((d) => {
      if (editing) {
        const e = d.expenses.find((x) => x.id === editing.id)
        if (e) {
          e.date = date
          e.categoryId = categoryId
          e.description = cleanDesc
          e.amount = amount
          e.essential = essential
          e.origin = nextOrigin
        }
      } else {
        const recurringId = repeatMonthly ? newId() : null
        if (recurringId) {
          d.recurringExpenses.push({
            id: recurringId,
            categoryId,
            description: cleanDesc,
            amount,
            essential,
            dayOfMonth: Number(date.slice(8, 10)),
            startYm: ymOfDate(date),
            endYm: null,
          })
        }
        addExpense(d, {
          id: newId(),
          date,
          categoryId,
          description: cleanDesc,
          amount,
          essential,
          origin: nextOrigin,
          ...(recurringId ? { recurringId } : {}),
        })
      }
      if (invoiceCardId !== null) {
        const card = d.cards.find((c) => c.id === invoiceCardId)
        if (card) card.invoice += amount
      }
    })
    checkNearLimit()
    toast.success(
      editing ? 'Gasto atualizado' : repeatMonthly ? 'Gasto recorrente criado' : 'Gasto registrado',
      invoiceCardId !== null
        ? `${brl(amount)} — somados à fatura do cartão.`
        : repeatMonthly && !editing
          ? `${brl(amount)} — será lançado todo mês automaticamente.`
          : firstOfDay
            ? `${brl(amount)} · +15 XP, sequência acesa`
            : brl(amount),
    )
    onClose()
  }

  /** "Realocar orçamento" (aviso de estouro): sai do gasto e abre a realocação. */
  function goReallocate(): void {
    onReallocate?.(categoryId)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar gasto' : 'Novo gasto'}
      footer={
        overflow ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            {onReallocate && (
              <Button variant="outline" onClick={goReallocate}>
                Realocar orçamento
              </Button>
            )}
            <Button variant="danger" disabled={!valid} onClick={save}>
              Lançar mesmo assim
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={!valid} onClick={save}>
              {editing ? 'Salvar' : 'Adicionar'}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {/**
         * O indicador de limite (§9) aparece assim que a categoria escolhida
         * tem teto — antes de estourar, não depois. A prévia listrada mostra o
         * que ESTE gasto ainda vai consumir, que é a informação capaz de mudar
         * a decisão enquanto ela ainda é uma decisão. O aviso vermelho abaixo
         * continua existindo para o caso em que já estourou.
         */}
        {effLimit !== null && budgetCategory && (
          <div className="rounded-[11px] border border-line bg-surface-2/60 px-3 py-2.5">
            <LimitIndicator
              label={budgetCategory.name}
              dotColor={budgetCategory.color}
              used={spentBefore}
              limit={effLimit}
              preview={amount}
            />
          </div>
        )}
        {overflow && effLimit !== null && (
          <p className="text-[12.5px] text-neg bg-neg-soft border border-neg/25 rounded-[10px] px-3 py-2.5 leading-relaxed">
            Este gasto ultrapassa o orçamento de{' '}
            <strong>{budgetCategory?.name}</strong>: o mês fica em{' '}
            <strong className="tnum">{brl(spentAfter)}</strong> contra o limite de{' '}
            <strong className="tnum">{brl(effLimit)}</strong>{' '}
            (<strong className="tnum">{brl(spentAfter - effLimit)}</strong> acima).{' '}
            {onReallocate ? 'Lance mesmo assim ou realoque orçamento de outra categoria.' : 'Lance mesmo assim se quiser.'}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <Field label="Data">
            {/* Os pontos do calendário (§8) saem dos dias que JÁ têm gasto:
                é a informação que evita lançar duas vezes no mesmo dia sem
                perceber, e ela já estava nos dados. */}
            <DateField
              value={date}
              onChange={setDate}
              markedDates={datesWithExpense}
              aria-label="Data do gasto"
              autoFocus
            />
          </Field>
          <Field label="Categoria">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Descrição (opcional)">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Compras da semana"
            maxLength={60}
          />
        </Field>
        <div className="flex flex-col gap-3">
          <Field label="Valor">
            <MoneyField value={amount} onChange={setAmount} aria-label="Valor do gasto" lastValue={lastExpenseAmount} />
          </Field>
          {/* R3 §3.4 — opcional: habilita as análises por banco */}
          <Field label="Pago com (opcional)">
            <BankPicker
              options={originOptions}
              value={origin}
              onChange={(id) => {
                setOrigin(id)
                if (!id.startsWith('card:')) setAddToInvoice(false)
              }}
              ariaLabel="Pago com"
            />
          </Field>
        </div>
        {originCardId !== null && !editing && (
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addToInvoice}
              onChange={(e) => setAddToInvoice(e.target.checked)}
              className="h-4 w-4 mt-0.5 accent-[color:var(--primary)] cursor-pointer shrink-0"
              aria-label="Somar à fatura do cartão"
            />
            <span className="text-[13px] text-ink">
              Somar à fatura do cartão{' '}
              <span className="text-ink-faint">
                — só marque se a fatura ainda não inclui este gasto, senão ele conta duas vezes.
              </span>
            </span>
          </label>
        )}
        <Field label="Classificação">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Necessário ou supérfluo">
            <button
              type="button"
              role="radio"
              aria-checked={essential}
              onClick={() => setEssential(true)}
              className={cn(
                'h-9.5 rounded-control border text-[13px] font-medium transition-all duration-150 cursor-pointer',
                essential
                  ? 'border-pos bg-pos-soft text-pos'
                  : 'border-line text-ink-soft hover:border-line-strong',
              )}
            >
              Necessário
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!essential}
              onClick={() => setEssential(false)}
              className={cn(
                'h-9.5 rounded-control border text-[13px] font-medium transition-all duration-150 cursor-pointer',
                !essential
                  ? 'border-warn bg-warn-soft text-warn'
                  : 'border-line text-ink-soft hover:border-line-strong',
              )}
            >
              Supérfluo
            </button>
          </div>
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
