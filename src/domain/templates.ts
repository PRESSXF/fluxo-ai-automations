import { draftToFlow } from './schema'
import type { Flow, FlowDraft, NodeType } from './types'

/**
 * Modelos prontos, tirados de rotinas comuns de pequenos negócios.
 * Empresas, pessoas e números são fictícios.
 */

export interface EventPreset {
  id: string
  label: string
  payload: Record<string, unknown>
}

export interface Template {
  id: string
  segment: 'Restaurante' | 'Clínica' | 'Loja'
  title: string
  pitch: string
  draft: FlowDraft
}

const T: Template[] = [
  {
    id: 'restaurante-pedido-alto',
    segment: 'Restaurante',
    title: 'Pedido alto com conferência',
    pitch: 'Pedidos acima de R$ 200 avisam o gerente e geram uma tarefa de conferência antes de sair.',
    draft: {
      name: 'Tapioca da Praça · pedido alto',
      description: 'Pedidos grandes têm mais chance de erro e de fraude. O gerente confere antes de a cozinha liberar.',
      nodes: [
        { id: 'gatilho', type: 'gatilho.pedido', config: { canal: 'qualquer' } },
        { id: 'valor_alto', type: 'condicao', label: 'Pedido acima de R$ 200?', config: { campo: 'pedido.valor', operador: 'maior', valor: '200' } },
        { id: 'avisa_gerente', type: 'acao.notificar', config: { destinatario: 'Gerente', canal: 'whatsapp', texto: 'Pedido {{pedido.id}} de R$ {{pedido.valor}} para {{cliente.nome}}. Conferir antes de liberar.' } },
        { id: 'tarefa_conferir', type: 'acao.tarefa', config: { titulo: 'Conferir pedido {{pedido.id}}', responsavel: 'Gerente', prazoHoras: 1 } },
        { id: 'confirma_cliente', type: 'acao.mensagem', label: 'Confirmar para o cliente', config: { canal: 'whatsapp', para: '{{cliente.telefone}}', texto: 'Oi, {{cliente.nome}}! Recebemos o pedido {{pedido.id}} e já estamos preparando.' } },
      ],
      edges: [
        { from: 'gatilho', to: 'valor_alto', port: 'out' },
        { from: 'valor_alto', to: 'avisa_gerente', port: 'sim' },
        { from: 'avisa_gerente', to: 'tarefa_conferir', port: 'out' },
        { from: 'tarefa_conferir', to: 'confirma_cliente', port: 'out' },
        { from: 'valor_alto', to: 'confirma_cliente', port: 'nao' },
      ],
    },
  },
  {
    id: 'loja-triagem-whatsapp',
    segment: 'Loja',
    title: 'Triagem de mensagens com IA',
    pitch: 'A IA classifica cada mensagem. Reclamação vira resumo para a equipe e tarefa com prazo; o resto recebe resposta automática.',
    draft: {
      name: 'Fio de Algodão · triagem do WhatsApp',
      description: 'Reclamação respondida rápido evita avaliação ruim. O resto pode esperar a fila normal.',
      nodes: [
        { id: 'gatilho', type: 'gatilho.whatsapp', config: { palavraChave: '' } },
        { id: 'classifica', type: 'ia.classificar', config: { texto: '{{mensagem.texto}}', categorias: 'reclamação, dúvida, troca, elogio', salvarEm: 'classificacao' } },
        { id: 'e_reclamacao', type: 'condicao', label: 'É reclamação?', config: { campo: 'classificacao.categoria', operador: 'igual', valor: 'reclamação' } },
        { id: 'resume', type: 'ia.resumir', config: { texto: '{{mensagem.texto}}', salvarEm: 'resumo' } },
        { id: 'avisa_atendimento', type: 'acao.notificar', config: { destinatario: 'Atendimento', canal: 'whatsapp', texto: 'Reclamação de {{cliente.nome}}: {{resumo}}' } },
        { id: 'tarefa_responder', type: 'acao.tarefa', config: { titulo: 'Responder {{cliente.nome}} sobre a reclamação', responsavel: 'Atendimento', prazoHoras: 1 } },
        { id: 'resposta_auto', type: 'acao.mensagem', label: 'Resposta automática', config: { canal: 'whatsapp', para: '{{cliente.telefone}}', texto: 'Oi, {{cliente.nome}}! Recebemos sua mensagem sobre {{classificacao.categoria}} e respondemos em até 2 horas.' } },
      ],
      edges: [
        { from: 'gatilho', to: 'classifica', port: 'out' },
        { from: 'classifica', to: 'e_reclamacao', port: 'out' },
        { from: 'e_reclamacao', to: 'resume', port: 'sim' },
        { from: 'resume', to: 'avisa_atendimento', port: 'out' },
        { from: 'avisa_atendimento', to: 'tarefa_responder', port: 'out' },
        { from: 'e_reclamacao', to: 'resposta_auto', port: 'nao' },
      ],
    },
  },
  {
    id: 'clinica-confirmacao',
    segment: 'Clínica',
    title: 'Confirmação e lembrete de consulta',
    pitch: 'Confirma na hora, manda ficha para quem é novo, lembra um dia depois e registra na planilha.',
    draft: {
      name: 'Clínica Sorriso Leve · confirmação',
      description: 'Lembrete reduz falta. A ficha prévia encurta a recepção na primeira consulta.',
      nodes: [
        { id: 'gatilho', type: 'gatilho.agendamento', config: { agenda: '' } },
        { id: 'confirma', type: 'acao.mensagem', label: 'Confirmar horário', config: { canal: 'whatsapp', para: '{{paciente.telefone}}', texto: 'Olá, {{paciente.nome}}! Sua consulta de {{agendamento.procedimento}} está marcada para {{agendamento.data}} às {{agendamento.hora}}.' } },
        { id: 'primeira', type: 'condicao', label: 'Primeira consulta?', config: { campo: 'agendamento.primeiraConsulta', operador: 'igual', valor: 'sim' } },
        { id: 'ficha', type: 'acao.mensagem', label: 'Enviar ficha de cadastro', config: { canal: 'email', para: '{{paciente.email}}', texto: 'Preencha sua ficha antes da consulta para agilizar o atendimento.' } },
        { id: 'espera', type: 'controle.esperar', config: { minutos: 1440 } },
        { id: 'lembrete', type: 'acao.mensagem', label: 'Lembrete', config: { canal: 'whatsapp', para: '{{paciente.telefone}}', texto: '{{paciente.nome}}, lembrete da sua consulta em {{agendamento.data}} às {{agendamento.hora}}. Responda 1 para confirmar.' } },
        { id: 'planilha', type: 'acao.planilha', config: { planilha: 'Confirmações', linha: '{{agendamento.data}}; {{paciente.nome}}; {{agendamento.procedimento}}; lembrete enviado' } },
      ],
      edges: [
        { from: 'gatilho', to: 'confirma', port: 'out' },
        { from: 'confirma', to: 'primeira', port: 'out' },
        { from: 'primeira', to: 'ficha', port: 'sim' },
        { from: 'ficha', to: 'espera', port: 'out' },
        { from: 'primeira', to: 'espera', port: 'nao' },
        { from: 'espera', to: 'lembrete', port: 'out' },
        { from: 'lembrete', to: 'planilha', port: 'out' },
      ],
    },
  },
  {
    id: 'restaurante-fechamento',
    segment: 'Restaurante',
    title: 'Resumo diário das vendas',
    pitch: 'Todo dia às 9h a IA resume os comentários de ontem; se a venda ficou abaixo da meta, o dono é avisado.',
    draft: {
      name: 'Tapioca da Praça · resumo das 9h',
      description: 'O dono começa o dia sabendo como foi ontem sem abrir três sistemas.',
      nodes: [
        { id: 'gatilho', type: 'gatilho.horario', config: { hora: '09:00', dias: 'todos' } },
        { id: 'resume', type: 'ia.resumir', label: 'Resumir comentários', config: { texto: '{{vendasOntem.comentarios}}', salvarEm: 'resumo' } },
        { id: 'meta', type: 'condicao', label: 'Abaixo da meta?', config: { campo: 'vendasOntem.total', operador: 'menor', valor: '1500' } },
        { id: 'avisa_dono', type: 'acao.notificar', config: { destinatario: 'Dono', canal: 'whatsapp', texto: 'Ontem vendemos R$ {{vendasOntem.total}}, abaixo da meta de R$ 1.500. Clientes: {{resumo}}' } },
        { id: 'fim_ok', type: 'controle.fim', label: 'Meta batida', config: {} },
        { id: 'planilha', type: 'acao.planilha', config: { planilha: 'Fechamento diário', linha: '{{vendasOntem.data}}; {{vendasOntem.total}}; {{vendasOntem.pedidos}}' } },
      ],
      edges: [
        { from: 'gatilho', to: 'planilha', port: 'out' },
        { from: 'planilha', to: 'resume', port: 'out' },
        { from: 'resume', to: 'meta', port: 'out' },
        { from: 'meta', to: 'avisa_dono', port: 'sim' },
        { from: 'meta', to: 'fim_ok', port: 'nao' },
      ],
    },
  },
]

