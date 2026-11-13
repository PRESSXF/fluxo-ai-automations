import { draftToFlow } from '../src/domain/schema'
import type { Flow, FlowDraft } from '../src/domain/types'

/** Monta um fluxo a partir de um rascunho curto, preenchendo o resto com padrões. */
export function flowOf(nodes: FlowDraft['nodes'], edges: Array<[string, string, ('out' | 'sim' | 'nao')?]>): Flow {
  return draftToFlow({ name: 'teste', nodes, edges: edges.map(([from, to, port]) => ({ from, to, port: port ?? 'out' })) })
}

export const pedidoComCondicao = () =>
  flowOf(
    [
      { id: 'g', type: 'gatilho.pedido', config: { canal: 'qualquer' } },
      { id: 'c', type: 'condicao', config: { campo: 'pedido.valor', operador: 'maior', valor: '200' } },
      { id: 'avisa', type: 'acao.notificar', config: { destinatario: 'Gerente', canal: 'whatsapp', texto: 'Pedido {{pedido.id}}' } },
      { id: 'msg', type: 'acao.mensagem', config: { canal: 'whatsapp', para: '{{cliente.telefone}}', texto: 'Oi, {{cliente.nome}}' } },
    ],
    [
      ['g', 'c'],
      ['c', 'avisa', 'sim'],
      ['c', 'msg', 'nao'],
      ['avisa', 'msg'],
    ],
  )
