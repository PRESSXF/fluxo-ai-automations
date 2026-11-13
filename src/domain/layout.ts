import { CATALOG, isNodeType } from './catalog'
import type { FlowEdge, FlowNode, Port, Position } from './types'

export const NODE_W = 240
export const NODE_H = 80
const LANE = NODE_W + 52
const LEVEL = NODE_H + 56
const ORIGIN = { x: 40, y: 40 }

/**
 * Layout automático de cima para baixo. Usado quando a IA monta um fluxo
 * (ela não decide posições) e na importação de arquivos sem posição.
 * Cada etapa desce um nível por ligação (pelo caminho mais longo). As colunas
 * vêm das folhas: uma etapa com vários filhos fica no meio deles, com o caminho
 * "se sim" à esquerda do "se não". Etapas onde dois caminhos se juntam ganham
 * coluna própria, para a ligação de volta não passar por cima de outras etapas.
 * Fluxos de pequenos negócios são mais fundos do que largos, então o vertical
 * cabe melhor na tela, inclusive no celular.
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

  // Nível = maior distância a partir de uma raiz (ignora arestas de volta para não travar em ciclos).
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

  const lane = new Map<string, number>()
  let nextLane = 0
  const placing = new Set<string>()
  const isMerge = (id: string) => (indeg.get(id) ?? 0) > 1
  const treeKids = new Map<string, string[]>()
  const place = (id: string): number => {
    if (lane.has(id)) return lane.get(id)!
    if (placing.has(id)) return nextLane
    placing.add(id)
    const kids = (children.get(id) ?? []).filter((c) => !lane.has(c) && !placing.has(c) && !isMerge(c) && (depth.get(c) ?? 0) > (depth.get(id) ?? 0))
    treeKids.set(id, kids)
    let r: number
    if (kids.length === 0) r = nextLane++
    else {
      const rs = kids.map(place)
      r = (Math.min(...rs) + Math.max(...rs)) / 2
    }
    lane.set(id, r)
    placing.delete(id)
    return r
  }
  for (const r of roots) place(r)
  // Pontos de encontro entram depois, cada um na sua coluna, já com os descendentes.
  for (let changed = true; changed; ) {
    changed = false
    for (const n of nodes)
      if (!lane.has(n.id) && isMerge(n.id)) {
        place(n.id)
        changed = true
      }
  }
  for (const n of nodes) place(n.id)

  // Segunda passada, de baixo para cima: uma condição fica no meio dos dois caminhos,
  // mesmo quando um deles leva a um ponto de encontro.
  const byDepth = [...nodes].sort((a, b) => (depth.get(b.id) ?? 0) - (depth.get(a.id) ?? 0))
  const typeOf = new Map(nodes.map((n) => [n.id, n.type]))
  for (const n of byDepth) {
    const kids = [...(treeKids.get(n.id) ?? [])]
    if (typeOf.get(n.id) === 'condicao') for (const c of children.get(n.id) ?? []) if (isMerge(c) && !kids.includes(c)) kids.push(c)
    if (!kids.length) continue
    const rs = kids.map((c) => lane.get(c) ?? 0)
    lane.set(n.id, (Math.min(...rs) + Math.max(...rs)) / 2)
  }

  const out: Record<string, Position> = {}
  for (const n of nodes) out[n.id] = { x: Math.round(ORIGIN.x + (lane.get(n.id) ?? 0) * LANE), y: ORIGIN.y + (depth.get(n.id) ?? 0) * LEVEL }
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

/** Pontos de conexão. Entrada em cima; saídas embaixo (sim à esquerda, não à direita). */
export function portPoint(node: Pick<FlowNode, 'position'>, port: Port | 'in'): Position {
  const { x, y } = node.position
  if (port === 'in') return { x: x + NODE_W / 2, y }
  if (port === 'sim') return { x: x + NODE_W * 0.3, y: y + NODE_H }
  if (port === 'nao') return { x: x + NODE_W * 0.7, y: y + NODE_H }
  return { x: x + NODE_W / 2, y: y + NODE_H }
}

/** Curva de uma saída até uma entrada, com as pontas sempre na vertical. */
export function edgeControls(a: Position, b: Position) {
  const dy = Math.max(40, Math.abs(b.y - a.y) / 2)
  return { c1: { x: a.x, y: a.y + dy }, c2: { x: b.x, y: b.y - dy } }
}

export function edgePath(a: Position, b: Position) {
  const { c1, c2 } = edgeControls(a, b)
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`
}

/** Ponto do meio da curva (t = 0,5). */
export function edgeMidpoint(a: Position, b: Position): Position {
  const { c1, c2 } = edgeControls(a, b)
  return { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 }
}
