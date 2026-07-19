import type { Category, Expense, ZentData } from '@/data/schema'
import type { Ym } from './dates'
import { expensesByCategory, groupByMonth, incomeByMonth, sumByMonth } from './aggregations'
import { monthBudgets } from './budget'
import { totalInvoices, totalMonthlyCommitment } from './cards'
import { formatBRL } from './money'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SCORE DE SAÚDE FINANCEIRA 0–100 (M4) — fórmula pura, transparente, testável.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Score = 40%·Poupança + 30%·Categorias + 30%·Compromissos (pesos aprovados).
 *
 *   · Poupança (s1):    sobra/renda → 0% = 0 pts · ≥30% = 100 (linear).
 *   · Categorias (s2):  % das categorias COM limite efetivo que fecharam dentro.
 *   · Compromissos (s3):(faturas+parcelas)/renda → ≤10% = 100 · ≥50% = 0 (inverso).
 *
 * Definições fechadas com o usuário:
 *  1. **Sobra negativa** → s1 = 0 (clamp); nunca puxa o score abaixo do que os
 *     pesos permitem.
 *  2. **Mês com movimentação mas SEM renda** (só gastos) → divisões por renda
 *     ficam indefinidas → `null` ("sem score ainda"), igual a um mês sem nada.
 *     Nunca se inventa denominador.
 *  3. **Sem categoria com limite** → o peso 30% de Categorias se redistribui
 *     PROPORCIONALMENTE aos pesos originais dos outros dois (40/30 → 57,14% e
 *     42,86%), não metade-metade. `redistributed=true` sinaliza o modo.
 *  4. **Arredondamento único no fim** (meio pra cima): os componentes são
 *     calculados com precisão cheia e só o SCORE FINAL é arredondado. Esse é o
 *     número exibido no anel, no detalhamento E na Linha do tempo (uma fonte).
 *
 * O histórico de meses passados é RE-DERIVADO dos dados daquele mês
 * (determinístico), nunca um snapshot gravado — ver `scoreForMonth`.
 */

/** Pesos base (§ do roadmap, aprovados). */
export const SCORE_WEIGHTS = { savings: 0.4, categories: 0.3, commitments: 0.3 } as const
/** Cortes de mapeamento (aprovados). */
export const SAVINGS_FULL = 0.3 // poupança ≥30% da renda → 100 pts
export const COMMIT_FULL = 0.1 // compromissos ≤10% da renda → 100 pts
export const COMMIT_ZERO = 0.5 // compromissos ≥50% da renda → 0 pts

export interface ScoreComponents {
  /** s1 0–100, precisão cheia. */
  savings: number
  /** s2 0–100, precisão cheia; null quando nenhuma categoria tem limite efetivo. */
  categories: number | null
  /** s3 0–100, precisão cheia. */
  commitments: number
}

