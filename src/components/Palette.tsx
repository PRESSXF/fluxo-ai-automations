import { CATALOG, NODE_TYPES } from '../domain/catalog'
import type { Category, NodeType } from '../domain/types'
import { CATEGORY_STYLE, NODE_ICON } from './nodeMeta'

const GROUPS: Array<[Category, string]> = [
  ['gatilho', 'Gatilhos'],
  ['condicao', 'Condições'],
  ['acao', 'Ações'],
  ['ia', 'Com IA'],
  ['controle', 'Controle'],
]

interface Props {
  onAdd: (type: NodeType) => void
  /** Texto curto sobre onde a etapa vai entrar ao clicar. */
  hint: string
}

/** Paleta de blocos. Arrastar solta no ponto do canvas; clicar (ou Enter) insere pelo teclado. */
export function Palette({ onAdd, hint }: Props) {
  return (
    <div className="space-y-4 p-3">
      <p className="rounded-lg bg-sunk/70 px-2.5 py-2 text-[11.5px] leading-snug text-muted">{hint}</p>
      {GROUPS.map(([cat, label]) => (
        <section key={cat} aria-labelledby={`pal-${cat}`}>
          <h3 id={`pal-${cat}`} className={`mb-1.5 flex items-center gap-1.5 px-1 font-mono text-[10.5px] font-semibold uppercase tracking-[.08em] ${CATEGORY_STYLE[cat].text}`}>
            <span className={`size-1.5 rounded-full ${CATEGORY_STYLE[cat].dot}`} aria-hidden />
            {label}
          </h3>
          <ul className="space-y-1">
            {NODE_TYPES.filter((t) => CATALOG[t].category === cat).map((t) => {
              const Icon = NODE_ICON[t]
              const st = CATEGORY_STYLE[cat]
              return (
                <li key={t}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-fluxo-node', t)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => onAdd(t)}
                    title={CATALOG[t].blurb}
                    className="flex w-full cursor-grab items-center gap-2 rounded-lg border border-transparent px-1.5 py-1.5 text-left text-[13px] text-ink2 transition hover:border-line hover:bg-surface active:cursor-grabbing"
                  >
                    <span className={`grid size-6 shrink-0 place-items-center rounded-md ${st.bg} ${st.text}`} aria-hidden>
                      <Icon size={13} strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 truncate">{CATALOG[t].title}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
