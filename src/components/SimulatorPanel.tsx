import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronRight, CircleSlash, Clock, Play, RotateCcw, StepForward, X } from 'lucide-react'
import { formatMinutes, isTrigger } from '../domain/catalog'
import type { StepRecord } from '../domain/engine'
import { presetsFor } from '../domain/templates'
import type { Flow } from '../domain/types'
import { hasErrors, type Issue } from '../domain/validate'
import type { Simulator } from '../hooks/useSimulator'

interface Props {
  flow: Flow
  issues: Issue[]
  sim: Simulator
  providerLabel: string
  /** Muda de valor quando o atalho Ctrl+Enter pede para rodar. */
  runSignal: number
  onSelectNode: (id: string) => void
  onShowIssues: () => void
}

const STATUS = {
  ok: { icon: Check, cls: 'bg-ok text-white', label: 'ok' },
  aviso: { icon: AlertTriangle, cls: 'bg-warn text-white', label: 'aviso' },
  erro: { icon: X, cls: 'bg-bad text-white', label: 'erro' },
  ignorado: { icon: CircleSlash, cls: 'bg-muted text-white', label: 'não disparou' },
} as const

function Json({ value }: { value: unknown }) {
  return <pre className="scroll-thin max-h-48 overflow-auto rounded-lg bg-ink px-2.5 py-2 font-mono text-[11px] leading-relaxed text-[#f5f0e7]">{JSON.stringify(value, null, 2)}</pre>
}

