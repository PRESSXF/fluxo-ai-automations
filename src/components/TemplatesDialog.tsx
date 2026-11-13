import { ArrowRight } from 'lucide-react'
import { CATALOG } from '../domain/catalog'
import { TEMPLATES } from '../domain/templates'
import { CATEGORY_STYLE, NODE_ICON } from './nodeMeta'
import { Dialog } from './Dialog'

export function TemplatesDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Modelos prontos" subtitle="Rotinas comuns de pequenos negócios. Carregar substitui o fluxo atual; Ctrl+Z desfaz." width="44rem">
      <ul className="grid gap-3 sm:grid-cols-2">
        {TEMPLATES.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => onPick(t.id)} className="group flex h-full w-full flex-col rounded-xl border border-line bg-surface p-4 text-left transition hover:border-ember/60 hover:shadow-md">
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[.08em] text-ember">{t.segment}</span>
              <span className="mt-1 font-display text-[15px] font-semibold">{t.title}</span>
              <span className="mt-1 flex-1 text-[12.5px] leading-snug text-ink2">{t.pitch}</span>
              <span className="mt-3 flex flex-wrap items-center gap-1" aria-label={`${t.draft.nodes.length} etapas`}>
                {t.draft.nodes.map((n) => {
                  const Icon = NODE_ICON[n.type]
                  const st = CATEGORY_STYLE[CATALOG[n.type].category]
                  return (
                    <span key={n.id} className={`grid size-6 place-items-center rounded-md ${st.bg} ${st.text}`} aria-hidden>
                      <Icon size={12} />
                    </span>
                  )
                })}
                <ArrowRight size={14} className="ml-auto text-muted transition group-hover:translate-x-0.5 group-hover:text-ember" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
