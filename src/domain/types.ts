/**
 * Modelo de dados de um fluxo. Tudo aqui é TypeScript puro: nada de React,
 * nada de IA. A interface, o simulador e o provedor de IA só falam com estes tipos.
 */

export type Category = 'gatilho' | 'condicao' | 'acao' | 'ia' | 'controle'

export type NodeType =
  | 'gatilho.whatsapp'
  | 'gatilho.pedido'
  | 'gatilho.agendamento'
  | 'gatilho.horario'
  | 'condicao'
  | 'acao.mensagem'
  | 'acao.notificar'
  | 'acao.tarefa'
  | 'acao.planilha'
  | 'ia.classificar'
  | 'ia.resumir'
  | 'controle.esperar'
  | 'controle.fim'

/** Saídas possíveis de uma etapa. Condições usam `sim` e `nao`; as demais usam `out`. */
export type Port = 'out' | 'sim' | 'nao'

export type ConfigValue = string | number

export interface Position {
  x: number
  y: number
}

export interface FlowNode {
  id: string
  type: NodeType
  position: Position
  config: Record<string, ConfigValue>
  /** Título opcional escolhido pelo usuário. Sem ele, a interface usa o nome do tipo. */
  label?: string
}

export interface FlowEdge {
  id: string
  from: string
  to: string
  port: Port
}

export interface Flow {
  version: 1
  id: string
  name: string
  description?: string
  nodes: FlowNode[]
  edges: FlowEdge[]
}

/** Fluxo sem posições, no formato que a IA devolve. O layout é calculado depois. */
export interface FlowDraft {
  name: string
  description?: string
  nodes: Array<Omit<FlowNode, 'position'> & { position?: Position }>
  edges: Array<Omit<FlowEdge, 'id'> & { id?: string }>
}