export const TEMPLATES = T

export const DEFAULT_TEMPLATE_ID = 'restaurante-pedido-alto'

export function templateFlow(id: string): Flow {
  const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0]
  return draftToFlow(t.draft, t.id)
}

/** Eventos de exemplo para o simulador, por tipo de gatilho. */
export const PRESETS: Partial<Record<NodeType, EventPreset[]>> = {
  'gatilho.pedido': [
    {
      id: 'pedido-alto',
      label: 'Pedido de R$ 248,90',
      payload: { pedido: { id: 'P-1042', valor: 248.9, canal: 'app', itens: ['2 tapiocas de carne de sol', '1 cuscuz completo', '4 sucos de cajá'] }, cliente: { nome: 'Renata Lins', telefone: '+55 81 98888-1042' } },
    },
    {
      id: 'pedido-comum',
      label: 'Pedido de R$ 62,00',
      payload: { pedido: { id: 'P-1043', valor: 62, canal: 'site', itens: ['1 tapioca de queijo coalho', '1 café'] }, cliente: { nome: 'Bruno Araújo', telefone: '+55 81 97777-1043' } },
    },
    {
      id: 'pedido-sem-valor',
      label: 'Pedido sem valor (erro)',
      payload: { pedido: { id: 'P-1044', canal: 'balcao' }, cliente: { nome: 'Sem cadastro' } },
    },
  ],
  'gatilho.whatsapp': [
    {
      id: 'msg-reclamacao',
      label: 'Reclamação de entrega',
      payload: {
        mensagem: { texto: 'Comprei um vestido há 10 dias, paguei frete expresso e até agora nada. Já mandei mensagem duas vezes e ninguém responde. Quero uma solução hoje.' },
        cliente: { nome: 'Patrícia Moura', telefone: '+55 81 99111-2233' },
      },
    },
    {
      id: 'msg-duvida',
      label: 'Dúvida sobre tamanho',
      payload: { mensagem: { texto: 'Oi! A camisa de linho tem no tamanho G? Qual a medida do tórax?' }, cliente: { nome: 'Diego Ramos', telefone: '+55 81 98222-3344' } },
    },
    {
      id: 'msg-elogio',
      label: 'Elogio',
      payload: { mensagem: { texto: 'Chegou tudo perfeito, amei o tecido! Obrigada pelo cuidado com a embalagem.' }, cliente: { nome: 'Luiza Prado', telefone: '+55 81 98333-4455' } },
    },
  ],
  'gatilho.agendamento': [
    {
      id: 'ag-primeira',
      label: 'Primeira consulta',
      payload: {
        agendamento: { data: '18/11', hora: '14:30', procedimento: 'avaliação', primeiraConsulta: 'sim' },
        paciente: { nome: 'Marcos Tavares', telefone: '+55 81 98444-5566', email: 'marcos@exemplo.com' },
      },
    },
    {
      id: 'ag-retorno',
      label: 'Retorno',
      payload: { agendamento: { data: '19/11', hora: '09:00', procedimento: 'limpeza', primeiraConsulta: 'não' }, paciente: { nome: 'Helena Costa', telefone: '+55 81 98555-6677' } },
    },
    {
      id: 'ag-sem-telefone',
      label: 'Paciente sem telefone (erro)',
      payload: { agendamento: { data: '20/11', hora: '11:00', procedimento: 'canal', primeiraConsulta: 'não' }, paciente: { nome: 'Cadastro incompleto' } },
    },
  ],
  'gatilho.horario': [
    {
      id: 'dia-fraco',
      label: 'Dia abaixo da meta',
      payload: {
        vendasOntem: {
          data: '12/11',
          total: 1180.5,
          pedidos: 41,
          comentarios: 'Tapioca de carne de sol elogiada por vários clientes. Duas reclamações de demora na entrega à noite. Um cliente pediu opção sem glúten. Suco de cajá acabou às 20h.',
        },
      },
    },
    {
      id: 'dia-bom',
      label: 'Dia acima da meta',
      payload: { vendasOntem: { data: '11/11', total: 2140, pedidos: 63, comentarios: 'Movimento forte no almoço. Clientes elogiaram o atendimento e o cuscuz. Nenhuma reclamação registrada.' } },
    },
  ],
}

export function presetsFor(triggerType: NodeType | undefined): EventPreset[] {
  return (triggerType && PRESETS[triggerType]) || []
}
