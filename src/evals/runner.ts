import { generateFlow } from '../ai/generate'
import type { Provider } from '../ai/types'
import { isTrigger } from '../domain/catalog'
import { normalizeText } from '../domain/engine'
import { nextOf } from '../domain/graph'
import type { Flow, NodeType, Port } from '../domain/types'
import { hasErrors } from '../domain/validate'
import { CASES, type EvalCase } from './cases'

export interface CheckResult {
  label: string
  why: string
  passed: boolean
  detail?: string
}

export interface CaseResult {
  case: EvalCase
  passed: boolean
  checks: CheckResult[]
  flow?: Flow
  error?: string
  ms: number
  tokens: number
}

/** Lê o fluxo como estrutura: o que vem antes da condição e cada caminho dela. */
export function shape(flow: Flow) {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]))
  const trigger = flow.nodes.find((n) => isTrigger(n.type))
  const walk = (start: string | undefined, stopAtCondition: boolean) => {
    const out: NodeType[] = []
    const seen = new Set<string>()
    let id = start
    while (id && !seen.has(id)) {
      seen.add(id)
      const n = byId.get(id)
      if (!n) break
      if (stopAtCondition && n.type === 'condicao') break
      out.push(n.type)
      if (n.type === 'condicao') break
      id = nextOf(flow, id, 'out')
    }
    return { types: out, last: id }
  }
  const before = walk(trigger ? nextOf(flow, trigger.id, 'out') : undefined, true)
  const cond = before.last ? byId.get(before.last) : undefined
  const branch = (port: Port) => (cond?.type === 'condicao' ? walk(nextOf(flow, cond.id, port), false).types : [])
  return { trigger, before: before.types, condition: cond?.type === 'condicao' ? cond : undefined, sim: branch('sim'), nao: branch('nao') }
}

const eq = (a: NodeType[], b: NodeType[]) => a.length === b.length && a.every((x, i) => x === b[i])
const fmt = (a: NodeType[]) => (a.length ? a.join(' → ') : '(nada)')

export async function runCase(c: EvalCase, provider: Provider, signal?: AbortSignal): Promise<CaseResult> {
  const t0 = performance.now()
  const g = await generateFlow(provider, c.description, signal)
  const ms = () => Math.round(performance.now() - t0)
  const tokens = g.usage ? g.usage.inputTokens + g.usage.outputTokens : 0
  if (!g.ok) {
    return {
      case: c,
      passed: false,
      checks: [{ label: 'Resposta passa na validação de formato', why: 'JSON inválido nunca chega ao canvas.', passed: false, detail: g.errors.join(' | ') }],
      error: g.errors.join(' | '),
      ms: ms(),
      tokens,
    }
  }
  const f = g.flow
  const s = shape(f)
  const checks: CheckResult[] = [
    { label: 'Resposta passa na validação de formato', why: 'JSON inválido nunca chega ao canvas.', passed: true },
    { label: 'Fluxo sem erros de validação', why: 'Um fluxo com erro não pode ser executado.', passed: !hasErrors(g.issues), detail: g.issues.filter((i) => i.severity === 'erro').map((i) => i.message).join(' | ') || undefined },
    { label: `Gatilho: ${c.expect.trigger}`, why: 'Gatilho errado dispara a automação na hora errada.', passed: s.trigger?.type === c.expect.trigger, detail: s.trigger?.type },
  ]
  if (c.expect.triggerConfig) {
    const ok = Object.entries(c.expect.triggerConfig).every(([k, v]) => String(s.trigger?.config[k]) === String(v))
    checks.push({ label: `Configuração do gatilho: ${Object.values(c.expect.triggerConfig).join(', ')}`, why: 'Horário e dias errados fazem o aviso chegar quando ninguém lê.', passed: ok, detail: JSON.stringify(s.trigger?.config) })
  }
  checks.push({ label: `Antes da regra: ${fmt(c.expect.before)}`, why: 'A ordem das etapas é o processo do negócio.', passed: eq(s.before, c.expect.before), detail: fmt(s.before) })
  if (c.expect.condition) {
    const k = s.condition?.config
    const exp = c.expect.condition
    const ok = !!k && k.campo === exp.campo && k.operador === exp.operador && normalizeText(String(k.valor)) === normalizeText(exp.valor)
    checks.push({ label: `Regra: ${exp.campo} ${exp.operador} ${exp.valor}`, why: 'A regra é o que decide quem recebe atenção especial.', passed: ok, detail: k ? `${k.campo} ${k.operador} ${k.valor}` : 'sem condição' })
    checks.push({ label: `Se sim: ${fmt(c.expect.sim ?? [])}`, why: 'É o caminho que o dono descreveu.', passed: eq(s.sim, c.expect.sim ?? []), detail: fmt(s.sim) })
    checks.push({ label: `Se não: ${fmt(c.expect.nao ?? [])}`, why: 'O caminho contrário precisa ser explícito, mesmo que seja "não fazer nada".', passed: eq(s.nao, c.expect.nao ?? []), detail: fmt(s.nao) })
  } else {
    checks.push({ label: 'Sem condição', why: 'A descrição não tem regra; inventar uma muda o processo.', passed: !s.condition && !f.nodes.some((n) => n.type === 'condicao') })
  }
  for (const x of c.extra ?? []) {
    let passed = false
    try {
      passed = x.test(f)
    } catch {
      passed = false
    }
    checks.push({ label: x.label, why: x.why, passed })
  }
  return { case: c, passed: checks.every((k) => k.passed), checks, flow: f, ms: ms(), tokens }
}

export async function runSuite(provider: Provider, onResult?: (r: CaseResult) => void, signal?: AbortSignal) {
  const out: CaseResult[] = []
  for (const c of CASES) {
    const r = await runCase(c, provider, signal)
    out.push(r)
    onResult?.(r)
  }
  return out
}
