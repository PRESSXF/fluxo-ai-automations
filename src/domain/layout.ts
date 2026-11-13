import { CATALOG, isNodeType } from './catalog'
import type { FlowEdge, FlowNode, Port, Position } from './types'

export const NODE_W = 236
export const NODE_H = 92
const COL = NODE_W + 76
const ROW = NODE_H + 44
const ORIGIN = { x: 40, y: 40 }

/**
 * Layout automático em colunas, da esquerda para a direita. Usado quando a IA
 * monta um fluxo (ela não decide posições) e na importação de arquivos sem posição.
 * Cada folha ganha uma linha; uma etapa com vários filhos fica na média deles.
 * O caminho "se sim" fica acima do "se não".
 */
export function autoLayout(nodes: Array<Pick<FlowNode, 'id' | 'type'>>, edges: Array<Pick<FlowEdge, 'from' | 'to' | 'port'>>): Record<string, Position> {
  const order: Record<Port, number> = { sim: 0, out: 0, nao: 1 }
  const children = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  for (const n of nodes) {
    children.set(n.id, [])
    indeg.set(n.id, 0)
  }
  for (const e of [...edges].sort((a, b) => order[a.port] - order[b.port])) {
    if (!children.has(e.from) || !children.has(e.to)) continue
    children.get(e.from)!.push(e.to)
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }

  // Coluna = maior distância a partir de uma raiz (ignora arestas de volta para não travar em ciclos).
  const depth = new Map<string, number>()
  const roots = nodes.filter((n) => (isNodeType(n.type) && CATALOG[n.type].category === 'gatilho') || indeg.get(n.id) === 0).map((n) => n.id)
  const visiting = new Set<string>()
  const setDepth = (id: string, d: number) => {
    if (visiting.has(id)) return
    if ((depth.get(id) ?? -1) >= d) return
    depth.set(id, d)
    visiting.add(id)
    for (const c of children.get(id) ?? []) setDepth(c, d + 1)
    visiting.delete(id)
  }
  for (const r of roots) setDepth(r, 0)
  for (const n of nodes) if (!depth.has(n.id)) setDepth(n.id, 0)

  const row = new Map<string, number>()
  let nextRow = 0
  const placing = new Set<string>()
  const place = (id: string): number => {
    if (row.has(id)) return row.get(id)!
    if (placing.has(id)) return nextRow
    placing.add(id)
    const kids = (children.get(id) ?? []).filter((c) => !row.has(c) && !placing.has(c) && (depth.get(c) ?? 0) > (depth.get(id) ?? 0))
    let r: number
    if (kids.length === 0) r = nextRow++
    else {
      const rs = kids.map(place)
      r = (Math.min(...rs) + Math.max(...rs)) / 2
    }
    row.set(id, r)
    placing.delete(id)
    return r
  }
  for (const r of roots) place(r)
  for (const n of nodes) place(n.id)

  const out: Record<string, Position> = {}
  for (const n of nodes) out[n.id] = { x: ORIGIN.x + (depth.get(n.id) ?? 0) * COL, y: Math.round(ORIGIN.y + (row.get(n.id) ?? 0) * ROW) }
  return out
}

export function bounds(nodes: Array<Pick<FlowNode, 'position'>>) {
  if (!nodes.length) return { x: 0, y: 0, w: 0, h: 0 }
  const xs = nodes.map((n) => n.position.x)
  const ys = nodes.map((n) => n.position.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) + NODE_W - x, h: Math.max(...ys) + NODE_H - y }
}

/** Pontos de conexão no canvas. Entradas à esquerda; saídas à direita (sim em cima, não embaixo). */
export function portPoint(node: Pick<FlowNode, 'position'>, port: Port | 'in'): Position {
  const { x, y } = node.position
  if (port === 'in') return { x, y: y + NODE_H / 2 }
  if (port === 'sim') return { x: x + NODE_W, y: y + NODE_H * 0.32 }
  if (port === 'nao') return { x: x + NODE_W, y: y + NODE_H * 0.72 }
  return { x: x + NODE_W, y: y + NODE_H / 2 }
}

export function edgePath(a: Position, b: Position) {
  const dx = Math.max(48, Math.abs(b.x - a.x) / 2)
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}
