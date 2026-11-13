import { describe, expect, it } from 'vitest'
import { detectCondition, detectTrigger, normalizeKeepingIndex, parseDescription } from '../src/ai/demo/parser'
import { classifyDemo, summarizeDemo } from '../src/ai/demo/provider'
import { draftToFlow } from '../src/domain/schema'
import { hasErrors, validateFlow } from '../src/domain/validate'

const trig = (s: string) => {
  const { t } = normalizeKeepingIndex(s)
  return detectTrigger(t, t.split(',')[0])
}
const cond = (s: string, type: Parameters<typeof detectCondition>[1] = 'gatilho.pedido') => {
  const { t, src } = normalizeKeepingIndex(s)
  return detectCondition(t, type, src)
}
const parse = (s: string) => {
  const r = parseDescription(s)
  if (!r.ok) throw new Error(r.error)
  return r.draft
}

describe('normalização', () => {
  it('mantém o comprimento para recortar o original com acento', () => {
    const { t, src } = normalizeKeepingIndex('Crie  uma tarefa de CONFERÊNCIA, R$200')
    expect(t.length).toBe(src.length)
    expect(t).toBe('crie uma tarefa de conferencia, r$ 200')
    expect(src.slice(t.indexOf('conferencia'), t.indexOf('conferencia') + 11)).toBe('CONFERÊNCIA')
  })
})

describe('leitura do gatilho', () => {
  it.each([
    ['Quando chegar um pedido novo, avise', 'gatilho.pedido'],
    ['Sempre que entrar uma compra no site, agradeça', 'gatilho.pedido'],
    ['Assim que um cliente mandar mensagem no WhatsApp, responda', 'gatilho.whatsapp'],
    ['Quando alguém escrever no zap, avise a equipe', 'gatilho.whatsapp'],
    ['Quando um agendamento for marcado, confirme', 'gatilho.agendamento'],
    ['Quando um paciente marcar consulta, mande a ficha', 'gatilho.agendamento'],
    ['Todo dia às 9h, avise o dono', 'gatilho.horario'],
    ['Diariamente às 18:30, crie uma tarefa', 'gatilho.horario'],
  ])('%s → %s', (s, type) => {
    expect(trig(s)?.type).toBe(type)
  })

  it('lê horário, minutos, período e dias úteis', () => {
    expect(trig('Todo dia às 7:30, avise')?.config).toEqual({ hora: '07:30', dias: 'todos' })
    expect(trig('Nos dias úteis às 18h, avise')?.config).toEqual({ hora: '18:00', dias: 'uteis' })
    expect(trig('Todo dia às 8 da noite, avise')?.config.hora).toBe('20:00')
    expect(trig('De segunda a sexta ao meio-dia, avise')?.config).toEqual({ hora: '12:00', dias: 'uteis' })
    expect(trig('Todos os dias, avise')?.config.hora).toBe('09:00')
  })

  it('reconhece o canal do pedido', () => {
    expect(trig('Quando chegar pedido pelo iFood, avise')?.config.canal).toBe('app')
    expect(trig('Quando chegar pedido do site, avise')?.config.canal).toBe('site')
  })

  it('sem gatilho, explica o que escrever', () => {
    const r = parseDescription('Oi, tudo bem com você?')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/Quando chegar um pedido/)
  })
})

