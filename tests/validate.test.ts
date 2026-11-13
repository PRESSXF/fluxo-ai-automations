import { describe, expect, it } from 'vitest'
import { findCycles, validateFlow, hasErrors, reachableFrom } from '../src/domain/validate'
import { flowOf, pedidoComCondicao } from './helpers'

const codes = (f: Parameters<typeof validateFlow>[0]) => validateFlow(f).map((i) => i.code)

describe('detecção de ciclos', () => {
  it('não acusa ciclo em um DAG com caminhos que se juntam', () => {
    expect(findCycles(pedidoComCondicao())).toEqual([])
  })

  it('encontra um ciclo simples e devolve as etapas na ordem', () => {
    const f = { nodes: ['a', 'b', 'c'].map((id) => ({ id })), edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }] }
    expect(findCycles(f as never)).toEqual([['a', 'b', 'c']])
  })

  it('encontra dois ciclos independentes e não repete o mesmo ciclo', () => {
    const edges = [
      ['a', 'b'],
      ['b', 'a'],
      ['c', 'd'],
      ['d', 'e'],
      ['e', 'c'],
    ].map(([from, to]) => ({ from, to }))
    const cycles = findCycles({ nodes: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id })), edges } as never)
    expect(cycles).toHaveLength(2)
  })

  it('ignora arestas que apontam para etapas inexistentes', () => {
    expect(findCycles({ nodes: [{ id: 'a' }], edges: [{ from: 'a', to: 'x' }] } as never)).toEqual([])
  })

  it('alcance a partir do gatilho', () => {
    const f = pedidoComCondicao()
    expect([...reachableFrom(f, ['g'])].sort()).toEqual(['avisa', 'c', 'g', 'msg'])
  })
})

describe('validação do fluxo', () => {
  it('um fluxo bem montado não tem erros', () => {
    expect(validateFlow(pedidoComCondicao())).toEqual([])
  })

  it('fluxo vazio e fluxo sem gatilho', () => {
    expect(codes(flowOf([], []))).toEqual(['sem_gatilho'])
    const f = flowOf([{ id: 'm', type: 'acao.tarefa', config: { titulo: 'x' } }], [])
    expect(codes(f)).toContain('sem_gatilho')
  })

  it('dois gatilhos', () => {
    const f = flowOf(
      [
        { id: 'a', type: 'gatilho.pedido', config: {} },
        { id: 'b', type: 'gatilho.whatsapp', config: {} },
        { id: 't', type: 'acao.tarefa', config: { titulo: 'x' } },
      ],
      [
        ['a', 't'],
        ['b', 't'],
      ],
    )
    expect(codes(f)).toContain('varios_gatilhos')
  })

  it('etapa solta é apontada com explicação', () => {
    const f = pedidoComCondicao()
    f.nodes.push({ id: 'solta', type: 'acao.tarefa', position: { x: 0, y: 0 }, config: { titulo: 'Sozinha' } })
    const issue = validateFlow(f).find((i) => i.code === 'etapa_solta')!
    expect(issue.nodeIds).toEqual(['solta'])
    expect(issue.message).toMatch(/solta/)
    expect(issue.hint).toBeTruthy()
  })

  it('ciclo vira erro e cita as etapas', () => {
    const f = pedidoComCondicao()
    f.edges.push({ id: 'volta', from: 'msg', to: 'c', port: 'out' })
    const issue = validateFlow(f).find((i) => i.code === 'ciclo')!
    expect(issue.nodeIds).toEqual(expect.arrayContaining(['c', 'msg']))
    expect(issue.message).toMatch(/Ciclo/)
  })

  it('condição sem "senão" e sem "sim"', () => {
    const f = pedidoComCondicao()
    f.edges = f.edges.filter((e) => e.port !== 'nao')
    expect(codes(f)).toContain('condicao_sem_senao')
    f.edges = f.edges.filter((e) => e.port !== 'sim')
    expect(codes(f)).toContain('condicao_sem_sim')
  })

  it('campos obrigatórios vazios', () => {
    const f = pedidoComCondicao()
    f.nodes[1].config.campo = ''
    f.nodes[3].config.texto = '   '
    const missing = validateFlow(f).filter((i) => i.code === 'campo_obrigatorio')
    expect(missing.map((i) => i.nodeIds[0]).sort()).toEqual(['c', 'msg'])
  })

  it('"está preenchido" dispensa o valor', () => {
    const f = pedidoComCondicao()
    Object.assign(f.nodes[1].config, { operador: 'existe', valor: '' })
    expect(hasErrors(validateFlow(f))).toBe(false)
  })

  it('comparação numérica com texto é erro', () => {
    const f = pedidoComCondicao()
    f.nodes[1].config.valor = 'muito'
    expect(codes(f)).toContain('valor_invalido')
  })

  it('horário inválido, espera zero e classificação com uma categoria só', () => {
    const f = flowOf(
      [
        { id: 'g', type: 'gatilho.horario', config: { hora: '25:00', dias: 'todos' } },
        { id: 'w', type: 'controle.esperar', config: { minutos: 0 } },
        { id: 'k', type: 'ia.classificar', config: { texto: 'x', categorias: 'reclamação', salvarEm: 'c' } },
      ],
      [
        ['g', 'w'],
        ['w', 'k'],
      ],
    )
    const issues = validateFlow(f).filter((i) => i.code === 'valor_invalido')
    expect(issues).toHaveLength(3)
  })

  it('ligação chegando no gatilho e saída inexistente', () => {
    const f = pedidoComCondicao()
    f.edges.push({ id: 'x', from: 'msg', to: 'g', port: 'out' })
    f.edges.push({ id: 'y', from: 'avisa', to: 'msg', port: 'sim' })
    const c = codes(f)
    expect(c).toContain('entrada_em_gatilho')
    expect(c).toContain('saida_invalida')
  })

  it('erros vêm antes dos avisos', () => {
    const f = flowOf(
      [
        { id: 'g', type: 'gatilho.whatsapp', config: {} },
        { id: 'k', type: 'ia.classificar', config: {} },
        { id: 's', type: 'acao.tarefa', config: { titulo: '' } },
      ],
      [['g', 'k']],
    )
    const sev = validateFlow(f).map((i) => i.severity)
    expect(sev.indexOf('aviso')).toBeGreaterThan(sev.lastIndexOf('erro'))
  })
})