function StepItem({ s, onSelect }: { s: StepRecord; onSelect: (id: string) => void }) {
  const st = STATUS[s.status]
  const Icon = st.icon
  return (
    <li className="relative animate-rise pl-8">
      <span className={`absolute left-0 top-0.5 grid size-6 place-items-center rounded-full ${st.cls}`} aria-hidden>
        <Icon size={13} strokeWidth={3} />
      </span>
      <div className="rounded-xl border border-line bg-surface p-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <button type="button" onClick={() => onSelect(s.nodeId)} className="font-display text-[13.5px] font-semibold hover:text-ember hover:underline">
            {s.index + 1}. {s.title}
          </button>
          <span className="sr-only">Status: {st.label}.</span>
          {s.branch && <span className={`rounded-full px-1.5 py-px font-mono text-[10.5px] font-semibold ${s.branch === 'sim' ? 'bg-ok/10 text-ok' : 'bg-bad/10 text-bad'}`}>seguiu: {s.branch === 'sim' ? 'se sim' : 'se não'}</span>}
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10.5px] text-muted" title="Tempo simulado desde o disparo">
            <Clock size={11} aria-hidden /> {s.clock ? `+${formatMinutes(s.clock)}` : 't0'}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] leading-snug text-ink2">{s.message}</p>
        {s.warnings.map((w, i) => (
          <p key={i} className="mt-1 text-[12px] text-warn">
            {w}
          </p>
        ))}
        {(Object.keys(s.input).length > 0 || s.output) && (
          <details className="group mt-1.5">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11.5px] font-medium text-muted hover:text-ink">
              <ChevronRight size={12} className="transition group-open:rotate-90" aria-hidden /> Entrada e saída
            </summary>
            <div className="mt-1.5 grid gap-1.5">
              <div>
                <p className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">entrada</p>
                <Json value={s.input} />
              </div>
              {s.output && (
                <div>
                  <p className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">saída</p>
                  <Json value={s.output} />
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </li>
  )
}

export function SimulatorPanel({ flow, issues, sim, providerLabel, runSignal, onSelectNode, onShowIssues }: Props) {
  const trigger = flow.nodes.find((n) => isTrigger(n.type))
  const presets = useMemo(() => presetsFor(trigger?.type), [trigger?.type])
  const [presetId, setPresetId] = useState(presets[0]?.id ?? '')
  const [text, setText] = useState(() => JSON.stringify(presets[0]?.payload ?? {}, null, 2))
  const ids = { preset: useId(), payload: useId() }
  const listRef = useRef<HTMLDivElement>(null)

  // Trocar de gatilho troca os exemplos.
  useEffect(() => {
    setPresetId(presets[0]?.id ?? '')
    setText(JSON.stringify(presets[0]?.payload ?? {}, null, 2))
  }, [presets])

  const parsed = useMemo((): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } => {
    try {
      const v = JSON.parse(text)
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return { ok: false, error: 'O evento precisa ser um objeto JSON, entre chaves.' }
      return { ok: true, value: v }
    } catch (e) {
      return { ok: false, error: `JSON inválido: ${(e as Error).message}` }
    }
  }, [text])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [sim.steps.length, sim.summary])

  const blocked = hasErrors(issues)
  const errCount = issues.filter((i) => i.severity === 'erro').length
  const canRun = !blocked && parsed.ok && !sim.busy && sim.phase !== 'rodando'

  const lastSignal = useRef(runSignal)
  useEffect(() => {
    if (runSignal === lastSignal.current) return
    lastSignal.current = runSignal
    if (canRun && parsed.ok) sim.runAll(parsed.value)
  }, [runSignal, canRun, parsed, sim])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-line p-4">
        {blocked ? (
          <div className="rounded-xl border border-bad/30 bg-bad/[.04] p-3 text-[13px]">
            <p className="font-medium text-bad">
              O fluxo tem {errCount} erro{errCount > 1 ? 's' : ''} e não pode rodar.
            </p>
            <button type="button" onClick={onShowIssues} className="mt-1 font-semibold text-ember underline underline-offset-2">
              Ver o que corrigir
            </button>
          </div>
        ) : (
          <p className="text-[12.5px] leading-snug text-ink2">
            Roda o fluxo com um evento de exemplo. Nada é enviado de verdade; esperas são avançadas na hora. Etapas de IA usam: <strong>{providerLabel}</strong>.
          </p>
        )}

        {presets.length > 0 && (
          <div>
            <label htmlFor={ids.preset} className="mb-1 block text-[12px] font-medium text-ink2">
              Evento de exemplo
            </label>
            <select
              id={ids.preset}
              value={presetId}
              onChange={(e) => {
                const p = presets.find((x) => x.id === e.target.value)
                setPresetId(e.target.value)
                if (p) setText(JSON.stringify(p.payload, null, 2))
                sim.reset()
              }}
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20"
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] font-medium text-ink2 hover:text-ink">
            <ChevronRight size={13} className="transition group-open:rotate-90" aria-hidden /> Editar o evento (JSON)
          </summary>
          <label htmlFor={ids.payload} className="sr-only">
            Evento em JSON
          </label>
          <textarea
            id={ids.payload}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              sim.reset()
            }}
            spellCheck={false}
            rows={9}
            aria-invalid={!parsed.ok || undefined}
            aria-describedby={!parsed.ok ? `${ids.payload}-err` : undefined}
            className="scroll-thin mt-1.5 w-full rounded-lg border border-line bg-ink p-2.5 font-mono text-[11.5px] leading-relaxed text-[#f5f0e7] focus:border-ember focus:outline-none"
          />
          {!parsed.ok && (
            <p id={`${ids.payload}-err`} className="mt-1 text-[12px] text-bad" role="alert">
              {parsed.error}
            </p>
          )}
        </details>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canRun}
            onClick={() => parsed.ok && sim.runAll(parsed.value)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ember px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play size={14} aria-hidden /> Rodar tudo
          </button>
          <button
            type="button"
            disabled={!canRun}
            onClick={() => {
              if (!parsed.ok) return
              if (sim.phase === 'fim') sim.reset()
              sim.step(parsed.value)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink2 transition hover:bg-sunk disabled:cursor-not-allowed disabled:opacity-40"
          >
            <StepForward size={14} aria-hidden /> Próximo passo
          </button>
          {sim.phase !== 'parado' && (
            <button type="button" onClick={sim.reset} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] text-muted hover:bg-sunk hover:text-ink">
              <RotateCcw size={14} aria-hidden /> Limpar
            </button>
          )}
        </div>
      </div>

      <div ref={listRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4" aria-live="polite">
        {sim.steps.length === 0 && !sim.summary && <p className="text-[12.5px] text-muted">A linha do tempo aparece aqui, uma etapa por vez, com o que entrou e o que saiu de cada uma.</p>}
        <ol className="relative space-y-2.5 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-line" aria-label="Linha do tempo da simulação">
          {sim.steps.map((s) => (
            <StepItem key={s.index} s={s} onSelect={onSelectNode} />
          ))}
        </ol>
        {sim.busy && <p className="mt-2 pl-8 text-[12px] text-muted">executando…</p>}
        {sim.summary && (
          <div
            className={`mt-3 rounded-xl border p-3 text-[13px] ${sim.summary.status === 'concluido' ? 'border-ok/40 bg-ok/[.06]' : sim.summary.status === 'ignorado' ? 'border-line bg-sunk' : 'border-bad/40 bg-bad/[.05]'}`}
            role="status"
          >
            <p className="font-display font-semibold">
              {sim.summary.status === 'concluido' ? 'Concluído' : sim.summary.status === 'ignorado' ? 'Não disparou' : sim.summary.status === 'bloqueado' ? 'Bloqueado' : 'Parou com erro'}
            </p>
            <p className="mt-0.5 text-ink2">{sim.summary.message}</p>
          </div>
        )}
      </div>
    </div>
  )
}
