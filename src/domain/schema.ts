import { CATALOG, isNodeType } from './catalog'
import { autoLayout } from './layout'
import type { ConfigValue, Flow, FlowDraft, FlowEdge, FlowNode, Port } from './types'

/**
 * Validação de formato para tudo que vem de fora: a resposta da IA e arquivos
 * importados. Se qualquer regra falha, o resultado é rejeitado inteiro, com a
 * lista de erros, e o canvas não é tocado. Os erros dizem onde está o problema
 * (`nodes[2].config.minutos`) para facilitar a depuração do prompt.
 */

export type SchemaResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

export const LIMITS = { nodes: 40, edges: 80, name: 80, text: 600 }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/
const PORTS: Port[] = ['out', 'sim', 'nao']

export function parseFlowDraft(raw: unknown): SchemaResult<FlowDraft> {
  const errors: string[] = []
  const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`)

  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return { ok: false, errors: ['A resposta não é um JSON válido.'] }
    }
  }
  if (!isObj(raw)) return { ok: false, errors: ['A resposta precisa ser um objeto JSON com name, nodes e edges.'] }

  const allowedRoot = new Set(['name', 'description', 'nodes', 'edges', 'version', 'id'])
  for (const k of Object.keys(raw)) if (!allowedRoot.has(k)) err(k, 'campo desconhecido na raiz')

  const name = raw.name
  if (typeof name !== 'string' || !name.trim()) err('name', 'obrigatório, texto não vazio')
  else if (name.length > LIMITS.name) err('name', `até ${LIMITS.name} caracteres`)
  if (raw.description !== undefined && typeof raw.description !== 'string') err('description', 'precisa ser texto')

  const nodesOut: FlowDraft['nodes'] = []
  const ids = new Set<string>()
  if (!Array.isArray(raw.nodes)) err('nodes', 'precisa ser uma lista')
  else if (raw.nodes.length === 0) err('nodes', 'a lista está vazia')
  else if (raw.nodes.length > LIMITS.nodes) err('nodes', `no máximo ${LIMITS.nodes} etapas`)
  else
    raw.nodes.forEach((n, i) => {
      const p = `nodes[${i}]`
      if (!isObj(n)) return err(p, 'precisa ser um objeto')
      for (const k of Object.keys(n)) if (!['id', 'type', 'config', 'label', 'position'].includes(k)) err(`${p}.${k}`, 'campo desconhecido')
      const id = n.id
      if (typeof id !== 'string' || !ID_RE.test(id)) err(`${p}.id`, 'obrigatório; letras, números, _ ou -, até 40 caracteres')
      else if (ids.has(id)) err(`${p}.id`, `"${id}" repetido`)
      else ids.add(id)
      if (!isNodeType(n.type)) return err(`${p}.type`, `tipo "${String(n.type)}" não existe. Tipos válidos: ${Object.keys(CATALOG).join(', ')}`)
      const spec = CATALOG[n.type]
      const config: Record<string, ConfigValue> = { ...spec.defaults }
      if (n.config !== undefined && !isObj(n.config)) err(`${p}.config`, 'precisa ser um objeto')
      else if (isObj(n.config))
        for (const [k, v] of Object.entries(n.config)) {
          const f = spec.fields.find((x) => x.key === k)
          const fp = `${p}.config.${k}`
          if (!f) {
            err(fp, `campo desconhecido para ${n.type}`)
            continue
          }
          if (v === null || v === undefined) continue
          if (typeof v !== 'string' && typeof v !== 'number') {
            err(fp, 'precisa ser texto ou número')
            continue
          }
          if (typeof v === 'string' && v.length > LIMITS.text) {
            err(fp, `até ${LIMITS.text} caracteres`)
            continue
          }
          if (f.kind === 'number') {
            const num = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
            if (!Number.isFinite(num) || num < 0) err(fp, 'precisa ser um número maior ou igual a zero')
            else config[k] = num
            continue
          }
          if (f.kind === 'select' && !f.options!.some(([o]) => o === String(v))) {
            err(fp, `"${v}" não é opção válida (${f.options!.map(([o]) => o).join(', ')})`)
            continue
          }
          config[k] = String(v)
        }
      if (n.label !== undefined && typeof n.label !== 'string') err(`${p}.label`, 'precisa ser texto')
      let position: FlowNode['position'] | undefined
      if (n.position !== undefined) {
        if (!isObj(n.position) || typeof n.position.x !== 'number' || typeof n.position.y !== 'number' || !Number.isFinite(n.position.x) || !Number.isFinite(n.position.y))
          err(`${p}.position`, 'precisa ter x e y numéricos')
        else position = { x: n.position.x, y: n.position.y }
      }
      if (typeof id === 'string') nodesOut.push({ id, type: n.type, config, ...(typeof n.label === 'string' && n.label.trim() ? { label: n.label.trim() } : {}), ...(position ? { position } : {}) })
    })

  const edgesOut: FlowDraft['edges'] = []
  const used = new Set<string>()
  if (raw.edges === undefined) err('edges', 'obrigatório (use [] se não houver ligações)')
  else if (!Array.isArray(raw.edges)) err('edges', 'precisa ser uma lista')
  else if (raw.edges.length > LIMITS.edges) err('edges', `no máximo ${LIMITS.edges} ligações`)
  else
    raw.edges.forEach((e, i) => {
      const p = `edges[${i}]`
      if (!isObj(e)) return err(p, 'precisa ser um objeto')
      for (const k of Object.keys(e)) if (!['id', 'from', 'to', 'port'].includes(k)) err(`${p}.${k}`, 'campo desconhecido')
      const port = (e.port ?? 'out') as Port
      if (typeof e.from !== 'string' || !ids.has(e.from)) return err(`${p}.from`, `etapa "${String(e.from)}" não existe`)
      if (typeof e.to !== 'string' || !ids.has(e.to)) return err(`${p}.to`, `etapa "${String(e.to)}" não existe`)
      if (!PORTS.includes(port)) return err(`${p}.port`, 'precisa ser "out", "sim" ou "nao"')
      const from = nodesOut.find((n) => n.id === e.from)
      const to = nodesOut.find((n) => n.id === e.to)
      // Etapa existe mas é inválida: o erro já foi informado na própria etapa.
      if (!from || !to) return
      if (!CATALOG[from.type].ports.includes(port))
        return err(`${p}.port`, `${from.type} só tem a(s) saída(s) ${CATALOG[from.type].ports.map((x) => `"${x}"`).join(', ') || 'nenhuma'}`)
      if (!CATALOG[to.type].hasInput) return err(`${p}.to`, `${to.type} é gatilho e não recebe ligação`)
      if (e.from === e.to) return err(p, 'uma etapa não pode ligar nela mesma')
      const key = `${e.from}:${port}`
      if (used.has(key)) return err(p, `a saída "${port}" de "${e.from}" já está ligada; cada saída leva a uma etapa só`)
      used.add(key)
      edgesOut.push({ from: e.from, to: e.to, port, ...(typeof e.id === 'string' ? { id: e.id } : {}) })
    })

  if (errors.length) return { ok: false, errors }
  return { ok: true, value: { name: (name as string).trim(), ...(typeof raw.description === 'string' ? { description: raw.description } : {}), nodes: nodesOut, edges: edgesOut } }
}

/** Transforma um rascunho válido em fluxo, calculando o layout quando faltam posições. */
export function draftToFlow(draft: FlowDraft, id = 'fluxo'): Flow {
  const needsLayout = draft.nodes.some((n) => !n.position)
  const pos = needsLayout ? autoLayout(draft.nodes, draft.edges.map((e) => ({ ...e, port: e.port }))) : {}
  const nodes: FlowNode[] = draft.nodes.map((n) => ({ ...n, position: needsLayout ? pos[n.id] : n.position! }))
  const edges: FlowEdge[] = draft.edges.map((e) => ({ id: `${e.from}:${e.port}->${e.to}`, from: e.from, to: e.to, port: e.port }))
  return { version: 1, id, name: draft.name, ...(draft.description ? { description: draft.description } : {}), nodes, edges }
}

/** Arquivo exportado: mesmo formato do rascunho, com posições. */
export function parseFlowFile(raw: unknown): SchemaResult<Flow> {
  const r = parseFlowDraft(raw)
  if (!r.ok) return r
  const obj = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>
  if (obj.version !== undefined && obj.version !== 1) return { ok: false, errors: [`version: versão ${String(obj.version)} não suportada`] }
  return { ok: true, value: draftToFlow(r.value, typeof obj.id === 'string' && obj.id ? obj.id : 'importado') }
}

export function serializeFlow(flow: Flow): string {
  return JSON.stringify(flow, null, 2)
}