describe('leitura da condição', () => {
  it.each([
    ['pedido acima de R$ 200', 'maior', '200'],
    ['pedido maior que 150 reais', 'maior', '150'],
    ['compra de mais de R$ 1.000', 'maior', '1000'],
    ['pedido a partir de R$ 99,90', 'maior_igual', '99.9'],
    ['pedido abaixo de R$ 30', 'menor', '30'],
    ['valor menor que 50', 'menor', '50'],
    ['pedido de até R$ 40', 'menor_igual', '40'],
  ])('%s', (s, operador, valor) => {
    expect(cond(`Quando chegar um ${s}, avise`)).toMatchObject({ campo: 'pedido.valor', operador, valor })
  })

  it('não confunde tempo com valor', () => {
    expect(cond('quando chegar pedido, espere mais de 30 minutos e avise')).toBeNull()
    expect(cond('quando chegar pedido, crie tarefa com prazo em até 2 horas')).toBeNull()
  })

  it('palavra-chave com e sem aspas, mantendo o acento original', () => {
    expect(cond("se a mensagem contiver a palavra 'cancelar', avise", 'gatilho.whatsapp')).toMatchObject({ campo: 'mensagem.texto', operador: 'contem', valor: 'cancelar' })
    expect(cond('quando o cliente mandar mensagem falando em "orçamento", crie tarefa', 'gatilho.whatsapp')).toMatchObject({ valor: 'orçamento' })
    expect(cond('se a mensagem mencionar reembolso, avise o financeiro', 'gatilho.whatsapp')).toMatchObject({ valor: 'reembolso' })
  })

  it('tipo de mensagem pede classificação', () => {
    expect(cond('se for reclamação, avise', 'gatilho.whatsapp')).toMatchObject({ campo: 'classificacao.categoria', operador: 'igual', valor: 'reclamação', needsClassify: 'reclamação' })
    expect(cond('se o cliente estiver com dúvida', 'gatilho.whatsapp')).toBeNull()
    expect(cond('se a mensagem for uma dúvida, responda', 'gatilho.whatsapp')).toMatchObject({ valor: 'dúvida' })
  })

  it('primeira consulta', () => {
    expect(cond('se for a primeira consulta, mande a ficha', 'gatilho.agendamento')).toMatchObject({ campo: 'agendamento.primeiraConsulta', valor: 'sim' })
  })
})

