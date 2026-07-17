import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { loadZentData } from '@/data/persistence'
import { useDataStore } from '@/store/dataStore'
import { Toaster, toast } from '@/design/components/toast'
import { ConfirmHost } from '@/design/components/confirm'
import { AppShell } from './AppShell'
import { ZentLogo } from '@/design/ZentLogo'
import { currentYm, diffDays, todayIso } from '@/engine/dates'
import { materializeRecurrences } from '@/engine/recurring'
import { runSalaryMaterialization } from '@/store/ledgerActions'
import { refreshRates } from '@/store/ratesActions'
import { newId } from '@/lib/id'

type BootState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string }

export function App(): ReactNode {
  const [boot, setBoot] = useState<BootState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    let ratesTimer: ReturnType<typeof setInterval> | undefined
    async function start(): Promise<void> {
      try {
        const [data, logos] = await Promise.all([loadZentData(), window.zent.listLogos()])
        if (cancelled) return
        useDataStore.getState().initialize(data, logos)

        // Materializa lançamentos recorrentes dos meses decorridos
        const { expenses, incomes, lastYm } = materializeRecurrences(
          data.recurringExpenses,
          data.recurringIncomes,
          data.meta.lastRecurringYm,
          currentYm(),
        )
        if (expenses.length > 0 || incomes.length > 0 || data.meta.lastRecurringYm !== lastYm) {
          useDataStore.getState().mutate((d) => {
            for (const e of expenses) d.expenses.push({ id: newId(), ...e })
            for (const i of incomes) d.extraIncomes.push({ id: newId(), ...i })
            d.meta.lastRecurringYm = lastYm
          })
          const total = expenses.length + incomes.length
          if (total > 0) {
            toast.info(
              'Recorrências lançadas',
              `${total} ${total === 1 ? 'lançamento recorrente foi criado' : 'lançamentos recorrentes foram criados'} para os meses decorridos.`,
            )
          }
        }

        // Crédito automático do salário nos meses vencidos (R4 §1.1). Roda
        // depois das recorrências: ambos materializam o tempo que passou desde
        // o último boot, e o salário lê o histórico já atualizado.
        const credited = runSalaryMaterialization()
        if (credited > 0) {
          const bankName =
            useDataStore.getState().data?.banks.find((b) => b.id === data.salaryConfig.bankId)?.name ??
            'sua conta'
          toast.info(
            credited === 1 ? 'Salário creditado' : `${credited} salários creditados`,
            `Entrou no saldo de ${bankName}. Dá para desfazer no histórico da conta.`,
          )
        }

        setBoot({ status: 'ready' })

        // Taxas oficiais (R4 §2): no boot e a cada 24h, em silêncio. Não é
        // aguardado de propósito — a tela não espera a rede para abrir, e sem
        // internet o app é exatamente o mesmo app.
        void refreshRates()
        ratesTimer = setInterval(() => void refreshRates(), 24 * 60 * 60 * 1000)

        // Lembrete de backup manual (45 dias)
        const last = data.meta.lastManualExport ?? data.meta.createdAt
        if (diffDays(last, todayIso()) > 45) {
          toast.warning(
            'Hora de exportar um backup',
            'Já se passaram mais de 45 dias desde a última exportação. Use o menu de perfil → Exportar backup.',
          )
        }
      } catch (err) {
        if (cancelled) return
        setBoot({
          status: 'error',
          message: err instanceof Error ? err.message : 'Erro desconhecido ao carregar os dados',
        })
      }
    }
    void start()

    const unsubscribe = window.zent.onLogosChanged((logos) => {
      useDataStore.getState().setLogos(logos)
    })
    return () => {
      cancelled = true
      unsubscribe()
      if (ratesTimer !== undefined) clearInterval(ratesTimer)
    }
  }, [])

  if (boot.status === 'loading') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-bg">
        <div className="anim-pop-in">
          <ZentLogo size={56} />
        </div>
        <div className="w-40 h-2 skeleton" aria-label="Carregando" />
      </div>
    )
  }

  if (boot.status === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-bg px-8 text-center">
        <div className="h-12 w-12 rounded-[14px] bg-neg-soft flex items-center justify-center">
          <AlertTriangle size={22} className="text-neg" />
        </div>
        <p className="font-display text-lg font-semibold text-ink">Não foi possível abrir seus dados</p>
        <p className="text-sm text-ink-soft max-w-[420px] leading-relaxed">
          {boot.message}. Seus backups automáticos estão na pasta <code>backups</code> dentro do
          diretório de dados do app — restaure o mais recente copiando-o por cima de{' '}
          <code>zent-data.json</code>.
        </p>
      </div>
    )
  }

  return (
    <>
      <AppShell />
      <Toaster />
      <ConfirmHost />
    </>
  )
}
