import { CATALOG, NUMERIC_OPERATORS, OPERATOR_SYMBOL, formatMinutes, isTrigger, nodeTitle } from './catalog'
import { nextOf } from './graph'
import type { Flow, FlowNode, NodeType, Port } from './types'
import { hasErrors, validateFlow, type Issue } from './validate'

/**
 * Motor de execução. Percorre o fluxo a partir do gatilho, uma etapa por vez,
 * e devolve um registro de cada passo. Nada é enviado de verdade: mensagens,
 * tarefas e planilhas são simuladas, e esperas avançam um relógio virtual.
 * As etapas de IA chamam um `AiRuntime` injetado, então o motor não sabe qual modelo está por trás.
 */

export interface Classification {
  categoria: string
  confianca: number
  motivo: string
}

export interface AiRuntime {
  classify(text: string, categories: string[], signal?: AbortSignal): Promise<Classification>
  summarize(text: string, signal?: AbortSignal): Promise<string>
}

export type StepStatus = 'ok' | 'aviso' | 'erro' | 'ignorado'

export interface StepRecord {
  index: number
  nodeId: string
  type: NodeType
  title: string
  status: StepStatus
  /** Minutos simulados desde o disparo, já contando esperas anteriores. */
  clock: number
  message: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  branch?: 'sim' | 'nao'
  nextId?: string
  warnings: string[]
}

export type RunStatus = 'concluido' | 'erro' | 'bloqueado' | 'ignorado'

export interface RunSummary {
  status: RunStatus
  steps: StepRecord[]
  /** Dados disponíveis no fim: o evento mais os resultados guardados pelas etapas. */
  context: Record<string, unknown>
  simulatedMinutes: number
  issues: Issue[]
  message: string
}

export interface RunOptions {
  maxSteps?: number
  signal?: AbortSignal
}

/* ---------- utilitários de dados ---------- */

export function normalizeText(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function getPath(obj: unknown, path: string): unknown {
  const parts = path.trim().split('.').filter(Boolean)
  let cur: unknown = obj
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

/** Lê números escritos do jeito brasileiro: "R$ 1.234,50", "250", "199.9". */
export function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.replace(/r\$|\s/gi, '')
  if (!s) return null
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const display = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** Troca {{caminho}} pelos dados do contexto e informa quais caminhos não existiam. */
export function interpolate(template: string, ctx: unknown): { text: string; missing: string[] } {
  const missing: string[] = []
  const text = template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const v = getPath(ctx, path)
    if (v === undefined || v === null || v === '') {
      missing.push(path)
      return ''
    }
    return display(v)
  })
  return { text, missing }
}

export interface ConditionOutcome {
  result: boolean
  found: unknown
  error?: string
}

export function evaluateCondition(config: FlowNode['config'], ctx: unknown): ConditionOutcome {
  const field = String(config.campo ?? '').trim()
  const op = String(config.operador ?? '')
  const expected = String(config.valor ?? '')
  const found = getPath(ctx, field)

  if (op === 'existe') return { result: found !== undefined && found !== null && String(found).trim() !== '', found }
  if (found === undefined) return { result: false, found, error: `O campo "${field}" não existe no evento nem nos resultados anteriores.` }

  if (NUMERIC_OPERATORS.has(op)) {
    const a = parseNumber(found)
    const b = parseNumber(expected)
    if (a === null) return { result: false, found, error: `O campo "${field}" vale "${display(found)}", que não é número.` }
    if (b === null) return { result: false, found, error: `O valor de comparação "${expected}" não é número.` }
    const result = op === 'maior' ? a > b : op === 'maior_igual' ? a >= b : op === 'menor' ? a < b : a <= b
    return { result, found }
  }

  const values = Array.isArray(found) ? found.map(display) : [display(found)]
  const needle = normalizeText(expected)
  if (op === 'contem' || op === 'nao_contem') {
    const has = values.some((v) => normalizeText(v).includes(needle))
    return { result: op === 'contem' ? has : !has, found }
  }
  if (op === 'igual' || op === 'diferente') {
    const a = parseNumber(found)
    const b = parseNumber(expected)
    const eq = a !== null && b !== null ? a === b : values.some((v) => normalizeText(v) === needle)
    return { result: op === 'igual' ? eq : !eq, found }
  }
  return { result: false, found, error: `Regra "${op}" desconhecida.` }
}

/* ---------- gatilho ---------- */

function triggerMatches(trigger: FlowNode, event: Record<string, unknown>): { ok: boolean; reason: string } {
  if (trigger.type === 'gatilho.whatsapp') {
    const kw = String(trigger.config.palavraChave ?? '').trim()
    const text = String(getPath(event, 'mensagem.texto') ?? '')
    if (kw && !normalizeText(text).includes(normalizeText(kw))) return { ok: false, reason: `A mensagem não tem "${kw}", então o fluxo não dispara.` }
    return { ok: true, reason: kw ? `Mensagem com "${kw}" recebida.` : 'Mensagem recebida.' }
  }
  if (trigger.type === 'gatilho.pedido') {
    const canal = String(trigger.config.canal ?? 'qualquer')
    const got = String(getPath(event, 'pedido.canal') ?? '')
    if (canal !== 'qualquer' && got && normalizeText(got) !== canal) return { ok: false, reason: `O pedido veio do canal "${got}" e o gatilho só escuta "${canal}".` }
    return { ok: true, reason: 'Pedido recebido.' }
  }
  if (trigger.type === 'gatilho.horario') return { ok: true, reason: `Disparo programado das ${trigger.config.hora}.` }
  return { ok: true, reason: 'Agendamento recebido.' }
}

