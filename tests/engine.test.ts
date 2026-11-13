import { describe, expect, it } from 'vitest'
import { evaluateCondition, executeFlow, interpolate, parseNumber, runFlow, type AiRuntime } from '../src/domain/engine'
import { classifyDemo, summarizeDemo } from '../src/ai/demo/provider'
import { flowOf, pedidoComCondicao } from './helpers'

const ai: AiRuntime = { classify: async (t, c) => classifyDemo(t, c), summarize: async (t) => summarizeDemo(t) }
const evento = (valor: unknown) => ({ pedido: { id: 'P-1', valor }, cliente: { nome: 'Ana', telefone: '+55 81 9' } })

describe('utilitários do motor', () => {
  it('lê números do jeito brasileiro', () => {
    expect(parseNumber('R$ 1.234,50')).toBe(1234.5)
    expect(parseNumber('199.9')).toBe(199.9)
    expect(parseNumber('250')).toBe(250)
    expect(parseNumber(42)).toBe(42)
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber('')).toBeNull()
  })

  it('interpola caminhos e informa os que faltam', () => {
    const r = interpolate('Oi {{cliente.nome}}, pedido {{ pedido.id }} {{nada.aqui}}', evento(10))
    expect(r.text).toBe('Oi Ana, pedido P-1 ')
    expect(r.missing).toEqual(['nada.aqui'])
  })

  it('avalia regras de texto sem diferenciar acento e maiúscula', () => {
    expect(evaluateCondition({ campo: 'm', operador: 'contem', valor: 'RECLAMAÇÃO' }, { m: 'é uma reclamacao' }).result).toBe(true)
    expect(evaluateCondition({ campo: 'm', operador: 'nao_contem', valor: 'pix' }, { m: 'cartão' }).result).toBe(true)
    expect(evaluateCondition({ campo: 'c', operador: 'igual', valor: 'dúvida' }, { c: 'Duvida' }).result).toBe(true)
    expect(evaluateCondition({ campo: 'v', operador: 'igual', valor: '200' }, { v: 200.0 }).result).toBe(true)
    expect(evaluateCondition({ campo: 'v', operador: 'maior_igual', valor: '200' }, { v: '200,00' }).result).toBe(true)
    expect(evaluateCondition({ campo: 'tags', operador: 'contem', valor: 'vip' }, { tags: ['novo', 'VIP'] }).result).toBe(true)
    expect(evaluateCondition({ campo: 'x', operador: 'existe', valor: '' }, {}).result).toBe(false)
  })

  it('campo ausente e número inválido viram erro explicado', () => {
    expect(evaluateCondition({ campo: 'pedido.valor', operador: 'maior', valor: '1' }, {}).error).toMatch(/não existe/)
    expect(evaluateCondition({ campo: 'v', operador: 'maior', valor: '1' }, { v: 'caro' }).error).toMatch(/não é número/)
  })
})

