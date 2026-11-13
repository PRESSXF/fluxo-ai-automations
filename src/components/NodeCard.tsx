import { memo } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import { CATALOG, nodeSummary, nodeTitle, PORT_LABEL } from '../domain/catalog'
import { NODE_H, NODE_W } from '../domain/layout'
import type { StepStatus } from '../domain/engine'
import type { FlowNode, Port } from '../domain/types'
import type { Issue } from '../domain/validate'
import { CATEGORY_STYLE, NODE_ICON } from './nodeMeta'

interface Props {
  node: FlowNode
  selected: boolean
  issues: Issue[]
  simStatus?: StepStatus
  active: boolean
  dimmed: boolean
  connectTarget: boolean
  readOnly: boolean
  onPointerDown: (e: React.PointerEvent, node: FlowNode) => void
  onPortDown: (e: React.PointerEvent, node: FlowNode, port: Port) => void
  onFocus: (id: string) => void
  onActivate: (id: string) => void
}

export const NodeCard = memo(function NodeCard({ node, selected, issues, simStatus, active, dimmed, connectTarget, readOnly, onPointerDown, onPortDown, onFocus, onActivate }: Props) {
  const spec = CATALOG[node.type]
  const style = CATEGORY_STYLE[spec.category]
  const Icon = NODE_ICON[node.type]
  const title = nodeTitle(node)
  const summary = nodeSummary(node)
  const errors = issues.filter((i) => i.severity === 'erro').length
  const warns = issues.length - errors

  const statusText = simStatus ? ` Simulação: ${simStatus}.` : ''
  const issueText = errors ? ` ${errors} problema${errors > 1 ? 's' : ''}.` : warns ? ` ${warns} aviso${warns > 1 ? 's' : ''}.` : ''

  return (
    <div
      data-node-id={node.id}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${style.label}: ${title}. ${summary}.${issueText}${statusText}`}
      onPointerDown={(e) => onPointerDown(e, node)}
      onFocus={() => onFocus(node.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onActivate(node.id)
        }
      }}
      onDoubleClick={() => onActivate(node.id)}
      style={{ left: node.position.x, top: node.position.y, width: NODE_W, height: NODE_H }}
      className={[
        'group absolute select-none rounded-xl border bg-surface text-left shadow-[0_1px_0_rgb(var(--line)),0_6px_16px_-10px_rgb(var(--ink)/.35)] transition-[opacity,box-shadow]',
        readOnly ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
        selected ? 'border-ember ring-2 ring-ember/40' : errors ? 'border-bad/60' : 'border-line',
        connectTarget ? 'ring-2 ring-act/60' : '',
        active ? 'animate-pulsering border-ember' : '',
        dimmed ? 'opacity-55' : '',
      ].join(' ')}
    >
      <div className={`absolute inset-y-0 left-0 w-1 rounded-l-xl ${style.dot}`} aria-hidden />
      <div className="flex h-full items-center gap-2.5 py-2 pl-3.5 pr-3">
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${style.bg} ${style.text}`} aria-hidden>
          <Icon size={16} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block font-mono text-[10px] font-semibold uppercase tracking-[.08em] ${style.text}`}>{style.label}</span>
          <span className="block truncate font-display text-[14px] font-semibold leading-tight text-ink">{title}</span>
          <span className="mt-0.5 block truncate text-[11.5px] leading-snug text-muted">{summary}</span>
        </span>
      </div>

      {(errors > 0 || warns > 0) && (
        <span
          className={`absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold text-white ${errors ? 'bg-bad' : 'bg-warn'}`}
          aria-hidden
          title={issues.map((i) => i.message).join('\n')}
        >
          {errors || warns}
        </span>
      )}
      {simStatus && (
        <span
          className={`absolute -left-2 -top-2 grid size-5 place-items-center rounded-full text-white ${simStatus === 'erro' ? 'bg-bad' : simStatus === 'aviso' ? 'bg-warn' : simStatus === 'ignorado' ? 'bg-muted' : 'bg-ok'}`}
          aria-hidden
        >
          {simStatus === 'erro' ? <X size={12} strokeWidth={3} /> : simStatus === 'aviso' ? <AlertTriangle size={11} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
        </span>
      )}

      {spec.hasInput && <span aria-hidden className="absolute -top-[6px] left-1/2 size-3 -translate-x-1/2 rounded-full border-2 border-ink2/60 bg-surface" />}
      {spec.ports.map((port) => {
        const left = port === 'sim' ? '30%' : port === 'nao' ? '70%' : '50%'
        return (
          <span key={port} aria-hidden className="absolute -bottom-[13px] -translate-x-1/2" style={{ left }}>
            {port !== 'out' && (
              <span
                className={`pointer-events-none absolute top-[17px] rounded px-1 font-mono text-[10px] font-semibold leading-4 ${port === 'sim' ? 'right-[18px] bg-ok/10 text-ok' : 'left-[18px] bg-bad/10 text-bad'}`}
              >
                {PORT_LABEL[port].replace('se ', '')}
              </span>
            )}
            <span
              data-port={port}
              onPointerDown={(e) => !readOnly && onPortDown(e, node, port)}
              className={`group/port grid size-[26px] place-items-center rounded-full ${readOnly ? '' : 'cursor-crosshair'}`}
            >
              <span
                className={`block size-3.5 rounded-full border-2 bg-surface transition ${port === 'sim' ? 'border-ok' : port === 'nao' ? 'border-bad' : 'border-ink2'} ${readOnly ? '' : 'group-hover/port:scale-125 group-hover/port:border-ember group-hover/port:bg-ember'}`}
              />
            </span>
          </span>
        )
      })}
    </div>
  )
})
