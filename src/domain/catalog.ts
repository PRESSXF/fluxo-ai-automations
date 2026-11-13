import type { Category, ConfigValue, FlowNode, NodeType, Port } from './types'

export type FieldKind = 'text' | 'textarea' | 'number' | 'select' | 'time'

export interface FieldDef {
  key: string
  label: string
  kind: FieldKind
  required: boolean
  options?: Array<[string, string]>
  placeholder?: string
  help?: string
}

export interface NodeSpec {
  type: NodeType
  category: Category
  title: string
  /** Frase curta que explica a etapa para quem nunca usou uma ferramenta de automação. */
  blurb: string
  fields: FieldDef[]
  defaults: Record<string, ConfigValue>
  /** Saídas que a etapa oferece. Gatilhos e ações têm uma; condições têm duas; o fim não tem. */
  ports: Port[]
  /** Se a etapa aceita entrada. Gatilhos não aceitam: eles iniciam o fluxo. */
  hasInput: boolean
}

export const OPERATORS: Array<[string, string]> = [
  ['maior', 'maior que'],
  ['maior_igual', 'maior ou igual a'],
  ['menor', 'menor que'],
  ['menor_igual', 'menor ou igual a'],
  ['igual', 'igual a'],
  ['diferente', 'diferente de'],
  ['contem', 'contém'],
  ['nao_contem', 'não contém'],
  ['existe', 'está preenchido'],
]

export const OPERATOR_SYMBOL: Record<string, string> = {
  maior: '>',
  maior_igual: '≥',
  menor: '<',
  menor_igual: '≤',
  igual: '=',
  diferente: '≠',
  contem: 'contém',
  nao_contem: 'não contém',
  existe: 'preenchido',
}

export const NUMERIC_OPERATORS = new Set(['maior', 'maior_igual', 'menor', 'menor_igual'])

const CHANNELS: Array<[string, string]> = [
  ['whatsapp', 'WhatsApp'],
  ['email', 'E-mail'],
  ['sms', 'SMS'],
]

