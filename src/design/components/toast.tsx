import { create } from 'zustand'
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

/**
 * Sistema de toasts do Zent Money — empilháveis, com ícone, título,
 * descrição e barra de tempo. Substitui alert() em todo o app.
 */

type ToastType = 'success' | 'error' | 'warning' | 'info'

/** Ação opcional dentro do banner — hoje só "Desfazer". */
export interface ToastAction {
  label: string
  onClick(): void
}

interface ToastItem {
  id: number
  type: ToastType
  title: string
  description?: string
  duration: number
  action?: ToastAction
}

interface ToastStore {
  toasts: ToastItem[]
  push(t: Omit<ToastItem, 'id'>): void
  dismiss(id: number): void
}

let nextId = 1

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++
    set((s) => {
      // COALESCE por tipo+título (v2.1) — generaliza a disciplina que o M4 já
      // aplicava só às conquistas ("um toast, mesmo com várias medalhas").
      // Registrar 3 gastos em sequência empilhava 3 banners "Gasto registrado"
      // (cada um vive `duration`ms); um aviso repetido não informa mais que o
      // primeiro, e a pilha de banners idênticos polui a tela. Um push com mesmo
      // tipo+título SUBSTITUI o anterior (id novo, timer zerado, descrição mais
      // recente) em vez de empilhar. Avisos de título distinto seguem coexistindo.
      //
      // Efeito colateral saudável: torna o E2E determinístico. Máquina rápida
      // roda os passos do teste dentro da janela de `duration`, então os banners
      // não expiravam entre um add e outro e `getByText('Gasto registrado')`
      // casava N elementos, quebrando o strict-mode do Playwright — de forma
      // dependente da velocidade da máquina (verde na de referência, vermelho
      // aqui). Coalescer mata a corrida na origem, sem enfraquecer a asserção.
      const kept = s.toasts.filter((x) => !(x.type === t.type && x.title === t.title))
      return { toasts: [...kept.slice(-4), { ...t, id }] }
    })
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
    }, t.duration)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

function push(
  type: ToastType,
  title: string,
  description?: string,
  duration = 4500,
  action?: ToastAction,
): void {
  // `exactOptionalPropertyTypes`: "não há descrição/ação" é a AUSÊNCIA da prop,
  // não `undefined` nela — por isso o objeto é montado por partes.
  useToastStore.getState().push({
    type,
    title,
    duration,
    ...(description === undefined ? {} : { description }),
    ...(action === undefined ? {} : { action }),
  })
}

export const toast = {
  success: (title: string, description?: string, action?: ToastAction) =>
    push('success', title, description, 4500, action),
  error: (title: string, description?: string) => push('error', title, description, 6500),
  warning: (title: string, description?: string) => push('warning', title, description, 6000),
  info: (title: string, description?: string) => push('info', title, description),
}

const ICONS: Record<ToastType, ReactNode> = {
  success: <CheckCircle2 size={17} className="text-pos" />,
  error: <XCircle size={17} className="text-neg" />,
  warning: <AlertTriangle size={17} className="text-warn" />,
  info: <Info size={17} className="text-primary" />,
}

const BAR: Record<ToastType, string> = {
  success: 'bg-pos',
  error: 'bg-neg',
  warning: 'bg-warn',
  info: 'bg-primary',
}

export function Toaster(): ReactNode {
  const { toasts, dismiss } = useToastStore()
  return createPortal(
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[70] flex flex-col gap-2.5 w-[340px] pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'pointer-events-auto relative overflow-hidden',
            'bg-surface-2 border border-line-strong rounded-[12px] shadow-pop anim-toast-in',
          )}
        >
          <div className="flex items-start gap-3 px-3.5 py-3">
            <span className="mt-0.5 shrink-0">{ICONS[t.type]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-ink leading-tight">{t.title}</p>
              {t.description ? (
                <p className="text-[12.5px] text-ink-soft mt-1 leading-snug">{t.description}</p>
              ) : null}
              {t.action ? (
                // Família de AÇÃO → retângulo arredondado, nunca pílula (DECISOES).
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick()
                    dismiss(t.id)
                  }}
                  className="mt-2 h-7 px-2.5 rounded-[9px] border border-line-strong bg-surface-3 text-[12.5px] font-medium text-primary hover:bg-surface-2 active:brightness-95 transition-colors cursor-pointer"
                >
                  {t.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => dismiss(t.id)}
              className="shrink-0 h-6 w-6 -mr-1 -mt-0.5 rounded-md inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-3 transition-colors cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>
          <div
            className={cn('absolute bottom-0 left-0 h-[2.5px] rounded-full', BAR[t.type])}
            style={{ animation: `zent-progress ${t.duration}ms linear both` }}
          />
        </div>
      ))}
    </div>,
    document.body,
  )
}
