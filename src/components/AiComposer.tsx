import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, FlaskConical, Loader2, Minus, Pencil, Plus, ShieldAlert, Sparkles, X } from 'lucide-react'
import { generateFlow, type GenerateResult } from '../ai/generate'
import type { Provider } from '../ai/types'
import { nodeTitle } from '../domain/catalog'
import { diffFlows } from '../domain/diff'
import type { Flow } from '../domain/types'
import { CASES } from '../evals/cases'
import { FlowPreview } from './FlowPreview'
import { IssueItem } from './IssuesPanel'

const EXAMPLES = [CASES[0], CASES[1], CASES[2], CASES[6]].map((c) => c.description)

/** Provedor de mentira que devolve um JSON quebrado, para mostrar a validação funcionando. */
const brokenProvider: Provider = {
  id: 'demo',
  label: 'Resposta inválida de propósito',
  model: 'teste',
  classify: async () => ({ categoria: '', confianca: 0, motivo: '' }),
  summarize: async () => '',
  buildFlow: async () => ({
    raw: {
      name: 'Fluxo com erros',
      nodes: [
        { id: 'inicio', type: 'gatilho.pedido', config: { canal: 'telegram' } },
        { id: 'pix', type: 'acao.enviar_pix', config: { valor: 200 } },
        { id: 'espera', type: 'controle.esperar', config: { minutos: 'meia hora' } },
      ],
      edges: [{ from: 'inicio', to: 'gerente', port: 'out' }],
    },
    notes: [],
    usage: { inputTokens: 0, outputTokens: 0, estimated: true },
  }),
}

interface Props {
  open: boolean
  onClose: () => void
  provider: Provider
  current: Flow
  onApply: (flow: Flow) => void
  onOpenSettings: () => void
}