describe('execução de fluxos', () => {
  it('pega o caminho "se sim" e junta de novo no fim', async () => {
    const r = await runFlow(pedidoComCondicao(), evento(248.9), ai)
    expect(r.status).toBe('concluido')
    expect(r.steps.map((s) => s.nodeId)).toEqual(['g', 'c', 'avisa', 'msg'])
    expect(r.steps[1].branch).toBe('sim')
    expect(r.steps[3].output).toMatchObject({ para: '+55 81 9', texto: 'Oi, Ana' })
  })

  it('pega o caminho "se não"', async () => {
    const r = await runFlow(pedidoComCondicao(), evento(62), ai)
    expect(r.steps.map((s) => s.nodeId)).toEqual(['g', 'c', 'msg'])
    expect(r.steps[1].branch).toBe('nao')
  })

  it('o limite é exclusivo em "maior que"', async () => {
    const r = await runFlow(pedidoComCondicao(), evento(200), ai)
    expect(r.steps[1].branch).toBe('nao')
  })

  it('para com erro quando o campo da regra não existe no evento', async () => {
    const r = await runFlow(pedidoComCondicao(), { pedido: { id: 'P-2' } }, ai)
    expect(r.status).toBe('erro')
    expect(r.steps.at(-1)!.status).toBe('erro')
    expect(r.steps.at(-1)!.message).toMatch(/pedido\.valor/)
    expect(r.steps).toHaveLength(2)
  })

  it('mensagem sem destino é erro; placeholder faltando é aviso', async () => {
    const semTelefone = await runFlow(pedidoComCondicao(), { pedido: { id: 'P', valor: 10 }, cliente: { nome: 'Ana' } }, ai)
    expect(semTelefone.status).toBe('erro')
    expect(semTelefone.message).toMatch(/Não há para quem enviar/)

    const semNome = await runFlow(pedidoComCondicao(), { pedido: { id: 'P', valor: 10 }, cliente: { telefone: '1' } }, ai)
    expect(semNome.status).toBe('concluido')
    expect(semNome.steps.at(-1)!.status).toBe('aviso')
    expect(semNome.steps.at(-1)!.warnings[0]).toMatch(/cliente\.nome/)
  })

  it('esperas avançam o relógio simulado sem esperar de verdade', async () => {
    const f = flowOf(
      [
        { id: 'g', type: 'gatilho.agendamento', config: {} },
        { id: 'w1', type: 'controle.esperar', config: { minutos: 1440 } },
        { id: 'w2', type: 'controle.esperar', config: { minutos: 30 } },
        { id: 't', type: 'acao.tarefa', config: { titulo: 'Ligar' } },
      ],
      [
        ['g', 'w1'],
        ['w1', 'w2'],
        ['w2', 't'],
      ],
    )
    const t0 = Date.now()
    const r = await runFlow(f, {}, ai)
    expect(Date.now() - t0).toBeLessThan(500)
    expect(r.simulatedMinutes).toBe(1470)
    expect(r.steps.map((s) => s.clock)).toEqual([0, 0, 1440, 1470])
    expect(r.message).toMatch(/1 dia|24/)
  })

  it('fluxo inválido é bloqueado antes de rodar', async () => {
    const f = pedidoComCondicao()
    f.edges = f.edges.filter((e) => e.port !== 'nao')
    const r = await runFlow(f, evento(10), ai)
    expect(r.status).toBe('bloqueado')
    expect(r.steps).toEqual([])
    expect(r.issues.some((i) => i.code === 'condicao_sem_senao')).toBe(true)
  })

  it('gatilho com palavra-chave ignora mensagens sem ela', async () => {
    const f = flowOf(
      [
        { id: 'g', type: 'gatilho.whatsapp', config: { palavraChave: 'cardápio' } },
        { id: 'm', type: 'acao.mensagem', config: { canal: 'whatsapp', para: '{{cliente.telefone}}', texto: 'Segue' } },
      ],
      [['g', 'm']],
    )
    const no = await runFlow(f, { mensagem: { texto: 'oi' }, cliente: { telefone: '1' } }, ai)
    expect(no.status).toBe('ignorado')
    const yes = await runFlow(f, { mensagem: { texto: 'manda o CARDAPIO' }, cliente: { telefone: '1' } }, ai)
    expect(yes.status).toBe('concluido')
  })

  it('classificação da IA guarda o resultado para a condição seguinte', async () => {
    const f = flowOf(
      [
        { id: 'g', type: 'gatilho.whatsapp', config: {} },
        { id: 'k', type: 'ia.classificar', config: { texto: '{{mensagem.texto}}', categorias: 'reclamação, dúvida', salvarEm: 'classificacao' } },
        { id: 'c', type: 'condicao', config: { campo: 'classificacao.categoria', operador: 'igual', valor: 'reclamação' } },
        { id: 'a', type: 'acao.tarefa', config: { titulo: 'Responder {{classificacao.categoria}}' } },
        { id: 'f', type: 'controle.fim', config: {} },
      ],
      [
        ['g', 'k'],
        ['k', 'c'],
        ['c', 'a', 'sim'],
        ['c', 'f', 'nao'],
      ],
    )
    const r = await runFlow(f, { mensagem: { texto: 'Um absurdo, o pedido não chegou' } }, ai)
    expect(r.steps.map((s) => s.nodeId)).toEqual(['g', 'k', 'c', 'a'])
    expect(r.steps[3].output).toMatchObject({ titulo: 'Responder reclamação' })
  })

  it('categoria fora da lista devolvida pela IA é rejeitada pelo motor', async () => {
    const liar: AiRuntime = { classify: async () => ({ categoria: 'spam', confianca: 0.9, motivo: '' }), summarize: async () => '' }
    const f = flowOf(
      [
        { id: 'g', type: 'gatilho.whatsapp', config: {} },
        { id: 'k', type: 'ia.classificar', config: { texto: '{{mensagem.texto}}', categorias: 'reclamação, dúvida', salvarEm: 'c' } },
      ],
      [['g', 'k']],
    )
    const r = await runFlow(f, { mensagem: { texto: 'x' } }, liar)
    expect(r.status).toBe('erro')
    expect(r.message).toMatch(/não está entre as categorias/)
  })

  it('falha do provedor de IA vira etapa com erro, sem quebrar a execução', async () => {
    const down: AiRuntime = { classify: async () => Promise.reject(new Error('timeout')), summarize: async () => '' }
    const f = flowOf(
      [
        { id: 'g', type: 'gatilho.whatsapp', config: {} },
        { id: 'k', type: 'ia.classificar', config: { texto: 'oi', categorias: 'a, b', salvarEm: 'c' } },
      ],
      [['g', 'k']],
    )
    const r = await runFlow(f, {}, down)
    expect(r.status).toBe('erro')
    expect(r.steps.at(-1)!.message).toMatch(/timeout/)
  })

  it('respeita o limite de etapas', async () => {
    const ids = Array.from({ length: 6 }, (_, i) => `t${i}`)
    const f = flowOf(
      [{ id: 'g', type: 'gatilho.pedido', config: { canal: 'qualquer' } }, ...ids.map((id) => ({ id, type: 'acao.tarefa' as const, config: { titulo: id } }))],
      [['g', 't0'], ...ids.slice(1).map((id, i) => [ids[i], id] as [string, string])],
    )
    const r = await runFlow(f, {}, ai, { maxSteps: 4 })
    expect(r.status).toBe('erro')
    expect(r.steps).toHaveLength(4)
  })

  it('o gerador entrega uma etapa por vez', async () => {
    const it = executeFlow(pedidoComCondicao(), evento(300), ai)
    const first = await it.next()
    expect(first.done).toBe(false)
    expect(!first.done && first.value.nodeId).toBe('g')
    const second = await it.next()
    expect(!second.done && second.value.branch).toBe('sim')
  })

  it('não altera o evento original', async () => {
    const ev = { mensagem: { texto: 'reclamação' } }
    const f = flowOf(
      [
        { id: 'g', type: 'gatilho.whatsapp', config: {} },
        { id: 'k', type: 'ia.classificar', config: { texto: '{{mensagem.texto}}', categorias: 'reclamação, dúvida', salvarEm: 'classificacao' } },
      ],
      [['g', 'k']],
    )
    await runFlow(f, ev, ai)
    expect(ev).toEqual({ mensagem: { texto: 'reclamação' } })
  })
})
