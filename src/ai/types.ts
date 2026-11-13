import type { AiRuntime } from '../domain/engine'

export interface Usage {
  inputTokens: number
  outputTokens: number
  /** true quando os tokens são estimados (modo demonstração). */
  estimated: boolean
}

export interface BuildResponse {
  /** O que o modelo devolveu, antes de qualquer validação. Pode ser qualquer coisa. */
  raw: unknown
  /** Quando o provedor não consegue montar um fluxo, explica o motivo aqui. */
  refusal?: string
  /** Observações de como o pedido foi interpretado. */
  notes: string[]
  usage: Usage
}

/**
 * Um provedor sabe montar um fluxo a partir de uma descrição e executar as
 * etapas de IA do simulador. O resto do sistema não sabe qual modelo está por trás.
 */
export interface Provider extends AiRuntime {
  id: 'demo' | 'anthropic'
  label: string
  model: string
  buildFlow(description: string, signal?: AbortSignal): Promise<BuildResponse>
}
