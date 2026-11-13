import { useEffect, useId, useState } from 'react'
import { Copy, Link2, Trash2 } from 'lucide-react'
import { CATALOG, nodeTitle, PORT_LABEL, type FieldDef } from '../domain/catalog'
import { incoming, nextOf } from '../domain/graph'
import type { FlowNode } from '../domain/types'
import type { FlowEditor } from '../hooks/useFlowEditor'
import { availablePaths } from './availablePaths'
import { CATEGORY_STYLE, NODE_ICON } from './nodeMeta'
import { IssueItem } from './IssuesPanel'

const inputCls = 'w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-muted/70 focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20'

function Field({ def, value, onCommit, paths, invalid }: { def: FieldDef; value: string; onCommit: (v: string) => void; paths: string[]; invalid: boolean }) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (v = draft) => v !== value && onCommit(v)
  const describedBy = def.help ? `${id}-help` : undefined
  const common = {
    id,
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
    className: `${inputCls} ${invalid ? 'border-bad/70' : ''}`,
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex items-center gap-1 text-[12px] font-medium text-ink2">
        {def.label}
        {def.required && (
          <span className="text-ember" aria-hidden>
            *
          </span>
        )}
        {def.required && <span className="sr-only">(obrigatório)</span>}
      </label>
      {def.kind === 'select' ? (
        <select {...common} value={draft} onChange={(e) => onCommit(e.target.value)}>
          {def.options!.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      ) : def.kind === 'textarea' ? (
        <textarea {...common} rows={3} value={draft} placeholder={def.placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit()} />
      ) : (
        <input
          {...common}
          type={def.kind === 'number' ? 'number' : def.kind === 'time' ? 'time' : 'text'}
          inputMode={def.kind === 'number' ? 'numeric' : undefined}
          min={def.kind === 'number' ? 0 : undefined}
          value={draft}
          placeholder={def.placeholder}
          onChange={(e) => (def.kind === 'time' ? onCommit(e.target.value) : setDraft(e.target.value))}
          onBlur={() => commit()}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
      )}
      {def.help && (
        <p id={`${id}-help`} className="mt-1 text-[11.5px] text-muted">
          {def.help}
        </p>
      )}
      {def.kind === 'textarea' && paths.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1" aria-label={`Inserir dado em ${def.label}`} role="group">
          {paths.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                const v = `${draft}${draft && !draft.endsWith(' ') ? ' ' : ''}{{${p}}}`
                setDraft(v)
                onCommit(v)
              }}
              className="rounded-md border border-line bg-sunk/60 px-1.5 py-0.5 font-mono text-[10.5px] text-ink2 hover:border-ember/50 hover:text-ember"
            >
              {`{{${p}}}`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Connections({ node, editor }: { node: FlowNode; editor: FlowEditor }) {
  const { flow } = editor
  const spec = CATALOG[node.type]
  const targets = flow.nodes.filter((n) => n.id !== node.id && CATALOG[n.type].hasInput)
  const from = incoming(flow, node.id)
  const byId = new Map(flow.nodes.map((n) => [n.id, n]))
  return (
    <section aria-labelledby="conn-h" className="space-y-2.5">
      <h3 id="conn-h" className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[.08em] text-muted">
        <Link2 size={12} aria-hidden /> Ligações
      </h3>
      {spec.ports.length === 0 && <p className="text-[12px] text-muted">Esta etapa termina o caminho.</p>}
      {spec.ports.map((port) => {
        const current = nextOf(flow, node.id, port) ?? ''
        return (
          <label key={port} className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink2">{port === 'out' ? 'Próxima etapa' : `Próxima etapa ${PORT_LABEL[port]}`}</span>
            <select
              className={inputCls}
              value={current}
              onChange={(e) => {
                if (!e.target.value) editor.disconnect(node.id, port)
                else editor.connect(node.id, port, e.target.value)
              }}
            >
              <option value="">Nenhuma</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {nodeTitle(t)} ({t.id})
                </option>
              ))}
            </select>
          </label>
        )
      })}
      {spec.hasInput && (
        <p className="text-[12px] text-muted">
          Recebe de: {from.length ? from.map((e) => `${byId.get(e.from) ? nodeTitle(byId.get(e.from)!) : e.from}${e.port !== 'out' ? ` (${PORT_LABEL[e.port]})` : ''}`).join(', ') : <span className="text-bad">ninguém ainda</span>}
        </p>
      )}
    </section>
  )
}

