import { describe, expect, it } from 'vitest'
import { connect, createNode, addNode, duplicateNode, moveNodes, readingOrder, removeNodes, updateNode } from '../src/domain/graph'
import { initHistory, push, redo, replace, undo } from '../src/domain/history'
import { diffFlows } from '../src/domain/diff'
import { autoLayout, NODE_W } from '../src/domain/layout'
import { PRESETS, TEMPLATES, templateFlow } from '../src/domain/templates'
import { runFlow } from '../src/domain/engine'
import { classifyDemo, summarizeDemo } from '../src/ai/demo/provider'
import { validateFlow } from '../src/domain/validate'
import { pedidoComCondicao } from './helpers'

describe('edição do grafo', () => {
  it('ligar de novo a mesma saída substitui a ligação', () => {
    const f = pedidoComCondicao()
    const r = connect(f, 'c', 'sim', 'msg')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.flow.edges.filter((e) => e.from === 'c' && e.port === 'sim').map((e) => e.to)).toEqual(['msg'])
  })

  it('recusa ligar em gatilho, em si mesma ou por saída inexistente', () => {
    const f = pedidoComCondicao()
    expect(connect(f, 'msg', 'out', 'g')).toMatchObject({ ok: false })
    expect(connect(f, 'msg', 'out', 'msg')).toMatchObject({ ok: false })
    expect(connect(f, 'msg', 'sim', 'avisa')).toMatchObject({ ok: false })
  })

  it('remover etapa remove as ligações dela', () => {
    const f = removeNodes(pedidoComCondicao(), ['avisa'])
    expect(f.edges.some((e) => e.from === 'avisa' || e.to === 'avisa')).toBe(false)
  })

  it('cria ids únicos, move, duplica e edita sem mutar o original', () => {
    const f = pedidoComCondicao()
    const n = createNode(f, 'acao.tarefa', { x: 10.6, y: 20.2 })
    expect(n.position).toEqual({ x: 11, y: 20 })
    expect(n.config).toMatchObject({ responsavel: 'Equipe' })
    const g = addNode(f, n)
    const n2 = createNode(g, 'acao.tarefa', { x: 0, y: 0 })
    expect(n2.id).not.toBe(n.id)
    const moved = moveNodes(g, [n.id], 5, 5)
    expect(moved.nodes.find((x) => x.id === n.id)!.position).toEqual({ x: 16, y: 25 })
    expect(g.nodes.find((x) => x.id === n.id)!.position).toEqual({ x: 11, y: 20 })
    const dup = duplicateNode(g, n.id)!
    expect(dup.flow.nodes).toHaveLength(g.nodes.length + 1)
    const ed = updateNode(g, n.id, { config: { titulo: 'Novo' } })
    expect(ed.nodes.find((x) => x.id === n.id)!.config).toMatchObject({ titulo: 'Novo', responsavel: 'Equipe' })
  })

  it('ordem de leitura segue o fluxo, "sim" antes de "não"', () => {
    expect(readingOrder(pedidoComCondicao()).map((n) => n.id)).toEqual(['g', 'c', 'avisa', 'msg'])
  })
})

describe('desfazer e refazer', () => {
  it('empilha, desfaz, refaz e descarta o futuro ao editar', () => {
    let h = initHistory(1)
    h = push(h, 2)
    h = push(h, 3)
    h = undo(h)
    expect(h.present).toBe(2)
    h = redo(h)
    expect(h.present).toBe(3)
    h = undo(undo(h))
    h = push(h, 9)
    expect(h).toEqual({ past: [1], present: 9, future: [] })
    expect(undo(undo(undo(h))).present).toBe(1)
  })

  it('replace não cria passo (arraste contínuo)', () => {
    let h = initHistory('a')
    h = replace(h, 'b')
    expect(undo(h).present).toBe('b')
  })
})