/* ---------- execução ---------- */

type Ctx = Record<string, unknown>

interface StepCore {
  status: StepStatus
  message: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  port?: Port
  branch?: 'sim' | 'nao'
  warnings?: string[]
  advance?: number
}

function fill(node: FlowNode, ctx: Ctx, key: string) {
  return interpolate(String(node.config[key] ?? ''), ctx)
}

async function runNode(node: FlowNode, ctx: Ctx, ai: AiRuntime, signal?: AbortSignal): Promise<StepCore> {
  const c = node.config
  switch (node.type) {
    case 'condicao': {
      const out = evaluateCondition(c, ctx)
      const rule = `${c.campo} ${OPERATOR_SYMBOL[String(c.operador)] ?? c.operador}${c.operador === 'existe' ? '' : ` ${c.valor}`}`
      if (out.error) return { status: 'erro', message: out.error, input: { regra: rule }, output: null }
      const branch = out.result ? 'sim' : 'nao'
      return {
        status: 'ok',
        message: `${rule}: ${out.result ? 'verdadeiro' : 'falso'} (valor encontrado: ${display(out.found) || 'vazio'}). Segue por "${out.result ? 'se sim' : 'se não'}".`,
        input: { regra: rule, valorEncontrado: out.found },
        output: { resultado: out.result },
        port: branch,
        branch,
      }
    }
    case 'acao.mensagem':
    case 'acao.notificar': {
      const toKey = node.type === 'acao.mensagem' ? 'para' : 'destinatario'
      const to = fill(node, ctx, toKey)
      const text = fill(node, ctx, 'texto')
      const warnings = [...to.missing, ...text.missing].map((p) => `{{${p}}} não existe nos dados e ficou em branco.`)
      if (!to.text.trim()) return { status: 'erro', message: `Não há para quem enviar: "${c[toKey]}" ficou vazio.`, input: { [toKey]: c[toKey] }, output: null, warnings }
      const canal = String(c.canal)
      const msg = node.type === 'acao.mensagem' ? `Mensagem enviada por ${canalName(canal)} para ${to.text}.` : `${to.text} avisado por ${canalName(canal)}.`
      return { status: warnings.length ? 'aviso' : 'ok', message: msg, input: { canal, [toKey]: c[toKey], texto: c.texto }, output: { canal, [toKey]: to.text, texto: text.text }, warnings }
    }
    case 'acao.tarefa': {
      const title = fill(node, ctx, 'titulo')
      const resp = fill(node, ctx, 'responsavel')
      const prazo = Number(c.prazoHoras) || 0
      const warnings = [...title.missing, ...resp.missing].map((p) => `{{${p}}} não existe nos dados e ficou em branco.`)
      return {
        status: warnings.length ? 'aviso' : 'ok',
        message: `Tarefa "${title.text}" criada para ${resp.text || 'a equipe'}${prazo ? `, prazo de ${prazo} h` : ''}.`,
        input: { titulo: c.titulo, responsavel: c.responsavel, prazoHoras: c.prazoHoras },
        output: { titulo: title.text, responsavel: resp.text || 'Equipe', prazoHoras: prazo },
        warnings,
      }
    }
    case 'acao.planilha': {
      const line = fill(node, ctx, 'linha')
      const cols = line.text.split(';').map((s) => s.trim())
      const warnings = line.missing.map((p) => `{{${p}}} não existe nos dados e ficou em branco.`)
      return { status: warnings.length ? 'aviso' : 'ok', message: `Linha com ${cols.length} colunas adicionada em "${c.planilha}".`, input: { planilha: c.planilha, linha: c.linha }, output: { planilha: c.planilha, colunas: cols }, warnings }
    }
    case 'ia.classificar': {
      const text = fill(node, ctx, 'texto')
      const cats = String(c.categorias).split(',').map((s) => s.trim()).filter(Boolean)
      if (!text.text.trim()) return { status: 'erro', message: `Não há texto para classificar: "${c.texto}" ficou vazio.`, input: { texto: c.texto }, output: null }
      const r = await ai.classify(text.text, cats, signal)
      // A regra fica no código: a IA só pode escolher uma categoria da lista.
      const match = cats.find((k) => normalizeText(k) === normalizeText(r.categoria))
      if (!match) return { status: 'erro', message: `A IA respondeu "${r.categoria}", que não está entre as categorias permitidas (${cats.join(', ')}).`, input: { texto: text.text, categorias: cats }, output: { ...r } }
      const result = { categoria: match, confianca: r.confianca, motivo: r.motivo }
      ctx[String(c.salvarEm)] = result
      return { status: 'ok', message: `Classificado como "${match}" (confiança ${Math.round(r.confianca * 100)}%).`, input: { texto: text.text, categorias: cats }, output: { [String(c.salvarEm)]: result } }
    }
    case 'ia.resumir': {
      const text = fill(node, ctx, 'texto')
      if (!text.text.trim()) return { status: 'erro', message: `Não há texto para resumir: "${c.texto}" ficou vazio.`, input: { texto: c.texto }, output: null }
      const resumo = await ai.summarize(text.text, signal)
      ctx[String(c.salvarEm)] = resumo
      return { status: 'ok', message: `Resumo com ${resumo.length} caracteres guardado em "${c.salvarEm}".`, input: { texto: text.text }, output: { [String(c.salvarEm)]: resumo } }
    }
    case 'controle.esperar': {
      const min = Number(c.minutos)
      return { status: 'ok', message: `Esperou ${formatMinutes(min)}. Na simulação o tempo é avançado na hora.`, input: { minutos: min }, output: { retomaDepoisDe: formatMinutes(min) }, advance: min }
    }
    case 'controle.fim':
      return { status: 'ok', message: 'Caminho encerrado de propósito.', input: {}, output: null }
    default:
      return { status: 'erro', message: `Etapa "${node.type}" não pode ser executada aqui.`, input: {}, output: null }
  }
}

