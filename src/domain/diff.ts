import { CATALOG, nodeTitle } from './catalog'
import { readingOrder } from './graph'
import type { Flow, FlowNode, Port } from './types'

/**
 * Compara o fluxo atual com a proposta da IA antes de aplicar.
 * Etapas são pareadas pelo tipo, na ordem de leitura do fluxo: a primeira
 * "Enviar mensagem" da proposta é comparada com a primeira do fluxo atual, e assim por diante.
 */

export interface FieldChange {
  key: string
  label: string
  before: string
  after: string
}

export type NodeChange =
  | { kind: 'igual'; node: FlowNode; beforeId: string }
  | { kind: 'alterada'; node: FlowNode; beforeId: string; fields: FieldChange[] }
  | { kind: 'nova'; node: FlowNode }
  | { kind: 'removida'; node: FlowNode }

export interface FlowDiff {
  nodes: NodeChange[]
  edgesAdded: number
  edgesRemoved: number
  /** true quando nada muda. */
  same: boolean
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v))

export function diffFlows(before: Flow, after: Flow): FlowDiff {
  const pool = readingOrder(before)
  const matched = new Map<string, string>() // after.id -> before.id
  const changes: NodeChange[] = []

  for (const n of readingOrder(after)) {
    const idx = pool.findIndex((b) => b.type === n.type)
    if (idx < 0) {
      changes.push({ kind: 'nova', node: n })
      continue
    }
    const b = pool.splice(idx, 1)[0]
    matched.set(n.id, b.id)
    const fields: FieldChange[] = []
    const spec = CATALOG[n.type]
    for (const f of spec.fields) {
      if (str(b.config[f.key]) !== str(n.config[f.key])) fields.push({ key: f.key, label: f.label, before: str(b.config[f.key]), after: str(n.config[f.key]) })
    }
    if (nodeTitle(b) !== nodeTitle(n)) fields.push({ key: 'label', label: 'Título', before: nodeTitle(b), after: nodeTitle(n) })
    changes.push(fields.length ? { kind: 'alterada', node: n, beforeId: b.id, fields } : { kind: 'igual', node: n, beforeId: b.id })
  }
  for (const b of pool) changes.push({ kind: 'removida', node: b })

  const key = (from: string, port: Port, to: string) => `${from}|${port}|${to}`
  const beforeEdges = new Set(before.edges.map((e) => key(e.from, e.port, e.to)))
  const afterEdges = new Set(after.edges.map((e) => key(matched.get(e.from) ?? `+${e.from}`, e.port, matched.get(e.to) ?? `+${e.to}`)))
  const edgesAdded = [...afterEdges].filter((k) => !beforeEdges.has(k)).length
  const edgesRemoved = [...beforeEdges].filter((k) => !afterEdges.has(k)).length

  return { nodes: changes, edgesAdded, edgesRemoved, same: edgesAdded === 0 && edgesRemoved === 0 && changes.every((c) => c.kind === 'igual') }
}
