import { draftToFlow, parseFlowDraft } from '../domain/schema'
import type { Flow } from '../domain/types'
import { validateFlow, type Issue } from '../domain/validate'
import type { Provider, Usage } from './types'

export type GenerateResult =
  | { ok: true; flow: Flow; issues: Issue[]; raw: unknown; notes: string[]; usage: Usage; ms: number }
  | { ok: false; stage: 'provedor' | 'recusa' | 'formato'; errors: string[]; raw: unknown; notes: string[]; usage?: Usage; ms: number }

/**
 * Pipeline "descreva e a IA monta":
 *   provedor → JSON bruto → validação de formato → fluxo com layout → validação do grafo.
 * Só um fluxo que passou pela validação de formato chega à interface. Problemas
 * de grafo (por exemplo, uma condição sem "senão") não impedem a prévia, mas aparecem nela.
 */
export async function generateFlow(provider: Provider, description: string, signal?: AbortSignal): Promise<GenerateResult> {
  const t0 = performance.now()
  const ms = () => Math.round(performance.now() - t0)
  let res
  try {
    res = await provider.buildFlow(description, signal)
  } catch (e) {
    return { ok: false, stage: 'provedor', errors: [(e as Error).message], raw: null, notes: [], ms: ms() }
  }
  if (res.refusal) return { ok: false, stage: 'recusa', errors: [res.refusal], raw: res.raw, notes: res.notes, usage: res.usage, ms: ms() }
  const parsed = parseFlowDraft(res.raw)
  if (!parsed.ok) return { ok: false, stage: 'formato', errors: parsed.errors, raw: res.raw, notes: res.notes, usage: res.usage, ms: ms() }
  const flow = draftToFlow(parsed.value, `ia-${Date.now().toString(36)}`)
  return { ok: true, flow, issues: validateFlow(flow), raw: res.raw, notes: res.notes, usage: res.usage, ms: ms() }
}