export const CATALOG: Record<NodeType, NodeSpec> = {
  'gatilho.whatsapp': {
    type: 'gatilho.whatsapp',
    category: 'gatilho',
    title: 'Mensagem recebida no WhatsApp',
    blurb: 'Começa quando um cliente manda mensagem para o número da empresa.',
    fields: [{ key: 'palavraChave', label: 'Só se a mensagem tiver', kind: 'text', required: false, placeholder: 'qualquer mensagem', help: 'Deixe vazio para disparar com qualquer mensagem.' }],
    defaults: { palavraChave: '' },
    ports: ['out'],
    hasInput: false,
  },
  'gatilho.pedido': {
    type: 'gatilho.pedido',
    category: 'gatilho',
    title: 'Pedido criado',
    blurb: 'Começa quando entra um pedido novo, do site, de app de entrega ou do balcão.',
    fields: [
      {
        key: 'canal',
        label: 'Canal do pedido',
        kind: 'select',
        required: true,
        options: [
          ['qualquer', 'Qualquer canal'],
          ['site', 'Site próprio'],
          ['app', 'App de entrega'],
          ['balcao', 'Balcão'],
        ],
      },
    ],
    defaults: { canal: 'qualquer' },
    ports: ['out'],
    hasInput: false,
  },
  'gatilho.agendamento': {
    type: 'gatilho.agendamento',
    category: 'gatilho',
    title: 'Agendamento marcado',
    blurb: 'Começa quando alguém marca um horário na agenda.',
    fields: [{ key: 'agenda', label: 'Agenda', kind: 'text', required: false, placeholder: 'todas as agendas' }],
    defaults: { agenda: '' },
    ports: ['out'],
    hasInput: false,
  },
  'gatilho.horario': {
    type: 'gatilho.horario',
    category: 'gatilho',
    title: 'Horário programado',
    blurb: 'Começa sozinho no horário escolhido, todo dia ou só em dias úteis.',
    fields: [
      { key: 'hora', label: 'Horário', kind: 'time', required: true },
      {
        key: 'dias',
        label: 'Dias',
        kind: 'select',
        required: true,
        options: [
          ['todos', 'Todos os dias'],
          ['uteis', 'Dias úteis'],
        ],
      },
    ],
    defaults: { hora: '09:00', dias: 'todos' },
    ports: ['out'],
    hasInput: false,
  },
  condicao: {
    type: 'condicao',
    category: 'condicao',
    title: 'Condição',
    blurb: 'Divide o caminho em dois: o que fazer se a regra for verdadeira e o que fazer se não for.',
    fields: [
      { key: 'campo', label: 'Campo', kind: 'text', required: true, placeholder: 'pedido.valor', help: 'Caminho do dado no evento ou num resultado anterior, como classificacao.categoria.' },
      { key: 'operador', label: 'Regra', kind: 'select', required: true, options: OPERATORS },
      { key: 'valor', label: 'Valor', kind: 'text', required: true, placeholder: '200' },
    ],
    defaults: { campo: '', operador: 'maior', valor: '' },
    ports: ['sim', 'nao'],
    hasInput: true,
  },
  'acao.mensagem': {
    type: 'acao.mensagem',
    category: 'acao',
    title: 'Enviar mensagem',
    blurb: 'Manda uma mensagem para o cliente. Use {{campo}} para incluir dados do evento.',
    fields: [
      { key: 'canal', label: 'Canal', kind: 'select', required: true, options: CHANNELS },
      { key: 'para', label: 'Para', kind: 'text', required: true, placeholder: '{{cliente.telefone}}' },
      { key: 'texto', label: 'Texto', kind: 'textarea', required: true, placeholder: 'Oi, {{cliente.nome}}!' },
    ],
    defaults: { canal: 'whatsapp', para: '{{cliente.telefone}}', texto: '' },
    ports: ['out'],
    hasInput: true,
  },
  'acao.notificar': {
    type: 'acao.notificar',
    category: 'acao',
    title: 'Notificar equipe',
    blurb: 'Avisa alguém da equipe, como o gerente ou a cozinha.',
    fields: [
      { key: 'destinatario', label: 'Quem recebe', kind: 'text', required: true, placeholder: 'Gerente' },
      { key: 'canal', label: 'Canal', kind: 'select', required: true, options: CHANNELS },
      { key: 'texto', label: 'Aviso', kind: 'textarea', required: true },
    ],
    defaults: { destinatario: 'Gerente', canal: 'whatsapp', texto: '' },
    ports: ['out'],
    hasInput: true,
  },
  'acao.tarefa': {
    type: 'acao.tarefa',
    category: 'acao',
    title: 'Criar tarefa',
    blurb: 'Cria uma tarefa na lista da equipe, com responsável e prazo.',
    fields: [
      { key: 'titulo', label: 'Título', kind: 'text', required: true },
      { key: 'responsavel', label: 'Responsável', kind: 'text', required: false, placeholder: 'Equipe' },
      { key: 'prazoHoras', label: 'Prazo (horas)', kind: 'number', required: false },
    ],
    defaults: { titulo: '', responsavel: 'Equipe', prazoHoras: 4 },
    ports: ['out'],
    hasInput: true,
  },
  'acao.planilha': {
    type: 'acao.planilha',
    category: 'acao',
    title: 'Atualizar planilha',
    blurb: 'Adiciona uma linha numa planilha, com colunas separadas por ponto e vírgula.',
    fields: [
      { key: 'planilha', label: 'Planilha', kind: 'text', required: true, placeholder: 'Pedidos do mês' },
      { key: 'linha', label: 'Colunas da linha', kind: 'textarea', required: true, placeholder: '{{pedido.id}}; {{pedido.valor}}', help: 'Separe as colunas com ponto e vírgula.' },
    ],
    defaults: { planilha: '', linha: '' },
    ports: ['out'],
    hasInput: true,
  },
  'ia.classificar': {
    type: 'ia.classificar',
    category: 'ia',
    title: 'Classificar com IA',
    blurb: 'A IA lê um texto e escolhe uma das categorias. O resultado pode ser usado numa condição.',
    fields: [
      { key: 'texto', label: 'Texto a classificar', kind: 'textarea', required: true, placeholder: '{{mensagem.texto}}' },
      { key: 'categorias', label: 'Categorias', kind: 'text', required: true, placeholder: 'reclamação, dúvida, elogio', help: 'Separe por vírgula. A IA só pode escolher uma destas.' },
      { key: 'salvarEm', label: 'Guardar resultado em', kind: 'text', required: true, placeholder: 'classificacao' },
    ],
    defaults: { texto: '{{mensagem.texto}}', categorias: 'reclamação, dúvida, elogio, pedido', salvarEm: 'classificacao' },
    ports: ['out'],
    hasInput: true,
  },
  'ia.resumir': {
    type: 'ia.resumir',
    category: 'ia',
    title: 'Resumir com IA',
    blurb: 'A IA resume um texto longo em poucas linhas para a equipe ler rápido.',
    fields: [
      { key: 'texto', label: 'Texto a resumir', kind: 'textarea', required: true },
      { key: 'salvarEm', label: 'Guardar resultado em', kind: 'text', required: true, placeholder: 'resumo' },
    ],
    defaults: { texto: '', salvarEm: 'resumo' },
    ports: ['out'],
    hasInput: true,
  },
  'controle.esperar': {
    type: 'controle.esperar',
    category: 'controle',
    title: 'Esperar',
    blurb: 'Pausa o fluxo por um tempo antes da próxima etapa.',
    fields: [{ key: 'minutos', label: 'Minutos', kind: 'number', required: true, help: '60 = 1 hora · 1440 = 1 dia' }],
    defaults: { minutos: 30 },
    ports: ['out'],
    hasInput: true,
  },
  'controle.fim': {
    type: 'controle.fim',
    category: 'controle',
    title: 'Encerrar',
    blurb: 'Termina o caminho sem fazer nada. Use para deixar claro que um lado da condição não precisa de ação.',
    fields: [],
    defaults: {},
    ports: [],
    hasInput: true,
  },
}