const canalName = (c: string) => ({ whatsapp: 'WhatsApp', email: 'e-mail', sms: 'SMS' })[c] ?? c

/**
 * Executa o fluxo passo a passo. Cada `yield` entrega uma etapa concluída,
 * o que permite à interface avançar no ritmo do usuário. O valor de retorno
 * é o resumo final.
 */
export async function* executeFlow(flow: Flow, event: Record<string, unknown>, ai: AiRuntime, opts: RunOptions = {}): AsyncGenerator<StepRecord, RunSummary, void> {
  const issues = validateFlow(flow)
  const ctx: Ctx = structuredClone(event)
  const steps: StepRecord[] = []
  let clock = 0
  const done = (status: RunStatus, message: string): RunSummary => ({ status, steps, context: ctx, simulatedMinutes: clock, issues, message })

  if (hasErrors(issues)) return done('bloqueado', 'O fluxo tem problemas e não pode rodar. Veja a lista de problemas.')

  const byId = new Map(flow.nodes.map((n) => [n.id, n]))
  const trigger = flow.nodes.find((n) => isTrigger(n.type))!
  const maxSteps = opts.maxSteps ?? 50

  const match = triggerMatches(trigger, event)
  const first: StepRecord = {
    index: 0,
    nodeId: trigger.id,
    type: trigger.type,
    title: nodeTitle(trigger),
    status: match.ok ? 'ok' : 'ignorado',
    clock,
    message: match.reason,
    input: { evento: event },
    output: null,
    nextId: match.ok ? nextOf(flow, trigger.id, 'out') : undefined,
    warnings: [],
  }
  steps.push(first)
  yield first
  if (!match.ok) return done('ignorado', match.reason)

  let currentId = first.nextId
  while (currentId) {
    if (opts.signal?.aborted) return done('erro', 'Execução interrompida.')
    const node = byId.get(currentId)!
    if (steps.length >= maxSteps) {
      return done('erro', `Parou depois de ${maxSteps} etapas para evitar execução sem fim.`)
    }
    let core: StepCore
    try {
      core = await runNode(node, ctx, ai, opts.signal)
    } catch (e) {
      core = { status: 'erro', message: `Falha em "${nodeTitle(node)}": ${(e as Error).message}`, input: {}, output: null }
    }
    const port: Port = core.port ?? 'out'
    const nextId = core.status === 'erro' || !CATALOG[node.type].ports.length ? undefined : nextOf(flow, node.id, port)
    const rec: StepRecord = {
      index: steps.length,
      nodeId: node.id,
      type: node.type,
      title: nodeTitle(node),
      status: core.status,
      clock,
      message: core.message,
      input: core.input,
      output: core.output,
      branch: core.branch,
      nextId,
      warnings: core.warnings ?? [],
    }
    clock += core.advance ?? 0
    steps.push(rec)
    yield rec
    if (core.status === 'erro') return done('erro', core.message)
    currentId = nextId
  }
  const waited = clock ? ` Tempo simulado: ${formatMinutes(clock)}.` : ''
  return done('concluido', `Fluxo concluído em ${steps.length} etapas.${waited}`)
}

/** Atalho para testes e avaliações: roda até o fim e devolve o resumo. */
export async function runFlow(flow: Flow, event: Record<string, unknown>, ai: AiRuntime, opts?: RunOptions): Promise<RunSummary> {
  const it = executeFlow(flow, event, ai, opts)
  for (;;) {
    const r = await it.next()
    if (r.done) return r.value
  }
}