export function Inspector({ editor, onShowIssues }: { editor: FlowEditor; onShowIssues: () => void }) {
  const { flow, selection, issuesByNode, issues } = editor
  const node = selection?.kind === 'node' ? flow.nodes.find((n) => n.id === selection.id) : undefined
  const edge = selection?.kind === 'edge' ? flow.edges.find((e) => e.id === selection.id) : undefined
  const labelId = useId()

  if (edge) {
    const a = flow.nodes.find((n) => n.id === edge.from)
    const b = flow.nodes.find((n) => n.id === edge.to)
    return (
      <div className="space-y-3 p-4">
        <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[.08em] text-muted">Ligação</p>
        <p className="text-sm">
          <strong>{a ? nodeTitle(a) : edge.from}</strong> {edge.port !== 'out' && <span className={edge.port === 'sim' ? 'text-ok' : 'text-bad'}>({PORT_LABEL[edge.port]})</span>} leva a <strong>{b ? nodeTitle(b) : edge.to}</strong>.
        </p>
        <button type="button" onClick={editor.deleteSelection} className="inline-flex items-center gap-1.5 rounded-lg border border-bad/40 px-3 py-1.5 text-[13px] text-bad hover:bg-bad/5">
          <Trash2 size={14} aria-hidden /> Excluir ligação
        </button>
      </div>
    )
  }

  if (!node) {
    const errs = issues.filter((i) => i.severity === 'erro').length
    return (
      <div className="space-y-4 p-4">
        <div>
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[.08em] text-muted">Fluxo</p>
          <h2 className="mt-1 font-display text-lg font-semibold leading-snug">{flow.name}</h2>
          {flow.description && <p className="mt-1 text-[13px] leading-relaxed text-ink2">{flow.description}</p>}
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            ['etapas', flow.nodes.length],
            ['ligações', flow.edges.length],
            ['problemas', errs],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-surface p-2">
              <dt className="text-[11px] text-muted">{k}</dt>
              <dd className={`font-display text-xl font-semibold ${k === 'problemas' && Number(v) > 0 ? 'text-bad' : ''}`}>{v}</dd>
            </div>
          ))}
        </dl>
        {errs > 0 && (
          <button type="button" onClick={onShowIssues} className="text-[13px] font-medium text-bad underline underline-offset-2">
            Ver os problemas
          </button>
        )}
        <p className="rounded-lg bg-sunk/70 p-3 text-[12.5px] leading-relaxed text-ink2">
          Selecione uma etapa no canvas ou na lista para editar. Para ligar etapas, arraste do ponto da direita de uma etapa até outra, ou use os campos de ligação aqui no painel.
        </p>
      </div>
    )
  }

  const spec = CATALOG[node.type]
  const st = CATEGORY_STYLE[spec.category]
  const Icon = NODE_ICON[node.type]
  const nodeIssues = issuesByNode.get(node.id) ?? []
  const paths = availablePaths(flow)
  const invalidKeys = new Set(nodeIssues.map((i) => i.field).filter(Boolean))

  return (
    <div className="space-y-4 p-4" key={node.id}>
      <div className="flex items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${st.bg} ${st.text}`} aria-hidden>
          <Icon size={19} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p className={`font-mono text-[10.5px] font-semibold uppercase tracking-[.08em] ${st.text}`}>
            {st.label === spec.title ? st.label : `${st.label} · ${spec.title}`}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{spec.blurb}</p>
        </div>
      </div>

      {nodeIssues.length > 0 && (
        <ul className="space-y-2" aria-label="Problemas desta etapa">
          {nodeIssues.map((i, k) => (
            <IssueItem key={k} issue={i} compact />
          ))}
        </ul>
      )}

      <form className="space-y-3" onSubmit={(e) => e.preventDefault()} aria-labelledby={labelId}>
        <h3 id={labelId} className="sr-only">
          Configuração da etapa
        </h3>
        <Field def={{ key: 'label', label: 'Título no canvas', kind: 'text', required: false, placeholder: spec.title }} value={node.label ?? ''} onCommit={(v) => editor.updateNode(node.id, { label: v })} paths={[]} invalid={false} />
        {spec.fields.map((f) => (
          <Field
            key={f.key}
            def={f}
            value={String(node.config[f.key] ?? '')}
            invalid={invalidKeys.has(f.key)}
            paths={paths}
            onCommit={(v) => editor.updateNode(node.id, { config: { [f.key]: f.kind === 'number' && v !== '' ? Number(v) : v } })}
          />
        ))}
      </form>

      <Connections node={node} editor={editor} />

      <div className="flex gap-2 border-t border-line pt-3">
        <button type="button" onClick={editor.duplicate} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink2 hover:bg-sunk">
          <Copy size={14} aria-hidden /> Duplicar
        </button>
        <button type="button" onClick={editor.deleteSelection} className="inline-flex items-center gap-1.5 rounded-lg border border-bad/40 px-3 py-1.5 text-[13px] text-bad hover:bg-bad/5">
          <Trash2 size={14} aria-hidden /> Excluir etapa
        </button>
      </div>
    </div>
  )
}
