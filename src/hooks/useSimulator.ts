import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { executeFlow, type AiRuntime, type RunSummary, type StepRecord } from '../domain/engine'
import type { Flow } from '../domain/types'

type Phase = 'parado' | 'rodando' | 'pausado' | 'fim'

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Controla o simulador: guarda o gerador do motor e avança uma etapa por vez,
 * ou todas com um pequeno intervalo para dar para acompanhar no canvas.
 */
export function useSimulator(flow: Flow, ai: AiRuntime) {
  const [steps, setSteps] = useState<StepRecord[]>([])
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [phase, setPhase] = useState<Phase>('parado')
  const [busy, setBusy] = useState(false)
  const iter = useRef<AsyncGenerator<StepRecord, RunSummary, void> | null>(null)
  const abort = useRef<AbortController | null>(null)
  const token = useRef(0)

  const reset = useCallback(() => {
    token.current++
    abort.current?.abort()
    iter.current = null
    setSteps([])
    setSummary(null)
    setPhase('parado')
    setBusy(false)
  }, [])

  // Editar a lógica do fluxo invalida a simulação. Só mover etapas no canvas, não.
  const logicKey = useMemo(() => JSON.stringify([flow.nodes.map((n) => [n.id, n.type, n.config]), flow.edges]), [flow.nodes, flow.edges])
  useEffect(() => {
    reset()
  }, [logicKey, ai, reset])

  const ensureIter = useCallback(
    (event: Record<string, unknown>) => {
      if (!iter.current) {
        abort.current = new AbortController()
        iter.current = executeFlow(flow, event, ai, { signal: abort.current.signal })
        setSteps([])
        setSummary(null)
      }
      return iter.current
    },
    [flow, ai],
  )

  const advance = useCallback(
    async (event: Record<string, unknown>): Promise<boolean> => {
      const my = token.current
      const it = ensureIter(event)
      setBusy(true)
      const r = await it.next()
      if (my !== token.current) return false
      setBusy(false)
      if (r.done) {
        setSummary(r.value)
        setPhase('fim')
        iter.current = null
        return false
      }
      setSteps((s) => [...s, r.value])
      setPhase('pausado')
      return true
    },
    [ensureIter],
  )

  const step = useCallback((event: Record<string, unknown>) => advance(event), [advance])

  const runAll = useCallback(
    async (event: Record<string, unknown>) => {
      if (phase === 'fim') reset()
      const my = ++token.current
      setPhase('rodando')
      const delay = reducedMotion() ? 0 : 420
      for (;;) {
        if (my !== token.current) return
        const more = await advance(event)
        if (!more || my !== token.current) return
        setPhase('rodando')
        if (delay) await new Promise((r) => setTimeout(r, delay))
      }
    },
    [advance, phase, reset],
  )

  const activeNodeId = phase === 'fim' ? undefined : steps.at(-1)?.nodeId
  const visual = useMemo(() => {
    const nodes = new Map<string, StepRecord['status']>()
    const edges = new Set<string>()
    for (const s of steps) {
      nodes.set(s.nodeId, s.status)
      if (s.nextId) edges.add(`${s.nodeId}:${s.branch ?? 'out'}->${s.nextId}`)
    }
    return { nodes, edges }
  }, [steps])

  return { steps, summary, phase, busy, step, runAll, reset, activeNodeId, visual }
}

export type Simulator = ReturnType<typeof useSimulator>
