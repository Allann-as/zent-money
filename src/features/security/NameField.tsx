import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CAMPO DO NOME (R10 §⑦) — cursor de terminal à ESQUERDA do placeholder
 * ═══════════════════════════════════════════════════════════════════════
 *
 * A exigência é precisa: com o campo vazio, o cursor pisca **antes** do
 * texto-fantasma `insira seu nome` (não depois dele); ao digitar, o fantasma
 * some e o cursor acompanha o fim do que foi digitado.
 *
 * O `placeholder` nativo não faz isso — o caret nativo fica no início (colado
 * na primeira letra do fantasma) e não "à esquerda do fantasma inteiro". Então
 * o input real fica com o caret transparente e a camada visível é desenhada por
 * nós: `[texto digitado][cursor][fantasma, só quando vazio]`. O input continua
 * sendo um `<input>` de verdade — foco, teclado, acessibilidade e colar
 * seguem nativos; só o caret é pintado à mão.
 */
export function NameField({
  value,
  onChange,
  onEnter,
  placeholder = 'insira seu nome',
  maxLength = 24,
}: {
  value: string
  onChange(v: string): void
  onEnter(): void
  placeholder?: string
  maxLength?: number
}): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)

  // Foca ao montar — o passo do nome existe para ser digitado agora.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const showCaret = focused
  const showGhost = value.length === 0

  return (
    <div
      className="relative w-full max-w-[17rem] cursor-text"
      onMouseDown={(e) => {
        // clicar em qualquer lugar do campo foca o input, não seleciona a camada
        e.preventDefault()
        inputRef.current?.focus()
      }}
    >
      {/* Camada visível: texto + cursor + fantasma. `aria-hidden` porque o
          conteúdo acessível é o próprio <input> abaixo. */}
      <div
        aria-hidden="true"
        className="flex items-center min-h-[2.75rem] px-3.5 rounded-[11px] border border-line-strong bg-surface-2/70 text-[15px] text-ink font-display"
      >
        <span className="whitespace-pre">{value}</span>
        <span
          className={`inline-block w-[2px] h-[1.15em] bg-primary shrink-0 ${showCaret ? 'anim-caret' : 'opacity-0'}`}
        />
        {showGhost && <span className="text-ink-faint select-none">{placeholder}</span>}
      </div>

      {/* Input real: caret transparente (o nosso é pintado acima), texto também
          transparente para não duplicar. Ele carrega o valor e o teclado. */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onEnter()
          }
        }}
        aria-label={placeholder}
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        className="absolute inset-0 w-full h-full px-3.5 bg-transparent text-transparent caret-transparent outline-none rounded-[11px]"
      />
    </div>
  )
}