export function AiComposer({ open, onClose, provider, current, onApply, onOpenSettings }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState(EXAMPLES[0])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const resultRef = useRef<HTMLElement>(null)
  const abort = useRef<AbortController | null>(null)
  const ids = { title: useId(), text: useId() }

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])

  const run = async (p: Provider = provider) => {
    abort.current?.abort()
    abort.current = new AbortController()
    setLoading(true)
    setResult(null)
    const r = await generateFlow(p, text, abort.current.signal)
    setLoading(false)
    setResult(r)
    // No celular a prévia fica abaixo do formulário: rola o próprio diálogo até ela.
    requestAnimationFrame(() => {
      const d = ref.current
      const sec = resultRef.current
      if (d && sec && d.scrollHeight > d.clientHeight && sec.offsetTop > d.clientHeight / 2) d.scrollTo({ top: sec.offsetTop - 12, behavior: 'smooth' })
    })
  }

  const diff = useMemo(() => (result?.ok ? diffFlows(current, result.flow) : null), [result, current])
  const newIds = useMemo(() => new Set(diff?.nodes.filter((c) => c.kind === 'nova' || c.kind === 'alterada').map((c) => c.node.id)), [diff])
  const isDemo = provider.id === 'demo'

  return (
    <dialog
      ref={ref}
      onClose={() => {
        abort.current?.abort()
        onClose()
      }}
      aria-labelledby={ids.title}
      className="scroll-thin max-h-[calc(100dvh-1.5rem)] w-[min(64rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/50 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4">
        <div>
          <h2 id={ids.title} className="flex items-center gap-2 font-display text-lg font-semibold">
            <Sparkles size={18} className="text-ember" aria-hidden /> Descreva e a IA monta
          </h2>
          <p className="mt-0.5 text-[13px] text-ink2">Escreva o processo do jeito que você explicaria para alguém da equipe. A resposta da IA é validada antes de chegar ao canvas.</p>
        </div>
        <button type="button" onClick={() => ref.current?.close()} aria-label="Fechar" className="rounded-lg p-1.5 text-muted hover:bg-sunk hover:text-ink">
          <X size={18} />
        </button>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim() && !loading) run()
          }}
        >
          <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[12.5px] ${isDemo ? 'border-trig/40 bg-trig/[.07] text-ink2' : 'border-ok/40 bg-ok/[.06] text-ink2'}`} role="note">
            <ShieldAlert size={15} className={`mt-0.5 shrink-0 ${isDemo ? 'text-trig' : 'text-ok'}`} aria-hidden />
            <span>
              {isDemo ? (
                <>
                  <strong>Modo demonstração:</strong> regras locais leem frases comuns em português, sem chave e sem custo.{' '}
                  <button type="button" onClick={onOpenSettings} className="font-semibold text-ember underline underline-offset-2">
                    Usar o Claude
                  </button>
                </>
              ) : (
                <>
                  <strong>Claude</strong> ({provider.model}) via API da Anthropic, com resposta forçada em JSON por uso de ferramenta.
                </>
              )}
            </span>
          </div>
          <label htmlFor={ids.text} className="block text-[12.5px] font-medium text-ink2">
            O que deve acontecer?
          </label>
          <textarea
            id={ids.text}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={600}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                if (text.trim() && !loading) run()
              }
            }}
            className="w-full rounded-xl border border-line bg-surface p-3 text-[14px] leading-relaxed focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20"
          />
          <div>
            <p className="mb-1.5 text-[12px] text-muted">Exemplos</p>
            <div className="flex flex-col gap-1.5">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setText(ex)} className={`rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] leading-snug transition ${ex === text ? 'border-ember/60 bg-ember/[.05]' : 'border-line bg-surface hover:border-ink2/40'}`}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="submit" disabled={!text.trim() || loading} className="inline-flex items-center gap-2 rounded-xl bg-ember px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-40">
              {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
              {loading ? 'Montando…' : 'Montar fluxo'}
            </button>
            <button type="button" onClick={() => run(brokenProvider)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[12.5px] text-muted hover:bg-sunk hover:text-ink" title="Mostra como uma resposta fora do formato é rejeitada">
              <FlaskConical size={14} aria-hidden /> Testar resposta inválida
            </button>
          </div>
        </form>

        <section ref={resultRef} aria-live="polite" aria-label="Resultado" className="min-w-0">
          {!result && !loading && (
            <div className="grid h-full min-h-[14rem] place-items-center rounded-xl border border-dashed border-line p-6 text-center text-[13px] text-muted">
              <p>
                A prévia aparece aqui antes de qualquer mudança no canvas: o fluxo proposto, o que muda em relação ao atual e os problemas encontrados.
              </p>
            </div>
          )}
          {loading && (
            <div className="grid h-full min-h-[14rem] place-items-center rounded-xl border border-line bg-surface text-[13px] text-muted">
              <p className="inline-flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" aria-hidden /> Montando e validando…
              </p>
            </div>
          )}
          {result && !result.ok && (
            <div className="space-y-3 rounded-xl border border-bad/40 bg-bad/[.04] p-4">
              <p className="font-display font-semibold text-bad">
                {result.stage === 'formato' ? 'Resposta rejeitada: fora do formato esperado' : result.stage === 'recusa' ? 'Não deu para montar' : 'Falha ao chamar o provedor'}
              </p>
              <p className="text-[13px] text-ink2">{result.stage === 'formato' ? 'Nada foi aplicado. O canvas continua exatamente como estava.' : 'O canvas não foi alterado.'}</p>
              <ul className="space-y-1 font-mono text-[12px] text-ink">
                {result.errors.map((e, i) => (
                  <li key={i} className="rounded-md bg-surface px-2 py-1">
                    {e}
                  </li>
                ))}
              </ul>
              {result.raw != null && (
                <details className="group">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] font-medium text-muted">
                    <ChevronRight size={12} className="transition group-open:rotate-90" aria-hidden /> Resposta bruta
                  </summary>
                  <pre className="scroll-thin mt-1.5 max-h-56 overflow-auto rounded-lg bg-ink p-2.5 font-mono text-[11px] text-[#f5f0e7]">{typeof result.raw === 'string' ? result.raw : JSON.stringify(result.raw, null, 2)}</pre>
                </details>
              )}
            </div>
          )}
          {result?.ok && diff && (
            <div className="space-y-3">
              <div className="h-48 overflow-hidden rounded-xl border border-line bg-surface p-2 sm:h-56">
                <FlowPreview flow={result.flow} highlight={newIds} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                <span className="font-display text-[14px] font-semibold text-ink">{result.flow.name}</span>
                <span>
                  {result.flow.nodes.length} etapas · {result.ms} ms · {result.usage.estimated ? '~' : ''}
                  {result.usage.inputTokens + result.usage.outputTokens} tokens
                </span>
              </div>

              {result.notes.length > 0 && (
                <div>
                  <p className="mb-1 font-mono text-[10.5px] font-semibold uppercase tracking-[.08em] text-muted">Como entendi</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-[12.5px] text-ink2">
                    {result.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="mb-1 font-mono text-[10.5px] font-semibold uppercase tracking-[.08em] text-muted">
                  O que muda no canvas · +{diff.nodes.filter((c) => c.kind === 'nova').length} −{diff.nodes.filter((c) => c.kind === 'removida').length} ~{diff.nodes.filter((c) => c.kind === 'alterada').length}
                </p>
                <ul className="scroll-thin max-h-44 space-y-1 overflow-y-auto pr-1 text-[12.5px]">
                  {diff.nodes
                    .filter((c) => c.kind !== 'igual')
                    .map((c, i) => {
                      const Icon = c.kind === 'nova' ? Plus : c.kind === 'removida' ? Minus : Pencil
                      const cls = c.kind === 'nova' ? 'text-ok' : c.kind === 'removida' ? 'text-bad' : 'text-trig'
                      return (
                        <li key={i} className="flex gap-2 rounded-lg bg-surface px-2 py-1">
                          <Icon size={13} className={`mt-0.5 shrink-0 ${cls}`} aria-hidden />
                          <span className="min-w-0">
                            <span className="sr-only">{c.kind}: </span>
                            <span className={c.kind === 'removida' ? 'text-muted line-through' : ''}>{nodeTitle(c.node)}</span>
                            {c.kind === 'alterada' && (
                              <span className="block text-[11.5px] text-muted">
                                {c.fields.map((f) => `${f.label}: ${f.before ? `"${f.before}"` : 'vazio'} → ${f.after ? `"${f.after}"` : 'vazio'}`).join(' · ')}
                              </span>
                            )}
                          </span>
                        </li>
                      )
                    })}
                  {diff.same && <li className="text-muted">Nada muda: o fluxo proposto é igual ao atual.</li>}
                  {diff.nodes.filter((c) => c.kind === 'igual').length > 0 && <li className="px-2 text-[11.5px] text-muted">{diff.nodes.filter((c) => c.kind === 'igual').length} etapa(s) iguais às atuais.</li>}
                </ul>
              </div>

              {result.issues.length > 0 && (
                <ul className="space-y-1.5">
                  {result.issues.map((i, k) => (
                    <IssueItem key={k} issue={i} compact />
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  onClick={() => {
                    onApply(result.flow)
                    ref.current?.close()
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-[14px] font-semibold text-paper transition hover:bg-ink2"
                >
                  <Check size={16} aria-hidden /> Aplicar no canvas
                </button>
                <button type="button" onClick={() => setResult(null)} className="rounded-xl px-3 py-2.5 text-[13px] text-ink2 hover:bg-sunk">
                  Descartar
                </button>
                <p className="w-full text-[11.5px] text-muted">Aplicar substitui o fluxo atual. Ctrl+Z desfaz.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </dialog>
  )
}
