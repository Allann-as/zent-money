import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * E2E do Zent Money v2 (§10.2): percorre as 8 seções, cria todas as
 * entidades pelos formulários, exercita gráficos/filtros/tema/sidebar,
 * a seção Parcelas, a Carteira com classes, a busca global, recorrentes
 * e o alerta de limite — com ZERO erros de console.
 */

let app: ElectronApplication
let page: Page
let userDataDir: string
const consoleErrors: string[] = []

test.beforeAll(async () => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zent-e2e-'))
  const env = {
    ...process.env,
    ZENT_USER_DATA: userDataDir,
    // R4 §2: a suíte NUNCA toca a rede. Todo o E2E roda, portanto, no modo
    // offline — o app inteiro tem de funcionar sem conexão, e isso passa a ser
    // verificado a cada execução em vez de ser uma promessa.
    ZENT_OFFLINE: '1',
  } as Record<string, string>
  delete env['ELECTRON_RUN_AS_NODE'] // shells do VS Code herdam isso e quebram o launch
  app = await electron.launch({ args: ['out/main/main.js'], env })
  // Com a mini-janela da bandeja (M5) pré-criada no boot, há DUAS janelas — pego
  // a principal (sem `#quick`), não a que abrir primeiro por acaso.
  page = await mainWindow()
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${String(err)}`))

  // A mini-janela da bandeja (M5) é outro renderer: capturo os erros dela também,
  // para o teste 24 (zero erros) cobrir as duas janelas.
  const mini = await quickWindow()
  mini.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[quick] ${msg.text()}`)
  })
  mini.on('pageerror', (err) => consoleErrors.push(`[quick] pageerror: ${String(err)}`))

  // Primeira execução (M2 §b + R10 §⑦): o app nasce pedindo para criar a senha,
  // confirmar e escolher o nome — três passos, mesmo layout do bloqueio. O E2E
  // NÃO usa o bypass (ZENT_NO_LOCK): exercita o fluxo real. Senha de teste "1234",
  // descartável e isolada (nunca a do usuário; some com o userData temporário).
  // O NOME não é segredo — pode ir ao teste (só o PIN não pode).
  await page.getByRole('heading', { name: 'Crie sua senha' }).waitFor({ timeout: 20_000 })
  await enterPin('1234') // definir
  await page.getByRole('heading', { name: 'Confirme sua senha' }).waitFor({ timeout: 5_000 })
  await enterPin('1234') // confirmar
  // passo 3: o nome, com o campo de cursor à esquerda do placeholder
  await page.getByRole('heading', { name: 'Como você quer ser chamado?' }).waitFor({ timeout: 5_000 })
  await page.getByLabel('insira seu nome').fill('Alex')
  await page.getByRole('button', { name: 'Entrar no Zent' }).click()
  await page.waitForSelector('aside', { timeout: 20_000 })
})

/** A saudação de desbloqueio (R10 §⑦), agora personalizada pelo nome do passo 3. */
const UNLOCK_GREETING = 'Seja bem-vindo de volta, Alex'

