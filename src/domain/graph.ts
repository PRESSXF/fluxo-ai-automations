import { CATALOG } from './catalog'
import { NODE_H, NODE_W } from './layout'
import type { Flow, FlowEdge, FlowNode, NodeType, Port, Position } from './types'

/**
 * Operações de edição. Todas são puras: recebem um fluxo e devolvem outro,
 * o que deixa desfazer/refazer trivial e os testes simples.
 */

export function uid(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  let i = 1
  while (used.has(`${prefix}${i}`)) i++
  return `${prefix}${i}`
}

const shortPrefix = (t: NodeType) => (t.startsWith('gatilho') ? 'gat' : t === 'condicao' ? 'cond' : t.split('.')[1]?.slice(0, 5) ?? 'n')

export function createNode(flow: Flow, type: NodeType, position: Position, config?: FlowNode['config']): FlowNode {
  return {
    id: uid(`${shortPrefix(type)}_`, flow.nodes.map((n) => n.id)),
    type,
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    config: { ...CATALOG[type].defaults, ...config },
  }
}

export function addNode(flow: Flow, node: FlowNode): Flow {
  return { ...flow, nodes: [...flow.nodes, node] }
}

export function updateNode(flow: Flow, id: string, patch: Partial<Pick<FlowNode, 'config' | 'label' | 'position'>>): Flow {
  return {
    ...flow,
    nodes: flow.nodes.map((n) => (n.id === id ? { ...n, ...patch, config: patch.config ? { ...n.config, ...patch.config } : n.config } : n)),
  }
}

export function moveNodes(flow: Flow, ids: string[], dx: number, dy: number): Flow {
  const set = new Set(ids)
  return {
    ...flow,
    nodes: flow.nodes.map((n) => (set.has(n.id) ? { ...n, position: { x: Math.round(n.position.x + dx), y: Math.round(n.position.y + dy) } } : n)),
  }
}

export function removeNodes(flow: Flow, ids: string[]): Flow {
  const set = new Set(ids)
  return {
    ...flow,
    nodes: flow.nodes.filter((n) => !set.has(n.id)),
    edges: flow.edges.filter((e) => !set.has(e.from) && !set.has(e.to)),
  }
}

export function removeEdges(flow: Flow, ids: string[]): Flow {
  const set = new Set(ids)
  return { ...flow, edges: flow.edges.filter((e) => !set.has(e.id)) }
}

export type ConnectResult = { ok: true; flow: Flow; edge: FlowEdge } | { ok: false; reason: string }

/**
 * Liga a saída `port` de `from` à entrada de `to`. Cada saída aponta para uma
 * etapa só: ligar de novo substitui a ligação anterior daquela saída.
 * Ligações que criariam um ciclo são aceitas aqui e apontadas pela validação,
 * para o usuário entender o problema em vez de ver o clique ser ignorado.
 */
export function connect(flow: Flow, from: string, port: Port, to: string): ConnectResult {
  const a = flow.nodes.find((n) => n.id === from)
  const b = flow.nodes.find((n) => n.id === to)
  if (!a || !b) return { ok: false, reason: 'Etapa não encontrada.' }
  if (from === to) return { ok: false, reason: 'Uma etapa não pode ligar nela mesma.' }
  if (!CATALOG[a.type].ports.includes(port)) return { ok: false, reason: `"${CATALOG[a.type].title}" não tem essa saída.` }
  if (!CATALOG[b.type].hasInput) return { ok: false, reason: 'Gatilhos iniciam o fluxo e não recebem ligações.' }
  const edges = flow.edges.filter((e) => !(e.from === from && e.port === port))
  const edge: FlowEdge = { id: `${from}:${port}->${to}`, from, to, port }
  return { ok: true, flow: { ...flow, edges: [...edges, edge] }, edge }
}

/**
 * Insere uma etapa logo depois de outra. Se aquela saída já levava a algum lugar,
 * a etapa nova entra no meio do caminho e as etapas de baixo descem um nível.
 */
export function insertAfter(flow: Flow, type: NodeType, fromId: string, port: Port): { flow: Flow; node: FlowNode } | null {
  const src = flow.nodes.find((n) => n.id === fromId)
  if (!src || !CATALOG[src.type].ports.includes(port)) return null
  const level = NODE_H + 56
  const oldTarget = nextOf(flow, fromId, port)
  const node = createNode(flow, type, { x: src.position.x + (port === 'nao' ? NODE_W + 52 : 0), y: src.position.y + level })
  let next = flow
  if (oldTarget) next = { ...next, nodes: next.nodes.map((n) => (n.position.y > src.position.y ? { ...n, position: { ...n.position, y: n.position.y + level } } : n)) }
  next = addNode(next, node)
  if (!CATALOG[type].hasInput) return { flow: next, node }
  const linked = connect(next, fromId, port, node.id)
  if (linked.ok) next = linked.flow
  const outPort = CATALOG[type].ports[0]
  if (oldTarget && outPort) {
    const relinked = connect(next, node.id, outPort, oldTarget)
    if (relinked.ok) next = relinked.flow
  }
  return { flow: next, node }
}

export function disconnect(flow: Flow, from: string, port: Port): Flow {
  return { ...flow, edges: flow.edges.filter((e) => !(e.from === from && e.port === port)) }
}

export function outgoing(flow: Flow, id: string): FlowEdge[] {
  return flow.edges.filter((e) => e.from === id)
}

export function incoming(flow: Flow, id: string): FlowEdge[] {
  return flow.edges.filter((e) => e.to === id)
}

export function nextOf(flow: Flow, id: string, port: Port): string | undefined {
  return flow.edges.find((e) => e.from === id && e.port === port)?.to
}

export function duplicateNode(flow: Flow, id: string): { flow: Flow; node: FlowNode } | null {
  const src = flow.nodes.find((n) => n.id === id)
  if (!src) return null
  const node = { ...createNode(flow, src.type, { x: src.position.x + 32, y: src.position.y + 32 }, src.config), label: src.label }
  return { flow: addNode(flow, node), node }
}

/** Ordem de leitura: começa nos gatilhos e segue as ligações (sim antes de não). Etapas soltas vão no fim. */
export function readingOrder(flow: Flow): FlowNode[] {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]))
  const seen = new Set<string>()
  const out: FlowNode[] = []
  const portRank: Record<Port, number> = { out: 0, sim: 0, nao: 1 }
  const visit = (id: string) => {
    if (seen.has(id)) return
    const n = byId.get(id)
    if (!n) return
    seen.add(id)
    out.push(n)
    for (const e of [...outgoing(flow, id)].sort((x, y) => portRank[x.port] - portRank[y.port])) visit(e.to)
  }
  for (const n of flow.nodes) if (CATALOG[n.type].category === 'gatilho') visit(n.id)
  for (const n of [...flow.nodes].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)) visit(n.id)
  return out
}