describe('diferença antes de aplicar', () => {
  it('fluxo igual não tem mudança', () => {
    expect(diffFlows(pedidoComCondicao(), pedidoComCondicao()).same).toBe(true)
  })

  it('aponta etapas novas, removidas e campos alterados', () => {
    const before = pedidoComCondicao()
    const after = removeNodes(updateNode(pedidoComCondicao(), 'c', { config: { valor: '300' } }), ['avisa'])
    const t = addNode(after, createNode(after, 'acao.tarefa', { x: 0, y: 0 }, { titulo: 'Conferir' }))
    const linked = connect(t, 'c', 'sim', t.nodes.at(-1)!.id)
    if (!linked.ok) throw new Error()
    const d = diffFlows(before, linked.flow)
    expect(d.same).toBe(false)
    expect(d.nodes.filter((c) => c.kind === 'nova').map((c) => c.node.type)).toEqual(['acao.tarefa'])
    expect(d.nodes.filter((c) => c.kind === 'removida').map((c) => c.node.id)).toEqual(['avisa'])
    const changed = d.nodes.find((c) => c.kind === 'alterada')
    expect(changed && changed.kind === 'alterada' && changed.fields).toEqual([{ key: 'valor', label: 'Valor', before: '200', after: '300' }])
    expect(d.edgesAdded).toBeGreaterThan(0)
    expect(d.edgesRemoved).toBeGreaterThan(0)
  })
})

describe('layout automático', () => {
  it('não sobrepõe etapas e põe filhos à direita', () => {
    const f = templateFlow('clinica-confirmacao')
    const pos = autoLayout(f.nodes, f.edges)
    const keys = new Set(Object.values(pos).map((p) => `${p.x},${p.y}`))
    expect(keys.size).toBe(f.nodes.length)
    for (const e of f.edges) expect(pos[e.to].x).toBeGreaterThanOrEqual(pos[e.from].x + NODE_W)
  })

  it('não trava com ciclo', () => {
    const pos = autoLayout(
      [
        { id: 'a', type: 'gatilho.pedido' },
        { id: 'b', type: 'acao.tarefa' },
        { id: 'c', type: 'acao.tarefa' },
      ],
      [
        { from: 'a', to: 'b', port: 'out' },
        { from: 'b', to: 'c', port: 'out' },
        { from: 'c', to: 'b', port: 'out' },
      ],
    )
    expect(Object.keys(pos)).toHaveLength(3)
  })
})

describe('modelos prontos', () => {
  const ai = { classify: async (t: string, c: string[]) => classifyDemo(t, c), summarize: async (t: string) => summarizeDemo(t) }

  it.each(TEMPLATES.map((t) => [t.id]))('%s é válido', (id) => {
    expect(validateFlow(templateFlow(id))).toEqual([])
  })

  it('todo modelo tem eventos de exemplo e os resultados esperados', async () => {
    const expected: Record<string, string> = {
      'pedido-alto': 'concluido',
      'pedido-comum': 'concluido',
      'pedido-sem-valor': 'erro',
      'msg-reclamacao': 'concluido',
      'msg-duvida': 'concluido',
      'msg-elogio': 'concluido',
      'ag-primeira': 'concluido',
      'ag-retorno': 'concluido',
      'ag-sem-telefone': 'erro',
      'dia-fraco': 'concluido',
      'dia-bom': 'concluido',
    }
    for (const t of TEMPLATES) {
      const flow = templateFlow(t.id)
      const trigger = flow.nodes[0].type
      const presets = PRESETS[trigger]!
      expect(presets.length).toBeGreaterThan(1)
      for (const p of presets) {
        const r = await runFlow(flow, p.payload, ai)
        expect(r.status, `${t.id} / ${p.id}: ${r.message}`).toBe(expected[p.id])
      }
    }
  })

  it('a reclamação do modelo da loja vai para a equipe; a dúvida recebe resposta', async () => {
    const flow = templateFlow('loja-triagem-whatsapp')
    const [rec, duv] = PRESETS['gatilho.whatsapp']!
    const a = await runFlow(flow, rec.payload, ai)
    expect(a.steps.map((s) => s.nodeId)).toEqual(['gatilho', 'classifica', 'e_reclamacao', 'resume', 'avisa_atendimento', 'tarefa_responder'])
    const b = await runFlow(flow, duv.payload, ai)
    expect(b.steps.at(-1)!.nodeId).toBe('resposta_auto')
    expect(String(b.steps.at(-1)!.output!.texto)).toMatch(/dúvida/)
  })
})
