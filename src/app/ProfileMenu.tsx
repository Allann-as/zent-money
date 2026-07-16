import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Download, Moon, Pencil, Sun, Upload, AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useUiStore } from '@/store/uiStore'
import { useDataStore, useZentData } from '@/store/dataStore'
import { Button } from '@/design/components/Button'
import { Input } from '@/design/components/Input'
import { Switch } from '@/design/components/Switch'
import { toast } from '@/design/components/toast'
import { confirmDialog } from '@/design/components/confirm'
import { flushSave, parseImportedData } from '@/data/persistence'
import { diffDays, formatDateBR, todayIso } from '@/engine/dates'
import { ZentLogo } from '@/design/ZentLogo'

/** Parse de percentual pt-BR: "14,25" → 14.25. */
function parsePercent(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '' || !/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function fmtPercent(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

function PercentField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange(v: string): void
}): ReactNode {
  const invalid = value.trim() !== '' && parsePercent(value) === null
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11.5px] font-medium text-ink-soft">{label}</span>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn('h-8.5 pr-7 text-[13px] tnum', invalid && 'border-neg focus:border-neg')}
          inputMode="decimal"
          aria-label={label}
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint pointer-events-none">
          %
        </span>
      </div>
    </label>
  )
}

export function ProfileMenu({
  open,
  onClose,
  collapsed,
}: {
  open: boolean
  onClose(): void
  collapsed: boolean
}): ReactNode {
  const data = useZentData()
  const mutate = useDataStore((s) => s.mutate)
  const replaceAll = useDataStore((s) => s.replaceAll)
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(data.profile.name)
  const [selic, setSelic] = useState(fmtPercent(data.rates.selic))
  const [cdi, setCdi] = useState(fmtPercent(data.rates.cdi))
  const [ipca, setIpca] = useState(fmtPercent(data.rates.ipca))
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.zent.getVersion().then(setVersion)
  }, [])

  // Ressincroniza os drafts sempre que abrir
  useEffect(() => {
    if (open) {
      setNameDraft(data.profile.name)
      setSelic(fmtPercent(data.rates.selic))
      setCdi(fmtPercent(data.rates.cdi))
      setIpca(fmtPercent(data.rates.ipca))
      setEditingName(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const ratesAge = diffDays(data.rates.updatedAt, todayIso())
  const ratesStale = ratesAge > 45
  const ratesDirty =
    parsePercent(selic) !== data.rates.selic ||
    parsePercent(cdi) !== data.rates.cdi ||
    parsePercent(ipca) !== data.rates.ipca
  const ratesValid =
    parsePercent(selic) !== null && parsePercent(cdi) !== null && parsePercent(ipca) !== null

  function saveName(): void {
    const clean = nameDraft.trim()
    if (clean === '') {
      toast.error('Nome inválido', 'O nome não pode ficar vazio.')
      return
    }
    mutate((d) => {
      d.profile.name = clean
    })
    setEditingName(false)
    toast.success('Nome atualizado', `A partir de agora é "Olá, ${clean}".`)
  }

  function saveRates(): void {
    const s = parsePercent(selic)
    const c = parsePercent(cdi)
    const i = parsePercent(ipca)
    if (s === null || c === null || i === null) return
    mutate((d) => {
      d.rates = { selic: s, cdi: c, ipca: i, updatedAt: todayIso() }
    })
    toast.success('Taxas atualizadas', 'Todos os rendimentos foram recalculados.')
  }

  async function handleExport(): Promise<void> {
    await flushSave()
    const current = useDataStore.getState().data
    if (!current) return
    const path = await window.zent.exportData(
      JSON.stringify(current, null, 2),
      `zent-backup-${todayIso()}.json`,
    )
    if (path) {
      mutate((d) => {
        d.meta.lastManualExport = todayIso()
      })
      toast.success('Backup exportado', path)
    }
  }

  async function handleImport(): Promise<void> {
    const raw = await window.zent.importData()
    if (raw === null) return
    let imported
    try {
      imported = parseImportedData(raw)
    } catch {
      toast.error('Arquivo inválido', 'Este arquivo não é um backup válido do Zent Money.')
      return
    }
    const ok = await confirmDialog({
      title: 'Importar backup',
      message:
        'Importar este backup vai SUBSTITUIR todos os dados atuais do Zent Money. Essa ação não pode ser desfeita. Continuar?',
      confirmLabel: 'Substituir dados',
      danger: true,
    })
    if (!ok) return
    replaceAll(imported)
    toast.success('Backup importado', 'Seus dados foram restaurados com sucesso.')
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-label="Menu de perfil"
        className="absolute bg-surface border border-line rounded-card shadow-pop anim-pop-in w-[320px] flex flex-col max-h-[calc(100vh-32px)]"
        style={{ left: collapsed ? 84 : 16, top: collapsed ? 16 : 72 }}
      >
        {/* Nome */}
        <div className="px-4 pt-4 pb-3 border-b border-line">
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName()
                }}
                autoFocus
                maxLength={24}
                className="h-8.5 text-[13.5px]"
                aria-label="Seu nome"
              />
              <Button size="sm" onClick={saveName} aria-label="Salvar nome">
                <Check size={14} />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingName(false)} aria-label="Cancelar edição">
                <X size={14} />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-[15px] font-semibold text-ink">{data.profile.name}</p>
                <p className="text-[11.5px] text-ink-faint">Seu painel pessoal de finanças</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                aria-label="Editar nome"
                className="h-7.5 w-7.5 rounded-[8px] inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <Pencil size={13.5} />
              </button>
            </div>
          )}
        </div>

        <div className="overflow-y-auto">
          {/* Tema */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-line">
            <div className="flex items-center gap-2.5">
              {theme === 'dark' ? (
                <Moon size={15} className="text-ink-soft" />
              ) : (
                <Sun size={15} className="text-warn" />
              )}
              <span className="text-[13px] font-medium text-ink">Tema escuro</span>
            </div>
            <Switch
              checked={theme === 'dark'}
              onChange={(dark) => setTheme(dark ? 'dark' : 'light')}
              aria-label="Alternar tema escuro"
            />
          </div>

          {/* Taxas de referência */}
          <div className="px-4 py-3 border-b border-line">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-medium text-ink">Taxas de referência</span>
              <span
                className={cn(
                  'text-[11px] tnum',
                  ratesStale ? 'text-warn font-medium' : 'text-ink-faint',
                )}
              >
                {ratesStale && <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />}
                atualizadas em {formatDateBR(data.rates.updatedAt)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <PercentField label="Selic a.a." value={selic} onChange={setSelic} />
              <PercentField label="CDI a.a." value={cdi} onChange={setCdi} />
              <PercentField label="IPCA 12m" value={ipca} onChange={setIpca} />
            </div>
            {ratesStale && (
              <p className="text-[11.5px] text-warn mt-2 leading-snug">
                Faz mais de 45 dias (um ciclo do Copom). Pesquise “Selic hoje” e atualize aqui — tudo
                recalcula sozinho.
              </p>
            )}
            {ratesDirty && (
              <Button size="sm" className="mt-2.5 w-full" disabled={!ratesValid} onClick={saveRates}>
                Salvar taxas
              </Button>
            )}
          </div>

          {/* Backup */}
          <div className="px-4 py-3 border-b border-line">
            <span className="text-[13px] font-medium text-ink block mb-2">Backup</span>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => void handleExport()}>
                <Download size={13.5} /> Exportar
              </Button>
              <Button size="sm" variant="outline" onClick={() => void handleImport()}>
                <Upload size={13.5} /> Importar
              </Button>
            </div>
            <p className="text-[11px] text-ink-faint mt-2 leading-snug">
              {data.meta.lastManualExport
                ? `Última exportação manual: ${formatDateBR(data.meta.lastManualExport)}`
                : 'Você ainda não exportou um backup manual.'}{' '}
              Backups automáticos diários ficam na pasta de dados do app.
            </p>
          </div>

          {/* Sobre */}
          <div className="px-4 py-3 flex items-center gap-3">
            <ZentLogo size={28} />
            <div>
              <p className="text-[12.5px] font-medium text-ink">
                Zent Money {version && <span className="text-ink-faint tnum">v{version}</span>}
              </p>
              <p className="text-[11px] text-ink-faint">100% offline · seus dados são só seus</p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
