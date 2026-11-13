import type { Flow, NodeType } from '../domain/types'

export interface ExtraCheck {
  label: string
  why: string
  test: (flow: Flow) => boolean
}

export interface EvalCase {
  id: string
  segment: string
  description: string
  expect: {
    trigger: NodeType
    triggerConfig?: Record<string, string | number>
    condition?: { campo: string; operador: string; valor: string }
    /** Etapas entre o gatilho e a condição (ou o fluxo inteiro, sem condição). */
    before: NodeType[]
    sim?: NodeType[]
    nao?: NodeType[]
  }
  extra?: ExtraCheck[]
}

const node = (f: Flow, type: NodeType, i = 0) => f.nodes.filter((n) => n.type === type)[i]

/**
 * Descrições reais de donos de negócio, do jeito que eles escrevem, e a estrutura
 * mínima que o fluxo precisa ter. Não comparamos ids nem textos exatos: um modelo
 * real escreve mensagens diferentes e isso é desejável.
 */
export const CASES: EvalCase[] = [
  {
    id: 'pedido-acima-200',
    segment: 'Restaurante',
    description: 'Quando chegar um pedido acima de R$ 200, avise o gerente no WhatsApp e crie uma tarefa de conferência',
    expect: {
      trigger: 'gatilho.pedido',
      condition: { campo: 'pedido.valor', operador: 'maior', valor: '200' },
      before: [],
      sim: ['acao.notificar', 'acao.tarefa'],
      nao: ['controle.fim'],
    },
    extra: [
      { label: 'Avisa o gerente pelo WhatsApp', why: 'Avisar a pessoa errada ou pelo canal errado é o mesmo que não avisar.', test: (f) => /gerente/i.test(String(node(f, 'acao.notificar')?.config.destinatario)) && node(f, 'acao.notificar')?.config.canal === 'whatsapp' },
      { label: 'Tarefa fala em conferência', why: 'A equipe precisa saber o que fazer só de ler o título.', test: (f) => /confer/i.test(String(node(f, 'acao.tarefa')?.config.titulo)) },
    ],
  },
  {
    id: 'triagem-reclamacao',
    segment: 'Loja',
    description: 'Quando um cliente mandar mensagem no WhatsApp, classifique com IA; se for reclamação, notifique o atendimento e crie uma tarefa; senão, responda que já vamos atender',
    expect: {
      trigger: 'gatilho.whatsapp',
      condition: { campo: 'classificacao.categoria', operador: 'igual', valor: 'reclamação' },
      before: ['ia.classificar'],
      sim: ['acao.notificar', 'acao.tarefa'],
      nao: ['acao.mensagem'],
    },
    extra: [
      { label: 'Classificação pode escolher "reclamação"', why: 'Se a categoria não está na lista, a condição nunca seria verdadeira.', test: (f) => /reclama[cç][aã]o/i.test(String(node(f, 'ia.classificar')?.config.categorias)) },
      { label: 'Resposta vai para o telefone do cliente', why: 'Mensagem sem destino certo falha em produção.', test: (f) => String(node(f, 'acao.mensagem')?.config.para).includes('cliente.telefone') },
    ],
  },
  {
    id: 'agendamento-lembrete',
    segment: 'Clínica',
    description: 'Quando um agendamento for marcado, envie uma confirmação para o paciente, espere 1 dia e mande um lembrete',
    expect: { trigger: 'gatilho.agendamento', before: ['acao.mensagem', 'controle.esperar', 'acao.mensagem'] },
    extra: [
      { label: 'Espera de 1 dia (1440 min)', why: 'Lembrete fora de hora não reduz falta.', test: (f) => Number(node(f, 'controle.esperar')?.config.minutos) === 1440 },
      { label: 'Mensagens vão para o paciente', why: 'Na clínica o contato é do paciente, não de um "cliente".', test: (f) => f.nodes.filter((n) => n.type === 'acao.mensagem').every((n) => String(n.config.para).includes('paciente')) },
    ],
  },
  {
    id: 'resumo-diario',
    segment: 'Restaurante',
    description: 'Todo dia às 8h, resuma as vendas de ontem com IA e envie para o dono por e-mail',
    expect: { trigger: 'gatilho.horario', triggerConfig: { hora: '08:00', dias: 'todos' }, before: ['ia.resumir', 'acao.notificar'] },
    extra: [
      { label: 'Dono recebe por e-mail', why: 'O canal foi pedido explicitamente.', test: (f) => /dono/i.test(String(node(f, 'acao.notificar')?.config.destinatario)) && node(f, 'acao.notificar')?.config.canal === 'email' },
      { label: 'Aviso usa o resumo', why: 'Resumir e não enviar o resumo desperdiça a etapa de IA.', test: (f) => String(node(f, 'acao.notificar')?.config.texto).includes('{{resumo}}') },
    ],
  },
  {
    id: 'pedido-planilha-agradece',
    segment: 'Loja',
    description: 'Sempre que entrar um pedido, registre na planilha de vendas e agradeça o cliente pelo WhatsApp',
    expect: { trigger: 'gatilho.pedido', before: ['acao.planilha', 'acao.mensagem'] },
    extra: [{ label: 'Planilha de vendas', why: 'Registrar na planilha errada bagunça o fechamento.', test: (f) => /vendas/i.test(String(node(f, 'acao.planilha')?.config.planilha)) }],
  },
  {
    id: 'palavra-cancelar',
    segment: 'Restaurante',
    description: "Se a mensagem do cliente contiver a palavra 'cancelar', avise o gerente; caso contrário, responda com o cardápio",
    expect: {
      trigger: 'gatilho.whatsapp',
      condition: { campo: 'mensagem.texto', operador: 'contem', valor: 'cancelar' },
      before: [],
      sim: ['acao.notificar'],
      nao: ['acao.mensagem'],
    },
    extra: [{ label: 'Resposta fala do cardápio', why: 'O dono pediu uma resposta específica, não um "recebemos".', test: (f) => /card[aá]pio/i.test(String(node(f, 'acao.mensagem')?.config.texto)) }],
  },
  {
    id: 'pedido-baixo-cupom',
    segment: 'Restaurante',
    description: 'Quando um pedido for criado com valor menor que R$ 50, espere 30 minutos e mande um cupom de desconto para o cliente',
    expect: {
      trigger: 'gatilho.pedido',
      condition: { campo: 'pedido.valor', operador: 'menor', valor: '50' },
      before: [],
      sim: ['controle.esperar', 'acao.mensagem'],
      nao: ['controle.fim'],
    },
    extra: [
      { label: 'Espera de 30 minutos', why: 'Cupom antes da entrega chegar parece spam.', test: (f) => Number(node(f, 'controle.esperar')?.config.minutos) === 30 },
      { label: 'Mensagem tem cupom', why: 'É a ação pedida.', test: (f) => /cupom/i.test(String(node(f, 'acao.mensagem')?.config.texto)) },
    ],
  },
  {
    id: 'fechamento-caixa',
    segment: 'Loja',
    description: 'Nos dias úteis às 18h, crie uma tarefa de fechamento de caixa para o gerente e atualize a planilha de fechamento',
    expect: { trigger: 'gatilho.horario', triggerConfig: { hora: '18:00', dias: 'uteis' }, before: ['acao.tarefa', 'acao.planilha'] },
    extra: [
      { label: 'Tarefa para o gerente', why: 'Tarefa sem responsável fica sem dono.', test: (f) => /gerente/i.test(String(node(f, 'acao.tarefa')?.config.responsavel)) },
      { label: 'Título fala em fechamento de caixa', why: 'A equipe precisa saber o que fazer só de ler o título.', test: (f) => /fechamento de caixa/i.test(String(node(f, 'acao.tarefa')?.config.titulo)) },
    ],
  },
]