export interface ScoreResult {
  /** 0–100 inteiro, arredondado (meio pra cima) — a ÚNICA fonte do número. */
  score: number
  components: ScoreComponents
  /** Pesos EFETIVOS usados (já redistribuídos quando não há categorias). */
  weights: { savings: number; categories: number; commitments: number }
  /** true quando o peso de Categorias foi redistribuído aos outros dois. */
  redistributed: boolean
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

/** Categoria orçada do mês: limite efetivo (não-nulo) e o gasto do mês nela. */
export interface BudgetedCategory {
  effective: number
  spent: number
}

/**
 * Fórmula pura. `income`/`spent`/`commitments` em centavos; `budgeted` são só as
 * categorias COM limite efetivo. Devolve `null` quando não há renda (def. 2).
 */
export function monthScore(
  income: number,
  spent: number,
  commitments: number,
  budgeted: readonly BudgetedCategory[],
): ScoreResult | null {
  if (income <= 0) return null // sem renda → sem denominador → sem score

  // s1 — poupança (clamp em 0: sobra negativa não vira nota negativa, def. 1)
  const savingsRatio = (income - spent) / income
  const s1 = clamp01(savingsRatio / SAVINGS_FULL) * 100

  // s3 — compromissos (inverso)
  const commitRatio = commitments / income
  const s3 = clamp01((COMMIT_ZERO - commitRatio) / (COMMIT_ZERO - COMMIT_FULL)) * 100

  // s2 — categorias dentro do limite efetivo; null se não houver nenhuma orçada
  let s2: number | null = null
  let weights: { savings: number; categories: number; commitments: number } = { ...SCORE_WEIGHTS }
  if (budgeted.length > 0) {
    const within = budgeted.filter((b) => b.spent <= b.effective).length
    s2 = (within / budgeted.length) * 100
  } else {
    // def. 3: redistribui o peso de Categorias proporcionalmente aos outros dois
    const denom = SCORE_WEIGHTS.savings + SCORE_WEIGHTS.commitments
    weights = {
      savings: SCORE_WEIGHTS.savings / denom,
      categories: 0,
      commitments: SCORE_WEIGHTS.commitments / denom,
    }
  }

  // def. 4: componentes em precisão cheia, arredondamento ÚNICO no fim
  const total = weights.savings * s1 + weights.categories * (s2 ?? 0) + weights.commitments * s3
  return {
    score: Math.round(total), // Math.round = meio pra cima no domínio positivo
    components: { savings: s1, categories: s2, commitments: s3 },
    weights,
    redistributed: s2 === null,
  }
}

/** Categoria orçada com nome (para o detalhamento e a ação concreta). */
interface NamedBudget extends BudgetedCategory {
  categoryId: string
  name: string
}

interface ScoreInputs {
  income: number
  spent: number
  commitments: number
  budgeted: NamedBudget[]
}

/**
 * Cache de score construído UMA vez sobre `data` (passadas O(n) sobre os gastos)
 * e reusado por N meses — no boot (avaliação de conquistas) e na navegação de
 * meses. Sem ele, cada mês re-varreria os 50k gastos (regressão de perf pega no
 * teste 50k). Construir por mês avulso é barato; o ganho é ao repetir por vários.
 */
export interface ScoreCache {
  spentByMonth: Map<Ym, number>
  expensesByMonth: Map<Ym, Expense[]>
  categoriesById: Map<string, Category>
  commitments: number
}

export function buildScoreCache(data: ZentData): ScoreCache {
  return {
    spentByMonth: sumByMonth(data.expenses),
    expensesByMonth: groupByMonth(data.expenses),
    categoriesById: new Map(data.categories.map((c) => [c.id, c])),
    commitments: totalInvoices(data.cards) + totalMonthlyCommitment(data.purchases),
  }
}

/**
 * Monta as entradas do score de um mês, RE-DERIVADAS dos dados (determinístico).
 * Reusa exatamente as mesmas contas da Visão geral (uma fonte): renda e gasto
 * são históricos do mês; compromissos são a obrigação ATUAL (faturas + parcelas),
 * como o card "Compromissos" — o modelo não historiza fatura.
 */
function scoreInputs(data: ZentData, ym: Ym, cache: ScoreCache): ScoreInputs {
  const income = incomeByMonth(data.salaryHistory, data.extraIncomes, [ym]).get(ym) ?? 0
  const spent = cache.spentByMonth.get(ym) ?? 0
  const monthExpenses = cache.expensesByMonth.get(ym) ?? []
  const spentByCat = expensesByCategory(monthExpenses, ym)

  const budgets = monthBudgets(data.categories, data.budgetReallocations, ym)
  const budgeted: NamedBudget[] = []
  for (const b of budgets.values()) {
    if (b.effective !== null) {
      budgeted.push({
        categoryId: b.categoryId,
        name: cache.categoriesById.get(b.categoryId)?.name ?? 'Categoria',
        effective: b.effective,
        spent: spentByCat.get(b.categoryId) ?? 0,
      })
    }
  }
  return { income, spent, commitments: cache.commitments, budgeted }
}

/**
 * Score do mês (anel do hero + Linha do tempo). Determinístico; null = sem score.
 * Passe um `cache` (buildScoreCache) ao pontuar vários meses para não re-varrer
 * os gastos a cada mês.
 */
export function scoreForMonth(data: ZentData, ym: Ym, cache = buildScoreCache(data)): ScoreResult | null {
  const i = scoreInputs(data, ym, cache)
  return monthScore(i.income, i.spent, i.commitments, i.budgeted)
}

export interface ScoreAction {
  categoryName: string
  amount: number
  points: number
  /** Frase pronta: "Reduza R$ X em [categoria]". */
  text: string
}

/**
 * Uma AÇÃO CONCRETA para subir o score (§ M4): a categoria mais estourada em
 * relação ao limite efetivo. Reduzi-la ao limite melhora Categorias E Poupança;
 * o ganho em pontos é medido re-rodando a MESMA fórmula com aquele gasto no teto.
 * `null` quando nenhuma categoria está estourada (nada óbvio a sugerir).
 */
export function scoreAction(data: ZentData, ym: Ym, cache = buildScoreCache(data)): ScoreAction | null {
  const i = scoreInputs(data, ym, cache)
  const base = monthScore(i.income, i.spent, i.commitments, i.budgeted)
  if (base === null) return null

  let worst: (NamedBudget & { over: number }) | null = null
  for (const b of i.budgeted) {
    const over = b.spent - b.effective
    if (over > 0 && (worst === null || over > worst.over)) worst = { ...b, over }
  }
  if (worst === null) return null

  const simBudgeted = i.budgeted.map((b) =>
    b.categoryId === worst.categoryId ? { ...b, spent: b.effective } : b,
  )
  const sim = monthScore(i.income, i.spent - worst.over, i.commitments, simBudgeted)
  const points = (sim?.score ?? base.score) - base.score
  if (points <= 0) return null
  return { categoryName: worst.name, amount: worst.over, points, text: `Reduza ${formatBRL(worst.over)} em ${worst.name}` }
}
