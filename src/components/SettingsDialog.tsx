import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Dialog } from './Dialog'

export interface ProviderSettings {
  mode: 'demo' | 'anthropic'
  apiKey: string
  model: string
}

export const DEFAULT_MODEL = 'claude-haiku-4-5'

export function SettingsDialog({ open, value, onClose, onSave }: { open: boolean; value: ProviderSettings; onClose: () => void; onSave: (v: ProviderSettings) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])
  const canSave = draft.mode === 'demo' || (draft.apiKey.trim().startsWith('sk-') && draft.model.trim())

  return (
    <Dialog open={open} onClose={onClose} title="Qual IA o Fluxo usa" subtitle="O esquema, a validação e o motor são os mesmos nos dois modos.">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (canSave) onSave({ ...draft, apiKey: draft.apiKey.trim(), model: draft.model.trim() })
        }}
      >
        <fieldset className="space-y-2">
          <legend className="sr-only">Modo</legend>
          {(
            [
              ['demo', 'Demonstração', 'Regras locais que entendem frases comuns em português e devolvem o mesmo JSON de um modelo real. Grátis, instantâneo e sempre igual.'],
              ['anthropic', 'Claude (API da Anthropic)', 'Usa a sua chave. Entende qualquer descrição; cada montagem custa uma fração de centavo de dólar com o Haiku.'],
            ] as const
          ).map(([mode, title, desc]) => (
            <label key={mode} className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${draft.mode === mode ? 'border-ember/70 bg-ember/[.05]' : 'border-line bg-surface hover:bg-sunk/50'}`}>
              <input type="radio" name="mode" checked={draft.mode === mode} onChange={() => setDraft({ ...draft, mode })} className="mt-1 accent-[rgb(var(--ember))]" />
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-[12.5px] text-ink2">{desc}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {draft.mode === 'anthropic' && (
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="api-key" className="text-[12px] font-medium text-ink2">
                Chave da API
              </label>
              <div className="mt-1 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-ember">
                <KeyRound size={15} className="text-muted" aria-hidden />
                <input id="api-key" type="password" autoComplete="off" value={draft.apiKey} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} placeholder="sk-ant-…" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm focus:outline-none" />
              </div>
            </div>
            <div>
              <label htmlFor="model" className="text-[12px] font-medium text-ink2">
                Modelo
              </label>
              <input id="model" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 font-mono text-sm focus:border-ember focus:outline-none" />
            </div>
            <p className="rounded-lg bg-sunk/70 p-3 text-[12px] leading-relaxed text-ink2">
              A chave fica só nesta aba (sessionStorage) e vai direto do seu navegador para a API da Anthropic. Não existe servidor no meio. Feche a aba para apagá-la.
            </p>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-ink2 hover:bg-sunk">
            Cancelar
          </button>
          <button type="submit" disabled={!canSave} className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40">
            Usar este modo
          </button>
        </div>
      </form>
    </Dialog>
  )
}
