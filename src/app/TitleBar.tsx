import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { useUiStore } from '@/store/uiStore'
import { ZentMark } from '@/design/ZentLogo'

/**
 * Faixa de título do app (R3). A barra branca do Windows destoava do produto —
 * `titleBarStyle: 'hidden'` no main tira a barra do sistema e deixa só os botões
 * nativos sobrepostos à direita, que repintamos nas cores do tema.
 *
 * Os botões continuam sendo os nativos de propósito: minimizar, maximizar,
 * fechar e o snap-assist do Win11 vêm de graça e corretos.
 *
 * Cor: a faixa lê `--titlebar-bg` direto no CSS (segue o tema sozinha) e os
 * botões nativos, que só o processo main pinta, recebem o MESMO token lido do
 * DOM. Um token só, nenhum hex duplicado em JS — se divergissem, a faixa e os
 * botões ficariam de cores diferentes.
 *
 * A altura (36px) precisa bater com TITLE_BAR_HEIGHT do main: é ela que reserva
 * o espaço dos botões sobrepostos.
 */
export function TitleBar(): ReactNode {
  const theme = useUiStore((s) => s.theme)

  useEffect(() => {
    // lê os tokens já aplicados ao <html> e repinta os botões nativos
    const css = getComputedStyle(document.documentElement)
    const color = css.getPropertyValue('--titlebar-bg').trim()
    const symbolColor = css.getPropertyValue('--titlebar-symbol').trim()
    if (color === '' || symbolColor === '') return
    void window.zent.setTitleBarTheme(color, symbolColor)
  }, [theme])

  return (
    <div
      className="h-9 shrink-0 flex items-center gap-2 px-3 select-none border-b border-line/60 theme-transition"
      style={
        {
          // faixa inteira arrasta a janela (os botões nativos ficam à direita)
          WebkitAppRegion: 'drag',
          background: 'var(--titlebar-bg)',
        } as CSSProperties
      }
    >
      <ZentMark size={13} className="text-primary shrink-0" />
      <span className="text-[11.5px] font-medium tracking-wide text-ink-faint">Zent Money</span>
    </div>
  )
}
