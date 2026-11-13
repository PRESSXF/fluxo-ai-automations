import { CATALOG, NODE_TYPES } from '../domain/catalog'

/** Campos de dados que cada gatilho entrega. O modelo usa estes caminhos em {{...}} e nas condições. */
export const EVENT_FIELDS: Record<string, string> = {
  'gatilho.pedido': 'pedido.id, pedido.valor (número em reais), pedido.canal, pedido.itens, pedido.observacao, cliente.nome, cliente.telefone, cliente.email',
  'gatilho.whatsapp': 'mensagem.texto, cliente.nome, cliente.telefone',
  'gatilho.agendamento': 'agendamento.data, agendamento.hora, agendamento.procedimento, agendamento.primeiraConsulta ("sim" ou "não"), paciente.nome, paciente.telefone, paciente.email',
  'gatilho.horario': 'vendasOntem.data, vendasOntem.total, vendasOntem.pedidos, vendasOntem.comentarios',
}

function catalogText() {
  return NODE_TYPES.map((t) => {
    const s = CATALOG[t]
    const fields = s.fields
      .map((f) => `${f.key}${f.required ? '' : '?'}: ${f.kind === 'number' ? 'número' : f.options ? f.options.map(([v]) => `"${v}"`).join(' | ') : 'texto'}`)
      .join('; ')
    const ports = s.ports.length ? s.ports.join(', ') : 'nenhuma'
    return `- ${t} (${s.title}). ${s.blurb} Config: { ${fields || 'vazio'} }. Saídas: ${ports}.`
  }).join('\n')
}

export const BUILD_SYSTEM = `Você transforma a descrição de um processo de um pequeno negócio brasileiro em um fluxo de automação.
Responda sempre chamando a ferramenta montar_fluxo. Nunca responda em texto.

Tipos de etapa disponíveis:
${catalogText()}

Dados disponíveis por gatilho (use em {{caminho}} nos textos e no campo "campo" das condições):
${Object.entries(EVENT_FIELDS)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}
Depois de "ia.classificar" com salvarEm "classificacao", existe classificacao.categoria. Depois de "ia.resumir" com salvarEm "resumo", existe {{resumo}}.

Regras:
1. Exatamente um gatilho, e ele é a primeira etapa.
2. Ligações (edges) usam "port": "out" para gatilhos e ações; condições usam "sim" e "nao", e as duas precisam estar ligadas.
3. Se a descrição não diz o que fazer quando a regra é falsa, ligue "nao" a uma etapa controle.fim com label "Nada a fazer".
4. Cada saída liga a uma etapa só. Para fazer várias coisas, encadeie as ações em sequência.
5. Sem ciclos.
6. Para regras sobre o tipo de mensagem (reclamação, dúvida etc.), coloque ia.classificar antes e compare classificacao.categoria com "igual".
7. Valores de dinheiro em condições são só o número: "200", não "R$ 200".
8. Esperas em minutos: 1 hora = 60, 1 dia = 1440.
9. Ids curtos em snake_case. Textos de mensagem em português, curtos e cordiais.
10. Não invente etapas que a descrição não pede, exceto o ia.classificar da regra 6 e o controle.fim da regra 3.`

export const BUILD_TOOL = {
  name: 'montar_fluxo',
  description: 'Entrega o fluxo de automação montado a partir da descrição.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nome curto do fluxo, até 80 caracteres.' },
      description: { type: 'string' },
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: NODE_TYPES },
            label: { type: 'string' },
            config: { type: 'object', additionalProperties: { type: ['string', 'number'] } },
          },
          required: ['id', 'type', 'config'],
        },
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            port: { type: 'string', enum: ['out', 'sim', 'nao'] },
          },
          required: ['from', 'to', 'port'],
        },
      },
    },
    required: ['name', 'nodes', 'edges'],
  },
} as const

export const CLASSIFY_SYSTEM = 'Você classifica mensagens de clientes de pequenos negócios. Escolha exatamente uma categoria da lista e explique em uma frase curta. Responda chamando a ferramenta classificar.'

export function classifyTool(categories: string[]) {
  return {
    name: 'classificar',
    description: 'Registra a categoria escolhida.',
    input_schema: {
      type: 'object',
      properties: {
        categoria: { type: 'string', enum: categories },
        confianca: { type: 'number', description: 'De 0 a 1.' },
        motivo: { type: 'string' },
      },
      required: ['categoria', 'confianca', 'motivo'],
    },
  }
}

export const SUMMARY_SYSTEM = 'Resuma o texto em português, em no máximo duas frases curtas, para alguém da equipe ler no celular. Só o resumo, sem introdução.'
