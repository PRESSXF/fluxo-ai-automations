import { ArrowRight } from 'lucide-react'
import { CATALOG, nodeSummary, nodeTitle, PORT_LABEL } from '../domain/catalog'
import { readingOrder } from '../domain/graph'
import type { Flow } from '../domain/types'
import type { Issue } from '../domain/validate'
import { CATEGORY_STYLE, NODE_ICON } from './nodeMeta'

interface Props {
  flow: Flow
  selectedId?: string
  issuesByNode: Map<string, Issue[]>
  onSelect: (id: string) => void
}

/**
 * Lista das etapas na ordem em que o fluxo roda. É a alternativa acessível ao canvas:
 * dá para entender e editar o fluxo inteiro sem arrastar nada.
 */
export function StepList({ flow, selectedId, issuesByNode, onSelect }: Props) {
  const order = readingOrder(flow)
  const byId = new Map(flow.nodes.map((n) => [n.id, n]))
  if (!order.length) return <p className="p-4 text-sm text-muted">Nenhuma etapa ainda.</p>
  return (
    <ol className="space-y-1.5 p-3" aria-label="Etapas do fluxo em ordem">
      {order.map((n, i) => {
        const spec = CATALOG[n.type]
        const st = CATEGORY_STYLE[spec.category]
        const Icon = NODE_ICON[n.type]
        const issues = issuesByNode.get(n.id) ?? []
        const errors = issues.filter((x) => x.severity === 'erro').length
        const outs = flow.edges.filter((e) => e.from === n.id)
        const selected = n.id === selectedId
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onSelect(n.id)}
              aria-current={selected ? 'true' : undefined}
              className={`w-full rounded-xl border p-2.5 text-left transition ${selected ? 'border-ember bg-surface ring-2 ring-ember/25' : 'border-line bg-surface/70 hover:bg-surface'}`}
            >
              <span className="flex items-start gap-2.5">
                <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-[11px] text-muted">{i + 1}</span>
                <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${st.bg} ${st.text}`} aria-hidden>
                  <Icon size={14} strokeWidth={2.2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-display text-[13.5px] font-semibold">{nodeTitle(n)}</span>
                    {issues.length > 0 && (
                      <span className={`shrink-0 rounded-full px-1.5 text-[10.5px] font-semibold text-white ${errors ? 'bg-bad' : 'bg-warn'}`}>
                        {errors ? `${errors} erro${errors > 1 ? 's' : ''}` : `${issues.length} aviso${issues.length > 1 ? 's' : ''}`}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted">{nodeSummary(n)}</span>
                  {outs.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink2">
                      {outs.map((e) => (
                        <span key={e.id} className="inline-flex items-center gap-1">
                          {e.port !== 'out' && <span className={e.port === 'sim' ? 'text-ok' : 'text-bad'}>{PORT_LABEL[e.port]}</span>}
                          <ArrowRight size={11} aria-hidden />
                          <span className="sr-only">vai para</span>
                          {byId.get(e.to) ? nodeTitle(byId.get(e.to)!) : '?'}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
