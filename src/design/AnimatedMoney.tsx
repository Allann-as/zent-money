import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatBRL } from '@/engine/money'

/**
 * Count-up de valores monetários (§5): anima da última posição até o novo
 * valor em ~550ms com easing suave, usando apenas re-render de texto
 * (custo desprezível). Respeita prefers-reduced-motion.
 */
export function useCountUp(target: number, duration = 550): number {
  const [display, setDisplay] = useState(target)
  const fromRef = useRef(target)
  const rafRef = useRef(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fromRef.current = target
      setDisplay(target)
      return
    }
    const from = fromRef.current
    if (from === target) return
    const start = performance.now()
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setDisplay(Math.round(from + (target - from) * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return display
}

/** Valor em BRL com count-up — usar nos números-herói e StatCards. */
export function AnimatedMoney({ cents }: { cents: number }): ReactNode {
  const value = useCountUp(cents)
  return <>{formatBRL(value)}</>
}