/** A janela PRINCIPAL do app (sem `#quick` no URL) — não a mini da bandeja. */
async function mainWindow(): Promise<Page> {
  for (let i = 0; i < 60; i++) {
    for (const w of app.windows()) {
      if (!w.url().includes('#quick')) return w
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('janela principal não encontrada')
}

/** A mini-janela da bandeja (`#quick`) — espera ela aparecer após showQuickEntry. */
async function quickWindow(): Promise<Page> {
  for (let i = 0; i < 60; i++) {
    for (const w of app.windows()) {
      if (w.url().includes('#quick')) return w
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('mini-janela da bandeja não encontrada')
}

/** Digita um PIN no teclado do PinPad (cliques nos botões) e confirma. */
async function enterPin(pin: string): Promise<void> {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar PIN' }).click()
}

test.afterAll(async () => {
  await app?.close()
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

/**
 * Opacidade computada da ilha de ações (§5).
 *
 * Vai por `page.evaluate` com cast de `globalThis`, e não pelos tipos do DOM,
 * porque o tsconfig do E2E roda com `lib: ["ES2022"]` — sem DOM de propósito.
 * É a mesma saída que os testes da bandeja já usavam para falar com `zent`.
 */
async function islandOpacity(): Promise<number> {
  return page.evaluate(() => {
    const g = globalThis as unknown as {
      document: { querySelector(s: string): unknown }
      getComputedStyle(el: unknown): { opacity: string }
    }
    const el = g.document.querySelector('[role="group"][aria-label="Ações rápidas"]')
    return el === null ? -1 : Number(g.getComputedStyle(el).opacity)
  })
}

async function goTo(label: string): Promise<void> {
  await page.click(`aside >> text="${label}"`)
  await page.waitForTimeout(250)
}

test('1. visão geral abre com o seed (hero + saudação + balão)', async () => {
  // A seção inicial padrão passou a ser "Hoje" (v2.1 §2, o loop diário); a Visão
  // geral agora se alcança pela navegação.
  await goTo('Visão geral')
  await expect(page.getByText('Olá, Alex')).toBeVisible()
  await expect(page.getByText('Patrimônio total')).toBeVisible()
  await expect(page.getByText(/^Resumo de/)).toBeVisible() // balão inteligente
})

test('2. sidebar recolhe e expande (hambúrguer e Ctrl+B)', async () => {
  const aside = page.locator('aside')
  await page.getByRole('button', { name: 'Recolher menu' }).click()
  await page.waitForTimeout(350)
  expect((await aside.boundingBox())?.width ?? 0).toBeLessThan(100)
  await page.keyboard.press('Control+b')
  await page.waitForTimeout(350)
  expect((await aside.boundingBox())?.width ?? 0).toBeGreaterThan(200)
})

test('3. tema alterna para claro e volta', async () => {
  await page.getByText('Olá, Alex').click()
  const switchEl = page.getByRole('switch', { name: 'Alternar tema escuro' })
  await switchEl.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await switchEl.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.keyboard.press('Escape')
})

test('4. ganhos: salário e extra somam no total de entradas', async () => {
  await goTo('Ganhos')
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Salário mensal' }).fill('3.200,00')
  await dialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Salário atualizado')).toBeVisible()

  await page.getByRole('button', { name: 'Novo extra' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Ex.: Presente da vó, Freela…').fill('Freela site')
  await dialog.getByRole('textbox', { name: 'Valor do ganho extra' }).fill('400')
  await dialog.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByText('R$ 3.600,00')).toBeVisible()
})

test('5. gastos: onboarding cria categorias sem nada pré-criado', async () => {
  await goTo('Gastos')
  await expect(page.getByText('Suas categorias, do seu jeito')).toBeVisible()
  await page.getByRole('button', { name: /^Criar \d+ categorias?$/ }).click()
  await expect(page.getByText(/categorias? criadas?/)).toBeVisible()
})

test('6. gastos: lançamento, reclassificação, filtro e alerta de limite', async () => {
  await page.getByRole('button', { name: 'Novo gasto' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Categoria').selectOption({ label: 'Mercado' })
  await dialog.getByPlaceholder('Ex.: Compras da semana').fill('Compras da semana')
  await dialog.getByRole('textbox', { name: 'Valor do gasto' }).fill('150')
  await dialog.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByText('Gasto registrado')).toBeVisible()

  await page.getByRole('button', { name: 'Novo gasto' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Categoria').selectOption({ label: 'Lazer' })
  await dialog.getByPlaceholder('Ex.: Compras da semana').fill('Cinema')
  await dialog.getByRole('textbox', { name: 'Valor do gasto' }).fill('60')
  await dialog.getByRole('radio', { name: 'Supérfluo', exact: true }).click()
  await dialog.getByRole('button', { name: 'Adicionar' }).click()

  await expect(page.getByText('é aqui que dá pra poupar')).toBeVisible()

  // reclassificar direto na lista
  await page.locator('li', { hasText: 'Cinema' }).getByRole('button', { name: 'Supérfluo' }).click()
  await expect(
    page.locator('li', { hasText: 'Cinema' }).getByRole('button', { name: 'Necessário' }),
  ).toBeVisible()

  // filtro por categoria destaca total e %
  await page.getByLabel('Filtrar por categoria').selectOption({ label: 'Mercado' })
  await expect(page.getByText(/em Mercado · \d+% do total/)).toBeVisible()
  await page.getByLabel('Filtrar por categoria').selectOption({ label: 'Todas as categorias' })

  // orçamento: define teto de 100 em Lazer e estoura com um gasto de 90.
  // M1 §c: o estouro agora é um AVISO PRÉ-SALVAR (não um toast pós-fato).
  await page.getByRole('button', { name: 'Categorias' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Editar categoria Lazer' }).click()
  await page.getByRole('dialog').getByRole('textbox', { name: 'Limite mensal da categoria' }).fill('100')
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await page.getByRole('button', { name: 'Novo gasto' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Categoria').selectOption({ label: 'Lazer' })
  await dialog.getByRole('textbox', { name: 'Valor do gasto' }).fill('90')
  await expect(dialog.getByText(/ultrapassa o orçamento de/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Lançar mesmo assim' }).click()
  await expect(page.getByText('Gasto registrado')).toBeVisible()
})

/** M1 §b — o "Resumo por categoria" alterna entre barras e rosca (pref persistida). */
test('6b. gastos: toggle rosca/barras no Resumo por categoria', async () => {
  await page.getByRole('radio', { name: 'Rosca' }).click()
  await expect(page.getByText('Total do mês')).toBeVisible() // centro da rosca
  await page.getByRole('radio', { name: 'Barras' }).click()
})

/** M1 §c — realocar orçamento de uma categoria para outra, com prévia e desfazer. */
test('6c. orçamento: realocar entre categorias e desfazer', async () => {
  // Mercado ganha um teto folgado para ceder sem estourar depois
  await page.getByRole('button', { name: 'Categorias' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Editar categoria Mercado' }).click()
  await page.getByRole('dialog').getByRole('textbox', { name: 'Limite mensal da categoria' }).fill('10.000,00')
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()

  // abre a realocação pelo painel de orçamento (Gastos)
  await page.getByRole('button', { name: 'Realocar', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Realocar orçamento' })
  await dialog.getByLabel('Categoria de origem').selectOption({ label: 'Mercado' })
  await dialog.getByLabel('Categoria de destino').selectOption({ label: 'Lazer' })
  await dialog.getByRole('textbox', { name: 'Valor a realocar' }).fill('50')
  await dialog.getByRole('button', { name: 'Realocar' }).click()
  await expect(page.getByText('Orçamento realocado')).toBeVisible()

  // desfazer devolve o orçamento (nada de dinheiro se moveu)
  await page.getByRole('button', { name: 'Desfazer realocação de Mercado para Lazer' }).click()
  await expect(page.getByText('Realocação desfeita')).toBeVisible()
})

test('7. gastos: lançamento recorrente cria template gerenciável', async () => {
  await page.getByRole('button', { name: 'Novo gasto' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Categoria').selectOption({ label: 'Mercado' })
  await dialog.getByPlaceholder('Ex.: Compras da semana').fill('Assinatura mensal')
  await dialog.getByRole('textbox', { name: 'Valor do gasto' }).fill('39,90')
  await dialog.getByRole('checkbox', { name: 'Repetir todo mês' }).check()
  await dialog.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByText('Gasto recorrente criado')).toBeVisible()

  await page.getByRole('button', { name: 'Recorrentes' }).click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByText('Assinatura mensal')).toBeVisible()
  await modal.getByRole('button', { name: 'Encerrar' }).click()
  await expect(page.getByText('"Assinatura mensal" encerrada')).toBeVisible()
  await page.keyboard.press('Escape')
})

test('7b. Hoje: anel do dia, ignição, combustível e micro-recompensa ao registrar (v2.1 §2)', async () => {
  await goTo('Hoje')
  // Peças do loop diário presentes.
  await expect(page.getByText('gasto hoje')).toBeVisible()
  await expect(page.getByText('sequência de ignição')).toBeVisible()
  await expect(page.getByText(/Nível/)).toBeVisible()
  await expect(page.getByText('resumo do dia')).toBeVisible()

  // Registrar um gasto pela FAB abre o MESMO fluxo e dá a micro-recompensa.
  await page.getByRole('button', { name: 'Lançar gasto' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Categoria').selectOption({ label: 'Mercado' })
  await dialog.getByPlaceholder('Ex.: Compras da semana').fill('Café')
  await dialog.getByRole('textbox', { name: 'Valor do gasto' }).fill('8')
  await dialog.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByText('Gasto registrado')).toBeVisible()
  // O dia de hoje acende na fita (o número do dia fica visível no bloco "hoje").
  await expect(page.getByText('gasto hoje')).toBeVisible()
})

test('8. cartão: parcela reduz o limite (caso 5.000 / 100×10 da spec)', async () => {
  await goTo('Bancos & Cartões')
  await page.getByRole('button', { name: 'Cartão', exact: true }).first().click()
  let dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Ex.: Ultravioleta').fill('Ultravioleta')
  await dialog.getByRole('textbox', { name: 'Limite total do cartão' }).fill('5.000,00')
  await dialog.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByText('Cartão "Ultravioleta" adicionado')).toBeVisible()

  await page.getByRole('button', { name: 'Compra parcelada' }).first().click()
  dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Ex.: Notebook').fill('Notebook')
  await dialog.getByRole('textbox', { name: 'Valor da parcela' }).fill('100')
  await dialog.getByLabel('Total de parcelas').fill('10')
  // Prévia de impacto do parcelamento (§7): o freio consciente antes de confirmar.
  await expect(dialog.getByText('o que acontece se confirmar')).toBeVisible()
  await expect(dialog.getByText('Valor por mês')).toBeVisible()
  await expect(dialog.getByText('Salário disponível após')).toBeVisible()
  await dialog.getByRole('button', { name: 'Adicionar' }).click()

  // disponível = 5.000 − 0 − 10×100 = 4.000
  await expect(page.getByText('R$ 4.000,00')).toBeVisible()

  // R10 §⑤: pagar uma parcela passa pela confirmação já preenchida — sem digitar
  // valor. O diálogo mostra o limite ANTES → DEPOIS e confirma.
  await page.getByRole('button', { name: 'Registrar pagamento da 1ª parcela de Notebook' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByText('1ª de 10')).toBeVisible()
  await expect(dialog.getByText('R$ 100,00')).toBeVisible()
  await expect(dialog).toContainText('R$ 4.100,00') // limite depois
  await expect(dialog).toContainText('já está na fatura') // de onde o dinheiro sai
  await dialog.getByRole('button', { name: 'Confirmar pagamento' }).click()
  await expect(page.getByText('R$ 4.100,00').first()).toBeVisible()
  await page.getByRole('button', { name: 'Desfazer última parcela paga de Notebook' }).click()
  await expect(page.getByText('R$ 4.000,00')).toBeVisible()
})

test('8b. crédito: hub dos cartões com usado × disponível e fatura total (§6)', async () => {
  // "Crédito" é o nome do grupo E do item de nav — navega pelo botão do item.
  await page.getByRole('navigation', { name: 'Seções' }).getByRole('button', { name: 'Crédito', exact: true }).click()
  await page.waitForTimeout(250)
  await expect(page.getByText('Fatura total do mês')).toBeVisible()
  await expect(page.getByText('Todos os cartões')).toBeVisible()
  // o cartão "Ultravioleta" (teste 8) aparece com usado e livre
  await expect(page.getByText('Ultravioleta').first()).toBeVisible()
  await expect(page.getByText(/^usado/).first()).toBeVisible()
  await expect(page.getByText(/^livre/).first()).toBeVisible()
  await expect(page.getByText('Limite usado', { exact: true })).toBeVisible()
})

test('9. parcelas: registrar pagamento em um clique, com desfazer (R10 §⑤)', async () => {
  await goTo('Parcelas')
  await expect(page.getByText('Comprometido por mês')).toBeVisible()
  await expect(page.getByText(/1 compra ativa/)).toBeVisible() // balão
  const item = page.locator('li', { hasText: 'Notebook' })
  await expect(item).toBeVisible()
  await expect(item.getByText('0/10')).toBeVisible()

  // O card abre a confirmação; nenhum campo de valor para digitar.
  await item.getByRole('button', { name: 'Registrar pagamento da 1ª parcela de Notebook' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('1ª de 10')).toBeVisible()
  await expect(dialog).toContainText('faltam 9')
  await expect(dialog.locator('input, textarea')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Confirmar pagamento' }).click()
  await expect(item.getByText('1/10')).toBeVisible()

  // desfazer pelo toast (a ação vive no próprio aviso do que acabou de acontecer)
  await page.getByRole('button', { name: 'Desfazer pagamento' }).click()
  await expect(item.getByText('0/10')).toBeVisible()

  // cancelar não muda nada
  await item.getByRole('button', { name: 'Registrar pagamento da 1ª parcela de Notebook' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
  await expect(item.getByText('0/10')).toBeVisible()
})

/** R10 §⑤ — a última parcela leva o card ao estado próprio de QUITADA. */
test('9c. parcelas: quitar leva o card ao estado de quitada (não é a ativa apagada)', async () => {
  await goTo('Parcelas')
  await page.getByRole('button', { name: 'Nova parcela' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Avulsa', exact: true }).click()
  await dialog.getByPlaceholder('Ex.: Empréstimo pessoal').fill('Boleto único')
  await dialog.getByRole('textbox', { name: 'Credor da parcela avulsa' }).fill('Loja Y')
  await dialog.getByRole('textbox', { name: 'Valor da parcela' }).fill('80')
  await dialog.getByLabel('Total de parcelas').fill('1')
  await dialog.getByRole('button', { name: 'Adicionar' }).click()

  const item = page.locator('li', { hasText: 'Boleto único' })
  await item.getByRole('button', { name: 'Registrar pagamento da 1ª parcela de Boleto único' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByText('quitada')).toBeVisible() // o diálogo prevê o desfecho
  await dialog.getByRole('button', { name: 'Confirmar pagamento' }).click()

  // com o filtro "Ativas" (padrão) a quitada sai da lista — é o que o filtro diz
  await expect(page.locator('li', { hasText: 'Boleto único' })).toHaveCount(0)

  // no filtro "Quitadas" ela aparece no ESTADO PRÓPRIO: selo, sem ação de pagar
  await page.getByRole('tab', { name: 'Quitadas' }).click()
  const done = page.locator('li', { hasText: 'Boleto único' })
  await expect(done.getByText('quitada', { exact: true })).toBeVisible()
  await expect(done.getByRole('button', { name: /^Registrar pagamento/ })).toHaveCount(0)

  // limpa o palco para os testes seguintes não verem esta avulsa
  await done.getByRole('button', { name: 'Excluir compra Boleto único' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click()
  await page.getByRole('tab', { name: 'Ativas' }).click()
})

/** R3 §2 — parcela avulsa: entra no comprometido, mas NÃO toca no limite do cartão. */
test('9b. parcelas avulsas: criar, entrar em Compromissos e não afetar o limite', async () => {
  // limite disponível do cartão ANTES da avulsa (5.000 − 10×100 = 4.000)
  await goTo('Bancos & Cartões')
  await expect(page.getByText('R$ 4.000,00')).toBeVisible()

  await goTo('Parcelas')
  await page.getByRole('button', { name: 'Nova parcela' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Avulsa', exact: true }).click()
  await dialog.getByPlaceholder('Ex.: Empréstimo pessoal').fill('Empréstimo pessoal')
  await dialog.getByRole('textbox', { name: 'Credor da parcela avulsa' }).fill('Banco X')
  await dialog.getByRole('textbox', { name: 'Valor da parcela' }).fill('300')
  await dialog.getByLabel('Total de parcelas').fill('24')
  await dialog.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByText('Parcela avulsa adicionada')).toBeVisible()

  // item na lista: chip "avulsa" + credor, sem logo de banco
  const item = page.locator('li', { hasText: 'Empréstimo pessoal' })
  await expect(item.getByText('avulsa')).toBeVisible()
  await expect(item).toContainText('Banco X')
  await expect(item.locator('img')).toHaveCount(0)

  // comprometido/mês passa a somar a avulsa: 100 (cartão) + 300 (avulsa) = 400
  await expect(page.getByText('Comprometido por mês').locator('..')).toContainText('R$ 400,00')

  // registrar pagamento / desfazer funcionam também na avulsa
  await item.getByRole('button', { name: 'Registrar pagamento da 1ª parcela de Empréstimo pessoal' }).click()
  const payDialog = page.getByRole('dialog')
  await expect(payDialog).toContainText('Parcela avulsa') // sem conta a debitar, e diz por quê
  await payDialog.getByRole('button', { name: 'Confirmar pagamento' }).click()
  await expect(item.getByText('1/24')).toBeVisible()
  await item.getByRole('button', { name: 'Desfazer última parcela paga de Empréstimo pessoal' }).click()
  await expect(item.getByText('0/24')).toBeVisible()

  // filtro "Avulsas" isola as avulsas e esconde as de cartão
  await page.getByLabel('Filtrar por banco').selectOption({ label: 'Avulsas' })
  await expect(page.locator('li', { hasText: 'Empréstimo pessoal' })).toBeVisible()
  await expect(page.locator('li', { hasText: 'Notebook' })).toHaveCount(0)
  await page.getByLabel('Filtrar por banco').selectOption({ label: 'Todos os bancos' })

  // O PONTO CRÍTICO: o limite do cartão continua intocado pela avulsa
  await goTo('Bancos & Cartões')
  await expect(page.getByText('R$ 4.000,00')).toBeVisible()

  // e Compromissos (Visão geral) discrimina faturas × cartão × avulsas no tooltip
  await goTo('Visão geral')
  await page.getByText('Compromissos').hover()
  const tip = page.getByRole('tooltip')
  await expect(tip).toContainText('Parcelas avulsas')
  await expect(tip).toContainText('R$ 300,00')
  await expect(tip).toContainText('Parcelas de cartão')
  dialog = page.getByRole('dialog') // encerra o hover
})

test('10. carteira: ativo com classe + aporte + 3 modos + filtros', async () => {
  await goTo('Carteira')
  await page.getByRole('button', { name: 'Novo ativo' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Ex.: CDB Liquidez Diária').fill('CDB Teste')
  await dialog.getByLabel('Classe do ativo').selectOption({ label: 'Prefixado' })
  await dialog.getByRole('textbox', { name: 'Taxa (% a.a.)' }).fill('12')
  await dialog.getByRole('button', { name: 'Criar ativo' }).click()
  await expect(page.getByText('Ativo "CDB Teste" criado')).toBeVisible()

  await page.getByRole('button', { name: 'Aporte', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Valor do aporte' }).fill('1.000,00')
  await dialog.getByRole('button', { name: 'Registrar aporte' }).click()
  await expect(page.getByText('Aporte registrado')).toBeVisible()
  await expect(page.getByText('Total aportado').locator('..')).toContainText('R$ 1.000,00')

  // 3 modos de gráfico
  await page.getByRole('tab', { name: 'Composição' }).click()
  await expect(page.getByText('Carteira', { exact: true }).first()).toBeVisible()
  await page.getByRole('tab', { name: 'Rendimento mês a mês' }).click()
  await expect(page.locator('svg[aria-label="Gráfico de barras"]')).toBeVisible()
  await page.getByRole('tab', { name: 'Evolução' }).click()
  await expect(page.locator('svg[aria-label="Gráfico de evolução"]')).toBeVisible()

  // filtro por banco combinado com filtro por classe
  await page.getByRole('group', { name: 'Filtrar por banco' }).getByRole('button', { name: 'Nubank' }).click()
  await expect(page.getByText('CDB Teste').first()).toBeVisible()
  await page.getByRole('group', { name: 'Filtrar por classe' }).getByRole('button', { name: 'Renda fixa IPCA+' }).click()
  await expect(page.getByText('Nada com esses filtros')).toBeVisible()
  await page.getByRole('group', { name: 'Filtrar por classe' }).getByRole('button', { name: 'Todas as classes' }).click()
  await page.getByRole('group', { name: 'Filtrar por banco' }).getByRole('button', { name: 'Todos' }).click()
})

test('11. carteira: ativo manual com atualização de valor de mercado', async () => {
  await page.getByRole('button', { name: 'Novo ativo' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Ex.: CDB Liquidez Diária').fill('FII Teste')
  await dialog.getByLabel('Classe do ativo').selectOption({ label: 'Outros ativos' })
  await dialog.getByRole('textbox', { name: 'Valor de mercado atual' }).fill('2.000,00')
  await dialog.getByRole('button', { name: 'Criar ativo' }).click()
  await expect(page.getByText('Ativo "FII Teste" criado')).toBeVisible()

  await page.getByRole('button', { name: 'Atualizar valor' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Novo valor de mercado' }).fill('2.150,00')
  await dialog.getByRole('button', { name: 'Registrar valor' }).click()
  await expect(page.getByText('Valor atualizado')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('R$ 2.150,00').first()).toBeVisible()
})

test('12. busca global (Ctrl+K) encontra e navega', async () => {
  await page.keyboard.press('Control+k')
  const search = page.getByRole('dialog', { name: 'Busca global' })
  await expect(search).toBeVisible()
  await search.getByRole('textbox', { name: 'Buscar em tudo' }).fill('Notebook')
  await expect(search.getByText('Compra parcelada · R$ 100,00/mês')).toBeVisible()
  await page.keyboard.press('Enter')
  // navegou para Parcelas
  await expect(page.getByRole('heading', { level: 1, name: 'Parcelas' })).toBeVisible()
})

test('13. caixinhas: seed presente + nova caixinha manual com progresso', async () => {
  await goTo('Caixinhas')
  await expect(page.getByText('Reserva de emergência')).toBeVisible()

  await page.getByRole('button', { name: 'Nova caixinha' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Ex.: Reserva de emergência').fill('Viagem')
  await dialog.getByRole('textbox', { name: 'Valor alvo da caixinha' }).fill('1.000,00')
  await dialog.getByRole('textbox', { name: 'Valor guardado' }).fill('250')
  await dialog.getByRole('button', { name: 'Criar caixinha' }).click()

  await expect(page.getByText('Viagem', { exact: true })).toBeVisible()
  await expect(page.getByText('25%')).toBeVisible()
})

test('14. linha do tempo: painel dos anos com seletor de período (R10 §⑥)', async () => {
  await goTo('Linha do tempo')

  // faixa de estatísticas + balão narrativo
  // `exact`: os mesmos termos aparecem no balão narrativo, em frase
  await expect(page.getByText('Guardado no período', { exact: true })).toBeVisible()
  await expect(page.getByText('Taxa de poupança', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Meses no azul', { exact: true })).toBeVisible()
  await expect(page.getByText('Maior gasto', { exact: true })).toBeVisible()
  await expect(page.getByText('A história do período')).toBeVisible()

  // gráfico principal em ÁREA CONTÍNUA (uma linha só, não barras soltas)
  await expect(page.getByRole('img', { name: 'Sobra mês a mês' }).first()).toBeVisible()
  await expect(page.getByText('Patrimônio acumulado')).toBeVisible()
  await expect(page.getByText('meta 30%')).toBeVisible()
  await expect(page.getByText('Recordes do período')).toBeVisible()
  await expect(page.getByText('Melhor mês de sobra')).toBeVisible()
  await expect(page.getByText('Pior mês de sobra')).toBeVisible()

  // o seletor de período troca a janela, e o subtítulo diz quantos meses são
  await expect(page.getByText(/· 12 meses/)).toBeVisible()
  await page.getByRole('tab', { name: '6m', exact: true }).click()
  await expect(page.getByText(/· 6 meses/)).toBeVisible()
  // com a janela "tudo" não existe período anterior para comparar
  await page.getByRole('tab', { name: 'tudo', exact: true }).click()
  await expect(page.getByText('sem período anterior para comparar')).toBeVisible()
  await page.getByRole('tab', { name: '12m', exact: true }).click()
  await expect(page.getByText(/· 12 meses/)).toBeVisible()
})

test('15. visão geral consolidada + navegação de mês + balões', async () => {
  await goTo('Visão geral')
  await expect(page.getByText('Para onde foi o dinheiro')).toBeVisible()
  await expect(page.getByText(/recebidos e/)).toBeVisible() // balão narrando o mês
  await page.getByRole('button', { name: 'Mês anterior' }).click()
  await expect(page.getByText('Sem gastos neste mês').first()).toBeVisible()
  await page.getByRole('button', { name: 'Próximo mês' }).click()
  await expect(page.getByText(/supérfluos|Necessário|R\$/).first()).toBeVisible()

  // balão de Bancos & Cartões
  await goTo('Bancos & Cartões')
  await expect(page.getByText('Resumo de crédito e contas')).toBeVisible()
})

test('16. modo privacidade MASCARA os valores — nada real no DOM (M2 §a)', async () => {
  await goTo('Visão geral') // página cheia de valores (hero, cards, gráficos)
  await page.getByRole('button', { name: 'Ocultar valores (modo privacidade)' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-privacy', 'on')

  // a máscara aparece…
  await expect(page.getByText('R$ ••••••').first()).toBeVisible()
  // …e NENHUM valor real (R$ seguido de dígito) sobra no HTML — nem em texto,
  // nem em aria-label/title. É a diferença de um blur (que deixa o número no DOM).
  const html = await page.content()
  expect(html).not.toMatch(/R\$\s*\d/)

  await page.getByRole('button', { name: 'Mostrar valores' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-privacy', 'off')
  await expect(page.getByText(/R\$\s*\d/).first()).toBeVisible() // valores voltam
})

test('17. paleta de comandos: ação rápida abre o formulário da seção', async () => {
  await page.keyboard.press('Control+k')
  const search = page.getByRole('dialog', { name: 'Busca global' })
  await expect(search.getByText('Novo gasto')).toBeVisible() // ações no estado vazio
  await search.getByRole('textbox', { name: 'Buscar em tudo' }).fill('nova caixinha')
  await page.keyboard.press('Enter')
  // navegou para Caixinhas e abriu o dialog
  await expect(page.getByRole('dialog', { name: 'Nova caixinha' })).toBeVisible()
  await page.keyboard.press('Escape')
})

test('18. overlay ? lista os atalhos de teclado', async () => {
  await page.keyboard.press('?')
  const overlay = page.getByRole('dialog', { name: 'Atalhos de teclado' })
  await expect(overlay).toBeVisible()
  await expect(overlay.getByText('Busca global e paleta de comandos')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(overlay).not.toBeVisible()
})

test('19. logos dos bancos detectados (incluindo os dois BTGs)', async () => {
  await goTo('Bancos & Cartões')
  await expect(page.locator('img[alt="Logo Nubank"]').first()).toBeVisible()
  await expect(page.locator('img[alt="Logo BTG Investimentos"]').first()).toBeVisible()
  await expect(page.locator('img[alt="Logo BTG Banking"]').first()).toBeVisible()
})

/** R3 §3.4 — gasto com origem alimenta as análises do banco. */
test('19b. gasto com "Pago com" entra nas análises do banco de origem', async () => {
  await goTo('Gastos')
  await page.getByRole('button', { name: 'Novo gasto' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Categoria').selectOption({ label: 'Mercado' })
  await dialog.getByPlaceholder('Ex.: Compras da semana').fill('Compra no cartão')
  await dialog.getByRole('textbox', { name: 'Valor do gasto' }).fill('250')
  // "Ultravioleta" foi criado no teste 8, no primeiro banco (Nubank).
  // "Pago com" agora é um BankPicker (§5): escolhe-se clicando a opção.
  await dialog.getByRole('radio', { name: /Ultravioleta/ }).click()
  await dialog.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByText('Gasto registrado')).toBeVisible()

  // filtro por origem isola o gasto (§5)
  await page.getByLabel('Filtrar por origem').selectOption({ label: 'Ultravioleta' })
  await expect(page.locator('li', { hasText: 'Compra no cartão' })).toBeVisible()
  await expect(page.locator('li', { hasText: 'Cinema' })).toHaveCount(0)
  await page.getByLabel('Filtrar por origem').selectOption({ label: 'Sem origem' })
  await expect(page.locator('li', { hasText: 'Compra no cartão' })).toHaveCount(0)
  await page.getByLabel('Filtrar por origem').selectOption({ label: 'Todas as origens' })
})

/** R3 §3.3 — drill-down do banco. */
test('19c. drill-down do banco: navegar, cards, gráficos, saldo editável e voltar', async () => {
  await goTo('Bancos & Cartões')
  await page.getByRole('button', { name: 'Abrir Nubank' }).click()

  // cabeçalho e os 4 cards do banco
  await expect(page.getByRole('heading', { level: 1, name: 'Nubank' })).toBeVisible()
  await expect(page.getByText('Investido aqui')).toBeVisible()
  await expect(page.getByText('Limite disponível')).toBeVisible()
  await expect(page.getByText('Resumo de Nubank')).toBeVisible() // balão do banco

  // o gasto pago com o cartão do Nubank aparece na análise do banco (§3.4)
  await expect(page.getByText('Gastos de julho de 2026 por aqui').locator('..')).toContainText('R$ 250,00')

  // gráficos do banco
  await expect(page.getByText('Uso de limite por cartão')).toBeVisible()
  await expect(page.locator('svg[aria-label="Gráfico de barras"]').first()).toBeVisible()

  // saldo editável ali mesmo
  await page.getByRole('button', { name: 'Editar saldo em conta' }).click()
  const field = page.getByRole('textbox', { name: 'Saldo em conta' })
  await field.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('1500', { delay: 30 })
  await page.getByRole('button', { name: 'OK' }).click()
  await expect(page.getByText('R$ 1.500,00').first()).toBeVisible()

  // voltar retorna à lista
  await page.getByRole('button', { name: 'Voltar para Bancos & Cartões' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Bancos & Cartões' })).toBeVisible()
})

/**
 * R3 §1 — regressão do bug do salário. `fill()` injeta o valor de uma vez e por isso
 * nunca pegou o bug: ele só aparece com digitação tecla a tecla, quando cada onChange
 * re-renderiza o pai. Estes testes digitam de verdade, nos 3 formatos, em 3 campos
 * diferentes, e conferem o valor PERSISTIDO.
 */
test('20. campos monetários aceitam digitação natural (2000 · 1.234,56 · 1234.56)', async () => {
  // (a) salário — o campo do bug: rascunho mora no pai, então cada tecla re-renderiza o Modal
  await goTo('Ganhos')
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  let dialog = page.getByRole('dialog')
  const salary = dialog.getByRole('textbox', { name: 'Salário mensal' })
  await salary.click()
  await page.keyboard.press('Control+a') // o modal vem preenchido: seleciona antes de digitar
  await page.keyboard.type('2000', { delay: 40 })
  await expect(salary).toHaveValue('2000') // não trava no 1º dígito
  await expect(salary).toBeFocused() // o foco não foi roubado pelo "Fechar"
  await dialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('R$ 2.000,00').first()).toBeVisible()

  // (b) valor de gasto em formato BR
  await goTo('Gastos')
  await page.getByRole('button', { name: 'Novo gasto' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Categoria').selectOption({ label: 'Mercado' })
  await dialog.getByPlaceholder('Ex.: Compras da semana').fill('Digitação BR')
  const expense = dialog.getByRole('textbox', { name: 'Valor do gasto' })
  await expense.click()
  await page.keyboard.type('1.234,56', { delay: 40 })
  await expect(expense).toHaveValue('1.234,56')
  await dialog.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.locator('li', { hasText: 'Digitação BR' })).toContainText('1.234,56')

  // (c) valor alvo de caixinha em formato US
  await goTo('Caixinhas')
  await page.getByRole('button', { name: 'Nova caixinha' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Ex.: Reserva de emergência').fill('Digitação US')
  const target = dialog.getByRole('textbox', { name: 'Valor alvo da caixinha' })
  await target.click()
  await page.keyboard.type('1234.56', { delay: 40 })
  await expect(target).toHaveValue('1234.56')
  await dialog.getByRole('button', { name: 'Criar caixinha' }).click()
  // "1234.56" (US) persistiu como 123456 centavos e é exibido em pt-BR
  await expect(page.getByText('Digitação US', { exact: true })).toBeVisible()
  await expect(page.getByText('/ R$ 1.234,56')).toBeVisible()
})

/**
 * M2 §b — PIN. A primeira execução já foi exercitada no beforeAll (o app só
 * revelou a sidebar após definir o PIN). Aqui: alterar o PIN pelo perfil, com o
 * PIN atual errado sendo recusado (verifyPin + feedback), depois o caminho certo.
 */
test('21. segurança: alterar PIN recusa o atual errado e aceita o certo', async () => {
  await page.getByText('Olá, Alex').click()
  await page.getByRole('button', { name: 'Alterar PIN' }).click()
  const dialog = page.getByRole('dialog', { name: 'Alterar PIN' })
  await expect(dialog).toBeVisible()

  // PIN atual ERRADO → recusado, sem avançar
  await dialog.getByRole('button', { name: '0', exact: true }).click()
  await dialog.getByRole('button', { name: '0', exact: true }).click()
  await dialog.getByRole('button', { name: '0', exact: true }).click()
  await dialog.getByRole('button', { name: '0', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirmar PIN' }).click()
  await expect(dialog.getByText('PIN atual incorreto.')).toBeVisible()

  // PIN atual CERTO (1234) → novo (5678) → confirma
  const digits = async (pin: string): Promise<void> => {
    for (const d of pin) await dialog.getByRole('button', { name: d, exact: true }).click()
    await dialog.getByRole('button', { name: 'Confirmar PIN' }).click()
  }
  await digits('1234') // atual
  await digits('5678') // novo
  await digits('5678') // confirma
  await expect(page.getByText('PIN alterado')).toBeVisible()
  await page.keyboard.press('Escape') // fecha o menu de perfil
})

/**
 * R4 §1 — ledger híbrido. Este é o caso de aceite da release: o salário entra na
 * conta, o gasto pago pela conta sai dela, e o histórico fecha o saldo.
 * Estado herdado: salário = R$ 2.000 (teste 20) e Nubank conciliado em
 * R$ 1.500 (teste 19c).
 */
test('22. ledger: salário credita, gasto debita, transferência e ajuste fecham a conta', async () => {
  // (a) vincular a conta de recebimento — o dia 5 de julho já passou, então o
  //     crédito acontece na hora, sem esperar o próximo boot
  await goTo('Ganhos')
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Conta de recebimento do salário').selectOption({ label: 'Nubank' })
  await dialog.getByLabel('Dia do pagamento').fill('5')
  await dialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('passa a cair em Nubank todo dia 5')).toBeVisible()
  await expect(page.getByText('cai em Nubank todo dia 5')).toBeVisible()

  // (b) "Em conta" reflete o salário: 1.500 (ajuste) + 2.000 (salário)
  await goTo('Bancos & Cartões')
  await expect(page.getByRole('button', { name: /editar saldo do nubank/i })).toContainText('R$ 3.500,00')

  // (c) gasto pago PELA CONTA debita o saldo
  await goTo('Gastos')
  await page.getByRole('button', { name: 'Novo gasto' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Categoria').selectOption({ label: 'Mercado' })
  await dialog.getByPlaceholder('Ex.: Compras da semana').fill('Feira paga pela conta')
  // "Pago com" agora é BankPicker (§5) — a conta é escolhida clicando a opção.
  await dialog.getByRole('textbox', { name: 'Valor do gasto' }).fill('100')
  await dialog.getByRole('radio', { name: /Nubank saldo/ }).click()
  await dialog.getByRole('button', { name: 'Adicionar' }).click()
  await goTo('Bancos & Cartões')
  await expect(page.getByRole('button', { name: /editar saldo do nubank/i })).toContainText('R$ 3.400,00')

  // (d) transferência move dinheiro entre as duas contas, sem criar nem sumir
  await page.getByRole('button', { name: 'Transferir' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Conta de origem').selectOption({ label: 'Nubank' })
  await dialog.getByLabel('Conta de destino').selectOption({ label: 'Itaú' })
  await dialog.getByRole('textbox', { name: 'Valor da transferência' }).fill('400')
  await dialog.getByRole('button', { name: 'Transferir' }).click()
  await expect(page.getByText('Transferência registrada')).toBeVisible()
  await expect(page.getByRole('button', { name: /editar saldo do nubank/i })).toContainText('R$ 3.000,00')
  await expect(page.getByRole('button', { name: /editar saldo do itaú/i })).toContainText('R$ 400,00')

  // (e) o histórico da conta mostra cada movimento e FECHA no saldo
  await page.getByRole('button', { name: 'Abrir Nubank' }).click()
  const history = page.getByRole('list', { name: 'Movimentos da conta' })
  await expect(history).toContainText('Salário')
  await expect(history).toContainText('Feira paga pela conta')
  await expect(history).toContainText('Transferência para Itaú')
  await expect(history).toContainText('Ajuste de conciliação')
  await expect(history).toContainText('Saldo inicial')
  await expect(page.getByText('Saldo atual da conta').locator('..')).toContainText('R$ 3.000,00')
  // o gasto no cartão (teste 19b) NÃO debita a conta: ele vive na fatura
  await expect(history).not.toContainText('Compra no cartão')

  // (f) desfazer o crédito de salário tira exatamente os R$ 2.000
  await page.getByRole('button', { name: /^Desfazer crédito de salário/ }).click()
  await expect(page.getByText('Crédito desfeito')).toBeVisible()
  await expect(page.getByText('Saldo atual da conta').locator('..')).toContainText('R$ 1.000,00')
  await page.getByRole('button', { name: 'Voltar para Bancos & Cartões' }).click()
})

/**
 * §4 — Guardar/Resgatar com BankPicker. Roda DEPOIS do teste 22 (Nubank já tem
 * saldo do ledger) e é de EFEITO LÍQUIDO ZERO no saldo: guarda e resgata o mesmo
 * valor, para não bagunçar as asserções de saldo dos testes seguintes.
 */
test('22b. caixinhas: Guardar/Resgatar com BankPicker, conta zerada bloqueada (§4)', async () => {
  await goTo('Caixinhas')
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Valor a guardar' }).fill('120')
  // Conta zerada aparece desabilitada ("sem saldo") — não se cede o que não se tem.
  await expect(dialog.getByRole('radio', { name: /Bradesco/ })).toBeDisabled()
  await dialog.getByRole('radio', { name: /Nubank saldo/ }).click()
  await dialog.getByRole('button', { name: /^Guardar R\$/ }).click()
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible()

  // Resgatar o mesmo valor de volta ao Nubank (efeito líquido zero).
  await page.getByRole('button', { name: 'Resgatar', exact: true }).first().click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Valor a resgatar' }).fill('120')
  await dialog.getByRole('radio', { name: /Nubank saldo/ }).click()
  await dialog.getByRole('button', { name: /^Resgatar R\$/ }).click()
  await expect(page.getByText('Resgatado', { exact: true })).toBeVisible()
})

/**
 * Adendo R10 — SUFICIÊNCIA DE SALDO. Os três estados que o Allan pediu para
 * conferir com os próprios olhos: bloqueado (Família A), avisado-e-confirmado
 * (Família B) e negativo exibido em coral. Usa o Santander (intocado pelos
 * outros testes), conciliado a R$ 10,00.
 */
test('22c. suficiência de saldo: Família A bloqueia, Família B avisa, negativo em coral', async () => {
  // Concilia o Santander a exatamente R$ 10,00 (parte de 0 no seed).
  await goTo('Bancos & Cartões')
  await page.getByRole('button', { name: 'Abrir Santander' }).click()
  await page.getByRole('button', { name: 'Editar saldo em conta' }).click()
  const field = page.getByRole('textbox', { name: 'Saldo em conta' })
  await field.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('10', { delay: 30 })
  await page.getByRole('button', { name: 'OK' }).click()
  await expect(page.getByText('R$ 10,00').first()).toBeVisible()
  await page.getByRole('button', { name: 'Voltar para Bancos & Cartões' }).click()

  // FAMÍLIA A — Guardar R$ 11,00 pelo Santander é BLOQUEADO (só tem R$ 10,00).
  await goTo('Caixinhas')
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Valor a guardar' }).fill('11')
  const santander = dialog.getByRole('radio', { name: /Santander/ })
  await expect(santander).toBeDisabled() // insuficiente para o valor digitado
  await expect(dialog.getByText('disponível R$ 10,00')).toBeVisible() // o motivo à mostra

  // R$ 10,00 (= saldo) é ACEITO — zera a conta, não é erro.
  await dialog.getByRole('textbox', { name: 'Valor a guardar' }).fill('10')
  await expect(santander).toBeEnabled()
  await santander.click()
  await dialog.getByRole('button', { name: /^Guardar R\$/ }).click()
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible()

  // FAMÍLIA B — gasto de R$ 5,00 pela conta zerada: AVISA, não bloqueia.
  await goTo('Gastos')
  await page.getByRole('button', { name: 'Novo gasto' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Categoria').selectOption({ label: 'Mercado' })
  await dialog.getByPlaceholder('Ex.: Compras da semana').fill('Gasto no vermelho')
  await dialog.getByRole('textbox', { name: 'Valor do gasto' }).fill('5')
  await dialog.getByRole('radio', { name: /Santander/ }).click()
  // o aviso aparece com o saldo projetado, e o botão vira "Lançar mesmo assim"
  await expect(dialog.getByText(/deixa o.*Santander.*em/)).toBeVisible()
  await expect(dialog.getByText('-R$ 5,00').first()).toBeVisible()
  await dialog.getByRole('button', { name: 'Lançar mesmo assim' }).click()
  await expect(page.getByText('Gasto registrado')).toBeVisible()

  // NEGATIVO EXIBIDO — o Santander aparece em −R$ 5,00 (coral) nos Bancos.
  await goTo('Bancos & Cartões')
  await expect(page.getByText('-R$ 5,00').first()).toBeVisible()
})

/**
 * R4 §2 — taxas. O app roda o E2E inteiro com `ZENT_OFFLINE=1`: nenhuma
 * requisição sai daqui. Este teste prova que, sem rede, o app abre, funciona e
 * mantém as taxas que já tinha — o caminho de falha é um caminho testado.
 */
test('23. sem rede: app funciona, taxas antigas seguem valendo e o manual vira override', async () => {
  await page.getByText('Olá, Alex').click()
  const menu = page.getByRole('dialog', { name: 'Menu de perfil' })
  await expect(menu.getByText('Taxas de referência')).toBeVisible()
  // as taxas do seed continuam de pé, com a data delas
  await expect(menu.getByRole('textbox', { name: 'Selic a.a.' })).toHaveValue('14,25')
  await expect(menu.getByText('atualizadas em 16/07/2026')).toBeVisible()
  await expect(menu.getByText('Ainda não foi possível consultar as fontes oficiais.')).toBeVisible()
  await expect(menu.getByRole('switch', { name: 'Atualização automática de taxas' })).toBeVisible()

  // "Atualizar agora" sem rede avisa e preserva os valores — sem quebrar nada
  await menu.getByRole('button', { name: 'Atualizar agora' }).click()
  await expect(page.getByText('Não deu para consultar agora')).toBeVisible()
  await expect(menu.getByRole('textbox', { name: 'Selic a.a.' })).toHaveValue('14,25')

  // editar à mão vira override: o automático não mexe mais nessa taxa
  await menu.getByRole('textbox', { name: 'Selic a.a.' }).fill('15')
  await menu.getByRole('button', { name: 'Salvar taxas' }).click()
  await expect(page.getByText(/Selic ficou sob edição manual/)).toBeVisible()
  await expect(menu.getByText(/Selic sob edição manual/)).toBeVisible()

  // e dá para devolvê-la ao automático
  await menu.getByRole('button', { name: 'Voltar ao automático' }).click()
  await expect(menu.getByText(/sob edição manual/)).toHaveCount(0)

  // a frase de privacidade não promete mais "100% offline"
  await expect(menu.getByText(/a única conexão é a consulta opcional das taxas oficiais/)).toBeVisible()
  await page.keyboard.press('Escape')
})

test('23b. persistência: reabrir volta à última seção, ainda bloqueado (M3)', async () => {
  // Vou para uma seção distinta da inicial.
  await goTo('Caixinhas')
  await expect(page.locator('aside button[aria-current="page"]')).toContainText('Caixinhas')

  // Reinicia o app como um "fechar e reabrir": `page.reload()` reexecuta o
  // renderer (React remonta, o uiStore reidrata do localStorage) sem relançar um
  // 2º processo Electron sobre o mesmo perfil — o que esbarraria no lock do
  // LevelDB/pin. O `securityStore` NÃO é persistido, então o app renasce
  // BLOQUEADO (auto-bloqueio ao abrir), exatamente como num restart real.
  await page.reload()
  await page.getByRole('heading', { name: UNLOCK_GREETING }).waitFor({ timeout: 20_000 })
  await enterPin('5678') // o teste 21 já alterou o PIN de 1234 para 5678
  await page.waitForSelector('aside', { timeout: 20_000 })

  // A seção restaurada é Caixinhas (persistida), não o padrão "Visão geral".
  await expect(page.locator('aside button[aria-current="page"]')).toContainText('Caixinhas')
})

test('23c. gamificação: score no hero, detalhamento, desafio e estante (M4)', async () => {
  await goTo('Visão geral')
  // Card de saúde financeira presente (com salário e gastos, há score)
  await expect(page.getByText('Saúde financeira')).toBeVisible()
  await page.getByRole('button', { name: 'Ver detalhamento' }).click()
  const detail = page.getByRole('dialog', { name: /^Saúde financeira —/ })
  await expect(detail).toBeVisible()
  await expect(detail.getByText('Poupança')).toBeVisible()
  await expect(detail.getByText('Compromissos')).toBeVisible()
  await detail.getByRole('button', { name: 'Fechar' }).click()

  // Cria um desafio "gastar no máximo" e vê o widget refletir
  await page.getByRole('button', { name: 'Propor um desafio' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo desafio do mês' })
  await dialog.getByLabel('Categoria do desafio').selectOption({ index: 0 })
  await dialog.getByRole('textbox', { name: 'Limite do desafio' }).fill('300')
  await dialog.getByRole('button', { name: 'Criar desafio' }).click()
  await expect(page.getByText('Desafio criado')).toBeVisible()
  await expect(page.getByText(/Máx R\$\s+300,00 em/)).toBeVisible()

  // Estante de conquistas no perfil
  await page.getByText('Olá, Alex').click()
  await page.getByRole('button', { name: /^Conquistas/ }).click()
  const shelf = page.getByRole('dialog', { name: 'Conquistas' })
  await expect(shelf).toBeVisible()
  await expect(shelf.getByText(/desbloqueadas\.$/)).toBeVisible()
  await shelf.getByRole('button', { name: 'Fechar' }).click()
  await page.keyboard.press('Escape') // fecha o menu de perfil (não deixa o backdrop)
  await expect(page.getByRole('dialog', { name: 'Menu de perfil' })).toHaveCount(0)
})

test('23d. bandeja: lançamento rápido reflete no mês e no saldo da origem (M5)', async () => {
  // Estado do saldo do Nubank ANTES (a mini vai debitá-lo).
  await goTo('Bancos & Cartões')
  const nubankSaldo = page.getByRole('button', { name: /editar saldo do nubank/i })
  const antes = (await nubankSaldo.textContent())?.trim() ?? ''

  // Abre a mini-janela da bandeja (o atalho global/tray são OS-level; aqui uso
  // o mesmo caminho que eles disparam, via IPC).
  await page.evaluate(() => (globalThis as unknown as { zent: { showQuickEntry(): void } }).zent.showQuickEntry())
  const mini = await quickWindow()

  // App desbloqueado → a mini mostra o FORM direto.
  await mini.getByRole('textbox', { name: 'Valor do gasto rápido' }).fill('50')
  await mini.getByLabel('Categoria do gasto rápido').selectOption({ index: 0 })
  await mini.getByLabel('Origem do gasto rápido').selectOption({ label: 'Nubank' })
  await mini.getByRole('textbox', { name: 'Descrição do gasto rápido' }).fill('Lanche via bandeja')
  await mini.getByRole('button', { name: 'Lançar' }).click()
  await expect(mini.getByText('Gasto lançado')).toBeVisible()

  // Reflete no SALDO DA ORIGEM (Nubank debitado; número mudou) — na hora.
  await expect(nubankSaldo).not.toHaveText(antes)
  // Reflete no MÊS: o gasto aparece na lista de Gastos do mês corrente.
  await goTo('Gastos')
  await expect(page.getByText('Lanche via bandeja')).toBeVisible()
})

test('23e. bandeja: com PIN, a mini exige o PIN antes de exibir (não fura o bloqueio) (M5)', async () => {
  // Reinicia o app: renasce BLOQUEADO (como um restart). NÃO desbloqueio o app.
  await page.reload()
  await page.getByRole('heading', { name: UNLOCK_GREETING }).waitFor({ timeout: 20_000 })

  // Abre a mini com o app bloqueado: ela precisa pedir o PIN, não o form.
  await page.evaluate(() => (globalThis as unknown as { zent: { showQuickEntry(): void } }).zent.showQuickEntry())
  const mini = await quickWindow()
  await expect(mini.getByText('Digite seu PIN para lançar pela bandeja.')).toBeVisible()
  await expect(mini.getByRole('textbox', { name: 'Valor do gasto rápido' })).toHaveCount(0)

  // PIN correto na mini libera o form (e destrava o app inteiro).
  for (const d of '5678') await mini.getByRole('button', { name: d, exact: true }).click()
  await mini.getByRole('button', { name: 'Confirmar PIN' }).click()
  await expect(mini.getByRole('textbox', { name: 'Valor do gasto rápido' })).toBeVisible()
  await mini.evaluate(() => (globalThis as unknown as { zent: { closeQuick(): void } }).zent.closeQuick())
  // o app principal foi destravado pela prova de identidade
  await page.waitForSelector('aside', { timeout: 20_000 })
})

test('23f. bandeja + inatividade: trancar oculto exige PIN ao reabrir (M6)', async () => {
  // Liga um auto-bloqueio CURTO (0,05 min = 3s) via localStorage e reinicia: o
  // app renasce bloqueado; desbloqueio e o timer de inatividade começa a contar.
  await page.evaluate(() => {
    const raw = localStorage.getItem('zent-ui')
    const parsed = raw ? JSON.parse(raw) : { state: {}, version: 0 }
    parsed.state = { ...parsed.state, lockInactivityMinutes: 0.05 }
    localStorage.setItem('zent-ui', JSON.stringify(parsed))
  })
  await page.reload()
  await page.getByRole('heading', { name: UNLOCK_GREETING }).waitFor({ timeout: 20_000 })
  await enterPin('5678')
  await page.waitForSelector('aside', { timeout: 20_000 })

  // Esconde a janela na bandeja e NÃO interage: mesmo oculto (backgroundThrottling
  // desligado), o timer precisa disparar e trancar o app.
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.webContents.getURL().includes('#quick')) w.hide()
    }
  })
  await page.waitForTimeout(6000) // passa a inatividade (3s) com folga

  // A mini, aberta agora, DEVE exigir o PIN — o app trancou na bandeja.
  await page.evaluate(() => (globalThis as unknown as { zent: { showQuickEntry(): void } }).zent.showQuickEntry())
  const mini = await quickWindow()
  await expect(mini.getByText('Digite seu PIN para lançar pela bandeja.')).toBeVisible()

  // E ao reabrir a janela principal, ela está na tela de bloqueio.
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.webContents.getURL().includes('#quick')) w.show()
    }
  })
  await expect(page.getByRole('heading', { name: UNLOCK_GREETING })).toBeVisible()

  // Cleanup: desliga o auto-bloqueio, desbloqueia e fecha a mini.
  for (const d of '5678') await mini.getByRole('button', { name: d, exact: true }).click()
  await mini.getByRole('button', { name: 'Confirmar PIN' }).click()
  await mini.evaluate(() => (globalThis as unknown as { zent: { closeQuick(): void } }).zent.closeQuick())
  await page.waitForSelector('aside', { timeout: 20_000 })
  await page.getByText('Olá, Alex').click()
  await page.getByLabel('Bloquear por inatividade').selectOption('off')
  await page.keyboard.press('Escape')
})

test('23g. menu borda viva: solto vira fio, espiar revela, Ctrl+B trava (R10 §4)', async () => {
  const aside = page.locator('aside')
  // Pelo TEXTO, e não pelo nome acessível: é o mesmo seletor que o `goTo` da
  // suíte usa, e não depende de o item ter (ou não) um contador ao lado.
  const item = page.locator('aside >> text="Gastos"')

  // Solta o menu: o <aside> vira o fio de 3px e o painel sai da viewport.
  await page.getByRole('button', { name: 'Recolher menu' }).click()
  await page.waitForTimeout(400)
  expect((await aside.boundingBox())?.width ?? 99).toBeLessThan(10)
  const hidden = await item.boundingBox()
  expect(hidden === null || hidden.x + hidden.width < 0).toBe(true)

  // Espiar: encostar na zona quente da borda desliza o painel para dentro.
  await page.mouse.move(2, 400)
  await page.waitForTimeout(450)
  const peeked = await item.boundingBox()
  expect(peeked?.x ?? -1).toBeGreaterThanOrEqual(0)
  // …e o <aside> continua com 3px: o painel FLUTUA, não empurra o conteúdo.
  expect((await aside.boundingBox())?.width ?? 99).toBeLessThan(10)

  // Navegar pelo painel espiado funciona.
  await item.click()
  await page.waitForTimeout(300)
  await expect(page.locator('aside button[aria-current="page"]')).toContainText('Gastos')

  // Afastar o cursor recolhe de volta.
  await page.mouse.move(700, 400)
  await page.waitForTimeout(450)
  const retracted = await item.boundingBox()
  expect(retracted === null || retracted.x + retracted.width < 0).toBe(true)

  // Ctrl+B trava aberto: aí sim o <aside> volta a medir a largura do painel.
  await page.keyboard.press('Control+b')
  await page.waitForTimeout(450)
  expect((await aside.boundingBox())?.width ?? 0).toBeGreaterThan(200)
})

test('23h. ilha de ações: age no app e some com diálogo por cima (R10 §5)', async () => {
  const island = page.getByRole('group', { name: 'Ações rápidas' })

  // Rola até o fim antes de medir: a ilha se ESCONDE quando há conteúdo atrás
  // dela (§5), e o rodapé da página é onde ela tem folga garantida. Medir a
  // opacidade de repouso no meio de uma lista mediria o outro estado.
  await page.evaluate(() => {
    const g = globalThis as unknown as { document: { querySelector(s: string): { scrollTop: number; scrollHeight: number } | null } }
    const m = g.document.querySelector('main')
    if (m) m.scrollTop = m.scrollHeight
  })
  await page.waitForTimeout(500)

  // As três ações saíram do menu e vivem na ilha, no canto inferior direito.
  const box = await island.boundingBox()
  const size = page.viewportSize() ?? { width: 1280, height: 800 }
  expect(box).not.toBeNull()
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(size.height * 0.8)
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeGreaterThan(size.width * 0.8)

  // Em repouso ela é discreta (42%) — nem invisível, nem opaca.
  const rest = await islandOpacity()
  expect(rest).toBeGreaterThan(0.3)
  expect(rest).toBeLessThan(0.6)

  // A privacidade continua funcionando a partir da ilha.
  await page.getByRole('button', { name: 'Ocultar valores (modo privacidade)' }).click()
  await expect(page.getByText('R$ ••••••').first()).toBeVisible()
  await page.getByRole('button', { name: 'Mostrar valores' }).click()

  // Com um diálogo aberto ela desaparece — não fica na frente de nada.
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(350)
  expect(await islandOpacity()).toBe(0)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(350)
  expect(await islandOpacity()).toBeGreaterThan(0.3)
})

test('23i. calendário próprio: digitação direta, popover, atalhos e teclado (R10 §8)', async () => {
  await goTo('Gastos')
  await page.getByRole('button', { name: 'Novo gasto' }).click()
  const dialog = page.getByRole('dialog')
  const field = dialog.getByRole('textbox', { name: 'Data do gasto' })

  // 1. DIGITAÇÃO DIRETA — o campo nasce em dd/mm/aaaa e aceita só os dígitos,
  //    sem obrigar ninguém a abrir o calendário para escolher uma data.
  await expect(field).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/)
  await field.fill('')
  await field.pressSequentially('05072026')
  await expect(field).toHaveValue('05/07/2026')

  // 2. Data impossível não é aceita: ao sair do campo, volta ao último válido.
  await field.fill('')
  await field.pressSequentially('31022026')
  await expect(field).toHaveValue('31/02/2026')
  await dialog.getByPlaceholder('Ex.: Compras da semana').click()
  await expect(field).toHaveValue('05/07/2026')

  // 3. O POPOVER abre, mostra o mês e navega.
  await dialog.getByRole('button', { name: 'Abrir calendário' }).click()
  const popover = page.getByRole('dialog', { name: 'Escolher data' })
  await expect(popover).toBeVisible()
  await expect(popover.getByText('julho', { exact: false })).toBeVisible()
  await popover.getByRole('button', { name: 'Mês anterior' }).click()
  await expect(popover.getByText('junho', { exact: false })).toBeVisible()
  await popover.getByRole('button', { name: 'Próximo mês' }).click()

  // 4. ATALHO "hoje" preenche o campo e fecha o popover.
  await popover.getByRole('button', { name: 'hoje', exact: true }).click()
  await expect(popover).toBeHidden()
  const hoje = await page.evaluate(() => {
    const d = new Date()
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
  })
  await expect(field).toHaveValue(hoje)

  // 5. TECLADO: setas movem o cursor na grade e Enter escolhe o dia.
  await dialog.getByRole('button', { name: 'Abrir calendário' }).click()
  await expect(popover).toBeVisible()
  await page.keyboard.press('ArrowLeft') // ontem
  await page.keyboard.press('Enter')
  await expect(popover).toBeHidden()
  const ontem = await page.evaluate(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
  })
  await expect(field).toHaveValue(ontem)

  // 6. Esc fecha o calendário SEM fechar o formulário por baixo.
  await dialog.getByRole('button', { name: 'Abrir calendário' }).click()
  await expect(popover).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

/**
 * R10 §⑦ — a tela de desbloqueio: saudação pelo nome, linha viva com dado real,
 * cursor de terminal piscando e a variante SEM número sob privacidade.
 * (O fluxo de definir→confirmar→nomear→entrar já foi exercitado no beforeAll, em
 * userData limpo; aqui é a volta: fechar → reabrir → saudação.)
 */
test('23j. desbloqueio: saudação pelo nome, linha viva e privacidade (R10 §⑦)', async () => {
  // 1) Sem privacidade: reabre → saudação com o nome + linha viva + cursor.
  await goTo('Visão geral')
  await page.reload()
  await page.getByRole('heading', { name: UNLOCK_GREETING }).waitFor({ timeout: 20_000 })
  // linha viva presente (frase rotativa) e o cursor de terminal piscando
  await expect(page.getByTestId('lock-insight')).toBeVisible()
  await expect(page.locator('.anim-caret').first()).toBeVisible()
  await enterPin('5678')
  await page.waitForSelector('aside', { timeout: 20_000 })

  // 2) Com privacidade ligada, reabre → a linha viva NÃO leva nenhum R$ <dígito>
  //    à tela (a mesma garantia da máscara do M2, aqui no primeiro contato).
  await page.getByRole('button', { name: 'Ocultar valores (modo privacidade)' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-privacy', 'on')
  await page.reload()
  await page.getByRole('heading', { name: UNLOCK_GREETING }).waitFor({ timeout: 20_000 })
  await expect(page.getByTestId('lock-insight')).toBeVisible()
  const lockHtml = await page.content()
  expect(lockHtml).not.toMatch(/R\$\s*\d/)
  await enterPin('5678')
  await page.waitForSelector('aside', { timeout: 20_000 })

  // desliga a privacidade para não vazar estado para os testes seguintes
  await page.getByRole('button', { name: 'Mostrar valores' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-privacy', 'off')
})

test('24. zero erros de console/runtime em toda a sessão', () => {
  expect(consoleErrors, `Erros de console:\n${consoleErrors.join('\n')}`).toHaveLength(0)
})
