import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { ZentData } from '@/data/schema'
import { scheduleSave } from '@/data/persistence'

/**
 * Store central de dados. Toda mutação passa por `mutate`, que aplica a
 * receita (immer) e agenda a persistência com debounce.
 * Os módulos de feature definem ações específicas por cima deste primitivo.
 */
interface DataState {
  /** null enquanto carrega no boot. */
  data: ZentData | null
  /** Logos detectados em assets/logos (nome normalizado → data URL). */
  logos: Record<string, string>
  initialize(data: ZentData, logos: Record<string, string>): void
  setLogos(logos: Record<string, string>): void
  /** Substitui tudo (import de backup). */
  replaceAll(data: ZentData): void
  mutate(recipe: (draft: ZentData) => void): void
}

export const useDataStore = create<DataState>()(
  immer((set, get) => ({
    data: null,
    logos: {},
    initialize: (data, logos) => set({ data, logos }),
    setLogos: (logos) => set({ logos }),
    replaceAll: (data) => {
      set({ data })
      scheduleSave(data)
    },
    mutate: (recipe) => {
      set((s) => {
        if (s.data) recipe(s.data)
      })
      const next = get().data
      if (next) scheduleSave(next)
    },
  })),
)

/** Hook de conveniência: dados garantidos (usar apenas depois do boot). */
export function useZentData(): ZentData {
  const data = useDataStore((s) => s.data)
  if (!data) throw new Error('useZentData usado antes do carregamento dos dados')
  return data
}
