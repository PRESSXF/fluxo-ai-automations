import { CATALOG, nodeTitle } from '../domain/catalog'
import { bounds, edgePath, NODE_H, NODE_W, portPoint } from '../domain/layout'
import type { Flow } from '../domain/types'
import { CATEGORY_STYLE } from './nodeMeta'

/** Miniatura estática do fluxo, usada na prévia da IA. Não é interativa. */
export function FlowPreview({ flow, highlight }: { flow: Flow; highlight?: Set<string> }) {
  const b = bounds(flow.nodes)
  const pad = 24
  const vb = `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`
  const byId = new Map(flow.nodes.map((n) => [n.id, n]))
  return (
    <svg viewBox={vb} className="h-full w-full" role="img" aria-label={`Prévia do fluxo com ${flow.nodes.length} etapas: ${flow.nodes.map((n) => nodeTitle(n)).join(', ')}`}>
      {flow.edges.map((e) => {
        const a = byId.get(e.from)
        const c = byId.get(e.to)
        if (!a || !c) return null
        return <path key={e.id} d={edgePath(portPoint(a, e.port), portPoint(c, 'in'))} fill="none" strokeWidth={3} stroke={e.port === 'sim' ? 'rgb(var(--ok))' : e.port === 'nao' ? 'rgb(var(--bad))' : 'rgb(var(--ink2) / .55)'} />
      })}
      {flow.nodes.map((n) => {
        const st = CATEGORY_STYLE[CATALOG[n.type].category]
        const isNew = highlight?.has(n.id)
        const title = nodeTitle(n)
        return (
          <g key={n.id} transform={`translate(${n.position.x} ${n.position.y})`}>
            <rect width={NODE_W} height={NODE_H} rx={14} fill="rgb(var(--surface))" stroke={isNew ? 'rgb(var(--ember))' : 'rgb(var(--line))'} strokeWidth={isNew ? 4 : 2} />
            <rect width={8} height={NODE_H} rx={4} fill={st.stroke} />
            <text x={22} y={32} fontSize={15} fontFamily="JetBrains Mono Variable, monospace" fontWeight={700} fill={st.stroke} letterSpacing={1}>
              {st.label.toUpperCase()}
            </text>
            <text x={22} y={60} fontSize={20} fontFamily="Space Grotesk Variable, sans-serif" fontWeight={600} fill="rgb(var(--ink))">
              {title.length > 20 ? `${title.slice(0, 19)}…` : title}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