describe('montagem do fluxo', () => {
  it('ações antes da regra ficam antes da condição', () => {
    const d = parse('Quando chegar mensagem no WhatsApp, classifique com IA; se for elogio, agradeça o cliente; senão, avise o atendimento')
    const types = d.nodes.map((n) => n.type)
    expect(types.indexOf('ia.classificar')).toBeLessThan(types.indexOf('condicao'))
    expect(d.edges.find((e) => e.port === 'sim')!.to).toBe(d.nodes.find((n) => n.type === 'acao.mensagem')!.id)
    expect(d.edges.find((e) => e.port === 'nao')!.to).toBe(d.nodes.find((n) => n.type === 'acao.notificar')!.id)
  })

  it('insere a classificação quando a regra depende dela', () => {
    const r = parseDescription('Quando chegar mensagem, se for reclamação, avise o gerente')
    expect(r.ok && r.draft.nodes.map((n) => n.type)).toEqual(['gatilho.whatsapp', 'ia.classificar', 'condicao', 'acao.notificar', 'controle.fim'])
    expect(r.notes.join(' ')).toMatch(/Classificar com IA/)
  })

  it('"senão, não faça nada" vira um Encerrar explícito', () => {
    const d = parse('Quando um paciente marcar consulta, se for a primeira consulta, mande a ficha por e-mail; senão, não faça nada')
    const nao = d.edges.find((e) => e.port === 'nao')!
    expect(d.nodes.find((n) => n.id === nao.to)!.type).toBe('controle.fim')
    const msg = d.nodes.find((n) => n.type === 'acao.mensagem')!
    expect(msg.config).toMatchObject({ canal: 'email', para: '{{paciente.email}}' })
  })

  it('esperas em minutos, horas, dias e meia hora', () => {
    const mins = (s: string) => parse(s).nodes.find((n) => n.type === 'controle.esperar')!.config.minutos
    expect(mins('Quando chegar um pedido, espere 15 minutos e mande uma mensagem ao cliente')).toBe(15)
    expect(mins('Quando chegar um pedido, aguarde 2 horas e mande uma pesquisa para o cliente')).toBe(120)
    expect(mins('Quando um agendamento for marcado, espere dois dias e lembre o paciente')).toBe(2880)
    expect(mins('Quando chegar um pedido, espere meia hora e agradeça o cliente')).toBe(30)
  })

  it('destinatário, canal e responsável', () => {
    const d = parse('Quando chegar um pedido, avise a cozinha por SMS e crie uma tarefa de embalagem para o entregador com prazo de 2 horas')
    expect(d.nodes[1].config).toMatchObject({ destinatario: 'Cozinha', canal: 'sms' })
    expect(d.nodes[2].config).toMatchObject({ titulo: 'Embalagem · pedido {{pedido.id}}', responsavel: 'Entregador', prazoHoras: 2 })
  })

  it('"envie para o dono" é aviso para a equipe, não mensagem ao cliente', () => {
    const d = parse('Todo dia às 8h, resuma as vendas de ontem com IA e envie para o dono por e-mail')
    expect(d.nodes.map((n) => n.type)).toEqual(['gatilho.horario', 'ia.resumir', 'acao.notificar'])
  })

  it('verbos no infinitivo dentro do gatilho não viram ação', () => {
    const d = parse('Quando um cliente mandar mensagem no WhatsApp, crie uma tarefa para o atendimento')
    expect(d.nodes.map((n) => n.type)).toEqual(['gatilho.whatsapp', 'acao.tarefa'])
  })

  it('gatilho sem ação é recusado com orientação', () => {
    const r = parseDescription('Quando chegar um pedido')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/nenhuma ação/)
  })

  it.each([
    'Quando chegar um pedido acima de R$ 500, avise o gerente',
    'Quando um cliente mandar mensagem no WhatsApp, classifique com IA; se for troca, crie uma tarefa para o estoque; senão, responda o cliente',
    'Todo dia às 9h, resuma os comentários de ontem e avise o dono',
    'Quando um agendamento for marcado, confirme com o paciente, espere 1 dia e mande um lembrete',
    'Sempre que entrar um pedido, registre na planilha de pedidos',
  ])('o resultado é um fluxo válido: %s', (s) => {
    const f = draftToFlow(parse(s))
    expect(validateFlow(f).filter((i) => i.severity === 'erro')).toEqual([])
    expect(hasErrors(validateFlow(f))).toBe(false)
  })
})

describe('IA de demonstração no simulador', () => {
  const cats = ['reclamação', 'dúvida', 'troca', 'elogio']
  it.each([
    ['Comprei há 10 dias e até agora nada. Ninguém responde, quero uma solução.', 'reclamação'],
    ['A camisa tem no tamanho G? Qual a medida?', 'dúvida'],
    ['Ficou apertado, quero trocar por um maior', 'troca'],
    ['Amei o vestido, chegou perfeito!', 'elogio'],
  ])('%s → %s', (text, expected) => {
    expect(classifyDemo(text, cats).categoria).toBe(expected)
  })

  it('sem sinais, cai na categoria genérica com confiança baixa', () => {
    const r = classifyDemo('bom dia', ['reclamação', 'outros'])
    expect(r).toMatchObject({ categoria: 'outros', confianca: 0.4 })
  })

  it('é determinística', () => {
    const t = 'Pedido atrasado, que absurdo'
    expect(classifyDemo(t, cats)).toEqual(classifyDemo(t, cats))
  })

  it('o resumo é curto, mantém a ordem e prioriza frases com informação', () => {
    const text = 'Movimento normal. Tapioca elogiada por vários clientes. Duas reclamações de demora na entrega à noite. Suco de cajá acabou às 20h. O dia estava ensolarado e bonito.'
    const r = summarizeDemo(text)
    expect(r.length).toBeLessThanOrEqual(220)
    expect(r).toMatch(/reclamações de demora/)
    expect(r.indexOf('elogiada')).toBeLessThan(r.indexOf('reclamações'))
  })
})
