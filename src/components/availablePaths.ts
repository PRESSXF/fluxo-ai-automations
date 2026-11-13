import { EVENT_FIELDS } from '../ai/prompt'
import { isTrigger } from '../domain/catalog'
import type { Flow } from '../domain/types'

/** Caminhos de dados que fazem sentido em {{...}} para o gatilho atual e para as etapas de IA do fluxo. */
export function availablePaths(flow: Flow): string[] {
  const trig = flow.nodes.find((n) => isTrigger(n.type))
  const base = trig ? (EVENT_FIELDS[trig.type] ?? '').split(',').map((s) => s.trim().split(' ')[0]) : []
  const extra = flow.nodes.flatMap((n) => (n.type === 'ia.classificar' ? [`${n.config.salvarEm}.categoria`] : n.type === 'ia.resumir' ? [String(n.config.salvarEm)] : []))
  return [...base, ...extra].filter(Boolean)
}