export const NODE_TYPES = Object.keys(CATALOG) as NodeType[]

export const isNodeType = (t: unknown): t is NodeType => typeof t === 'string' && t in CATALOG

export const isTrigger = (t: NodeType) => CATALOG[t].category === 'gatilho'

export const PORT_LABEL: Record<Port, string> = { out: 'próximo', sim: 'se sim', nao: 'se não' }

export function nodeTitle(n: Pick<FlowNode, 'type' | 'label'>) {
  return n.label?.trim() || CATALOG[n.type].title
}

/** Resumo de uma linha da configuração, mostrado no cartão do canvas e na lista. */
export function nodeSummary(n: Pick<FlowNode, 'type' | 'config'>): string {
  const c = n.config
  const s = (k: string) => String(c[k] ?? '').trim()
  switch (n.type) {
    case 'gatilho.whatsapp':
      return s('palavraChave') ? `com "${s('palavraChave')}"` : 'qualquer mensagem'
    case 'gatilho.pedido':
      return CATALOG['gatilho.pedido'].fields[0].options!.find(([v]) => v === s('canal'))?.[1] ?? 'qualquer canal'
    case 'gatilho.agendamento':
      return s('agenda') || 'todas as agendas'
    case 'gatilho.horario':
      return `${s('hora') || '--:--'} · ${s('dias') === 'uteis' ? 'dias úteis' : 'todos os dias'}`
    case 'condicao':
      if (!s('campo')) return 'regra não definida'
      return s('operador') === 'existe' ? `${s('campo')} preenchido` : `${s('campo')} ${OPERATOR_SYMBOL[s('operador')] ?? '?'} ${s('valor') || '?'}`
    case 'acao.mensagem':
      return s('texto') || 'sem texto'
    case 'acao.notificar':
      return `${s('destinatario') || '?'}: ${s('texto') || 'sem texto'}`
    case 'acao.tarefa':
      return s('titulo') || 'sem título'
    case 'acao.planilha':
      return s('planilha') || 'planilha não definida'
    case 'ia.classificar':
      return s('categorias') || 'sem categorias'
    case 'ia.resumir':
      return `guarda em ${s('salvarEm') || '?'}`
    case 'controle.esperar':
      return formatMinutes(Number(c.minutos))
    case 'controle.fim':
      return 'nada mais a fazer'
  }
}

export function formatMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return 'tempo não definido'
  if (min % 1440 === 0) return min === 1440 ? '1 dia' : `${min / 1440} dias`
  if (min % 60 === 0) return min === 60 ? '1 hora' : `${min / 60} horas`
  if (min > 60) return `${Math.floor(min / 60)} h ${min % 60} min`
  return `${min} min`
}
