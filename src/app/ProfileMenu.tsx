import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Download, KeyRound, Lock, Moon, Pencil, RefreshCw, Sun, Upload, AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useUiStore } from '@/store/uiStore'
import { useDataStore, useZentData } from '@/store/dataStore'
import { clearRateOverride, refreshRates, setRatesAutoUpdate } from '@/store/ratesActions'
import { Button } from '@/design/components/Button'
import { Input } from '@/design/components/Input'
import { Select } from '@/design/components/Select'
import { Switch } from '@/design/components/Switch'
import { toast } from '@/design/components/toast'
import { confirmDialog } from '@/design/components/confirm'
import { flushSave, parseImportedData } from '@/data/persistence'
import { diffDays, formatDateBR, todayIso } from '@/engine/dates'
import { ZentLogo } from '@/design/ZentLogo'
import { ChangePinModal } from '@/features/security/ChangePinModal'
import { ResetPinModal } from '@/features/security/ResetPinModal'

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

/** "2026-07-16T14:32:05.000Z" → "16/07/2026 11:32" (hora local do usuário). */
function formatDateTimeBR(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${formatDateBR(todayIso(d))} ${hh}:${mm}`
}

function PercentField({
  label,
  value,
  onChange,
  manual = false,
}: {
  label: string
  value: string
  onChange(v: string): void
  /** Taxa sob override manual: o automático não a atualiza (§2). */
  manual?: boolean
}): ReactNode {
  const invalid = value.trim() !== '' && parsePercent(value) === null
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11.5px] font-medium text-ink-soft flex items-center gap-1">
        {label}
        {manual && (
          <Pencil size={9.5} className="text-ink-faint shrink-0" aria-label="sob edição manual" />
        )}
      </span>
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
  const lockInactivityMinutes = useUiStore((s) => s.lockInactivityMinutes)
  const setLockInactivityMinutes = useUiStore((s) => s.setLockInactivityMinutes)

  const [changePinOpen, setChangePinOpen] = useState(false)
  const [resetPinOpen, setResetPinOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(data.profile.name)
  const [selic, setSelic] = useState(fmtPercent(data.rates.selic))
  const [cdi, setCdi] = useState(fmtPercent(data.rates.cdi))
  const [ipca, setIpca] = useState(fmtPercent(data.rates.ipca))
  const [version, setVersion] = useState('')
  const [refreshing, setRefreshing] = useState(false)

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
  // Só faz sentido cobrar atualização manual de quem não tem o automático
  // funcionando: com auto ligado e uma busca recente, o alerta seria ruído.
  const ratesStale = ratesAge > 45 && !(data.rates.autoUpdate && data.rates.lastAutoAt !== null)
  const ratesDirty =
    parsePercent(selic) !== data.rates.selic ||
    parsePercent(cdi) !== data.rates.cdi ||
    parsePercent(ipca) !== data.rates.ipca
  const ratesValid =
    parsePercent(selic) !== null && parsePercent(cdi) !== null && parsePercent(ipca) !== null
  const overrideNames = (['selic', 'cdi', 'ipca'] as const)
    .filter((k) => data.rates.overrides[k])
    .map((k) => ({ selic: 'Selic', cdi: 'CDI', ipca: 'IPCA' })[k])
  const anyOverride = overrideNames.length > 0

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

  /**
   * Salvar taxas à mão (§2): cada taxa alterada vira **override** — o
   * automático para de mexer nela até o usuário devolvê-la. Sem isso, o próximo
   * fetch (boot ou 24h) apagaria em silêncio o valor que ele acabou de digitar.
   */
  function saveRates(): void {
    const s = parsePercent(selic)
    const c = parsePercent(cdi)
    const i = parsePercent(ipca)
    if (s === null || c === null || i === null) return
    const overridden: string[] = []
    if (s !== data.rates.selic) overridden.push('Selic')
    if (c !== data.rates.cdi) overridden.push('CDI')
    if (i !== data.rates.ipca) overridden.push('IPCA')
    mutate((d) => {
      if (s !== d.rates.selic) d.rates.overrides.selic = true
      if (c !== d.rates.cdi) d.rates.overrides.cdi = true
      if (i !== d.rates.ipca) d.rates.overrides.ipca = true
      d.rates.selic = s
      d.rates.cdi = c
      d.rates.ipca = i
      d.rates.updatedAt = todayIso()
    })
    toast.success(
      'Taxas atualizadas',
      overridden.length > 0 && data.rates.autoUpdate
        ? `Todos os rendimentos foram recalculados. ${overridden.join(', ')} ${overridden.length === 1 ? 'ficou' : 'ficaram'} sob edição manual — a atualização automática não vai mexer ${overridden.length === 1 ? 'nela' : 'nelas'}.`
        : 'Todos os rendimentos foram recalculados.',
    )
  }

  async function handleRefreshRates(): Promise<void> {
    setRefreshing(true)
    const outcome = await refreshRates(true)
    setRefreshing(false)
    if (outcome === 'offline') {
      toast.warning(
        'Não deu para consultar agora',
        'Sem resposta das fontes oficiais. Suas taxas atuais continuam valendo.',
      )
      return
    }
    // Ressincroniza os campos com o que veio da rede
    const next = useDataStore.getState().data
    if (next) {
      setSelic(fmtPercent(next.rates.selic))
      setCdi(fmtPercent(next.rates.cdi))
      setIpca(fmtPercent(next.rates.ipca))
    }
    toast.success(
      outcome === 'updated' ? 'Taxas atualizadas' : 'Taxas conferidas',
      outcome === 'updated'
        ? 'Vieram das fontes oficiais e os rendimentos já foram recalculados.'
        : 'As fontes oficiais confirmaram os valores que você já tinha.',
    )
  }

  function handleClearOverrides(): void {
    for (const key of ['selic', 'cdi', 'ipca'] as const) {
      if (data.rates.overrides[key]) clearRateOverride(key)
    }
    void handleRefreshRates()
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

          {/* Taxas de referência (R4 §2) */}
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
              <PercentField label="Selic a.a." value={selic} onChange={setSelic} manual={data.rates.overrides.selic} />
              <PercentField label="CDI a.a." value={cdi} onChange={setCdi} manual={data.rates.overrides.cdi} />
              <PercentField label="IPCA 12m" value={ipca} onChange={setIpca} manual={data.rates.overrides.ipca} />
            </div>

            {/* Estado do automático + "Atualizar agora" */}
            <div className="flex items-center justify-between gap-2 mt-2.5">
              <p className="text-[11px] text-ink-faint leading-snug min-w-0">
                {data.rates.lastAutoAt !== null
                  ? `Última atualização automática: ${formatDateTimeBR(data.rates.lastAutoAt)}`
                  : data.rates.autoUpdate
                    ? 'Ainda não foi possível consultar as fontes oficiais.'
                    : 'Atualização automática desligada.'}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                disabled={refreshing}
                onClick={() => void handleRefreshRates()}
              >
                <RefreshCw size={12.5} className={cn(refreshing && 'animate-spin')} />
                {refreshing ? 'Consultando…' : 'Atualizar agora'}
              </Button>
            </div>

            {anyOverride && (
              <div className="flex items-center justify-between gap-2 mt-1.5 bg-surface-2 border border-line rounded-[9px] px-2.5 py-2">
                <p className="text-[11px] text-ink-soft leading-snug min-w-0">
                  {overrideNames.join(', ')} sob edição manual — o automático não mexe {overrideNames.length === 1 ? 'nela' : 'nelas'}.
                </p>
                <button
                  type="button"
                  onClick={handleClearOverrides}
                  className="text-[11px] font-medium text-primary hover:underline shrink-0 cursor-pointer"
                >
                  Voltar ao automático
                </button>
              </div>
            )}

            <label className="flex items-center justify-between gap-2 mt-2.5 cursor-pointer select-none">
              <span className="text-[12px] text-ink-soft">Atualização automática de taxas</span>
              <Switch
                checked={data.rates.autoUpdate}
                onChange={(on) => {
                  setRatesAutoUpdate(on)
                  if (on) void refreshRates()
                }}
                aria-label="Atualização automática de taxas"
              />
            </label>

            {ratesStale && (
              <p className="text-[11.5px] text-warn mt-2 leading-snug">
                Faz mais de 45 dias (um ciclo do Copom) e o automático não trouxe nada. Use “Atualizar
                agora” ou digite os valores — tudo recalcula sozinho.
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

          {/* Segurança (M2 §b) */}
          <div className="px-4 py-3 border-b border-line">
            <span className="text-[13px] font-medium text-ink flex items-center gap-2 mb-2">
              <Lock size={14} className="text-ink-soft" /> Segurança
            </span>
            <label className="flex items-center justify-between gap-2 mb-2.5">
              <span className="text-[12px] text-ink-soft min-w-0">Bloquear por inatividade</span>
              <Select
                value={lockInactivityMinutes === null ? 'off' : String(lockInactivityMinutes)}
                onChange={(e) =>
                  setLockInactivityMinutes(e.target.value === 'off' ? null : Number(e.target.value))
                }
                className="h-8 w-36 text-[12.5px] shrink-0"
                aria-label="Bloquear por inatividade"
              >
                <option value="off">Só ao abrir</option>
                <option value="5">Após 5 min</option>
                <option value="15">Após 15 min</option>
                <option value="30">Após 30 min</option>
              </Select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => setChangePinOpen(true)}>
                <KeyRound size={13.5} /> Alterar PIN
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setResetPinOpen(true)}>
                Esqueci o PIN
              </Button>
            </div>
            <p className="text-[11px] text-ink-faint mt-2 leading-snug">
              O PIN protege de olhares casuais; ele não criptografa o arquivo de dados.
            </p>
          </div>

          {/* Sobre */}
          <div className="px-4 py-3 flex items-center gap-3">
            <ZentLogo size={28} />
            <div>
              <p className="text-[12.5px] font-medium text-ink">
                Zent Money {version && <span className="text-ink-faint tnum">v{version}</span>}
              </p>
              {/* R4 §2: a frase "100% offline" deixou de ser verdade quando o app
                  passou a consultar as taxas. Dizer o que ele faz de fato é mais
                  forte do que uma promessa que o código não cumpre. */}
              <p className="text-[11px] text-ink-faint leading-snug">
                Seus dados nunca saem do seu computador — a única conexão é a consulta opcional das
                taxas oficiais.
              </p>
            </div>
          </div>
        </div>
      </div>
      <ChangePinModal open={changePinOpen} onClose={() => setChangePinOpen(false)} />
      <ResetPinModal open={resetPinOpen} onClose={() => setResetPinOpen(false)} />
    </div>,
    document.body,
  )
}
