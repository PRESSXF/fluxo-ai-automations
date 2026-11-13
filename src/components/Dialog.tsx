import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Diálogo nativo (<dialog>): foco preso, Esc fecha e o fundo fica inerte sem código extra. */
export function Dialog({ open, onClose, title, subtitle, children, width = '32rem' }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; width?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={id}
      style={{ width: `min(${width}, calc(100vw - 1.5rem))` }}
      className="scroll-thin max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/50 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4">
        <div>
          <h2 id={id} className="font-display text-lg font-semibold">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink2">{subtitle}</p>}
        </div>
        <button type="button" onClick={() => ref.current?.close()} aria-label="Fechar" className="rounded-lg p-1.5 text-muted hover:bg-sunk hover:text-ink">
          <X size={18} />
        </button>
      </div>
      <div className="p-5">{open && children}</div>
    </dialog>
  )
}
