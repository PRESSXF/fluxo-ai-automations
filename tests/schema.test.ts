import { describe, expect, it } from 'vitest'
import { draftToFlow, parseFlowDraft, parseFlowFile, serializeFlow } from '../src/domain/schema'
import { templateFlow } from '../src/domain/templates'

const valid = {
  name: 'Pedido alto',
  nodes: [
    { id: 'g', type: 'gatilho.pedido', config: { canal: 'qualquer' } },
    { id: 'c', type: 'condicao', config: { campo: 'pedido.valor', operador: 'maior', valor: 200 } },
    { id: 'n', type: 'acao.notificar', config: { destinatario: 'Gerente', canal: 'whatsapp', texto: 'Olha o pedido' } },
    { id: 'f', type: 'controle.fim', config: {} },
  ],
  edges: [
    { from: 'g', to: 'c', port: 'out' },
    { from: 'c', to: 'n', port: 'sim' },
    { from: 'c', to: 'f', port: 'nao' },
  ],
}

const errorsOf = (raw: unknown) => {
  const r = parseFlowDraft(raw)
  return r.ok ? [] : r.errors
}

describe('validação do JSON devolvido pela IA', () => {
  it('aceita um rascunho válido e completa os padrões', () => {
    const r = parseFlowDraft(valid)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.nodes[1].config.valor).toBe('200')
    expect(r.value.nodes[0].config).toEqual({ canal: 'qualquer' })
  })

  it('aceita JSON em texto e recusa texto que não é JSON', () => {
    expect(parseFlowDraft(JSON.stringify(valid)).ok).toBe(true)
    expect(errorsOf('Claro! Aqui está o fluxo: {')).toEqual(['A resposta não é um JSON válido.'])
    expect(errorsOf(null)[0]).toMatch(/objeto JSON/)
    expect(errorsOf([1, 2])[0]).toMatch(/objeto JSON/)
  })

  it('recusa tipo de etapa inventado, com o caminho do erro', () => {
    const raw = structuredClone(valid)
    raw.nodes[2].type = 'acao.enviar_pix'
    expect(errorsOf(raw)[0]).toMatch(/^nodes\[2\]\.type: tipo "acao\.enviar_pix" não existe/)
  })

  it('recusa campos desconhecidos na raiz, na etapa e na configuração', () => {
    const raw = { ...structuredClone(valid), extra: 1 } as Record<string, unknown>
    ;(raw.nodes as Array<Record<string, unknown>>)[0].cor = 'azul'
    ;(raw.nodes as Array<Record<string, unknown>>)[2].config = { destinatario: 'G', canal: 'whatsapp', texto: 'x', prioridade: 'alta' }
    const errs = errorsOf(raw)
    expect(errs).toContain('extra: campo desconhecido na raiz')
    expect(errs).toContain('nodes[0].cor: campo desconhecido')
    expect(errs.some((e) => e.startsWith('nodes[2].config.prioridade'))).toBe(true)
  })

  it('recusa ids repetidos ou inválidos', () => {
    const raw = structuredClone(valid)
    raw.nodes[1].id = 'g'
    expect(errorsOf(raw).some((e) => /"g" repetido/.test(e))).toBe(true)
    raw.nodes[1].id = 'com espaço'
    expect(errorsOf(raw).some((e) => e.startsWith('nodes[1].id'))).toBe(true)
  })

  it('recusa opção fora da lista e número inválido', () => {
    const raw = structuredClone(valid) as typeof valid & { nodes: Array<{ id: string; type: string; config: Record<string, unknown> }> }
    raw.nodes[2].config.canal = 'telegram'
    raw.nodes.push({ id: 'w', type: 'controle.esperar', config: { minutos: 'meia hora' } })
    const errs = errorsOf(raw)
    expect(errs.some((e) => e.startsWith('nodes[2].config.canal') && e.includes('telegram'))).toBe(true)
    expect(errs.some((e) => e.startsWith('nodes[4].config.minutos'))).toBe(true)
  })

  it('aceita minutos em texto numérico e converte', () => {
    const raw = structuredClone(valid) as unknown as { nodes: unknown[]; edges: unknown[] }
    raw.nodes.push({ id: 'w', type: 'controle.esperar', config: { minutos: '30' } })
    const r = parseFlowDraft(raw)
    expect(r.ok && r.value.nodes[4].config.minutos).toBe(30)
  })

  it('recusa ligações para etapas inexistentes, saídas erradas e duplicadas', () => {
    const raw = structuredClone(valid)
    raw.edges.push({ from: 'n', to: 'fantasma', port: 'out' })
    expect(errorsOf(raw).some((e) => /edges\[3\]\.to: etapa "fantasma" não existe/.test(e))).toBe(true)

    const raw2 = structuredClone(valid)
    raw2.edges.push({ from: 'n', to: 'f', port: 'sim' })
    expect(errorsOf(raw2).some((e) => e.startsWith('edges[3].port'))).toBe(true)

    const raw3 = structuredClone(valid)
    raw3.edges.push({ from: 'c', to: 'n', port: 'nao' })
    expect(errorsOf(raw3).some((e) => /já está ligada/.test(e))).toBe(true)

    const raw4 = structuredClone(valid)
    raw4.edges.push({ from: 'n', to: 'g', port: 'out' })
    expect(errorsOf(raw4).some((e) => /gatilho e não recebe/.test(e))).toBe(true)
  })

  it('exige lista de etapas não vazia e lista de ligações', () => {
    expect(errorsOf({ name: 'x', nodes: [], edges: [] })).toContain('nodes: a lista está vazia')
    expect(errorsOf({ name: 'x', nodes: valid.nodes })).toContain('edges: obrigatório (use [] se não houver ligações)')
    expect(errorsOf({ name: '', nodes: valid.nodes, edges: [] })[0]).toMatch(/^name/)
  })

  it('limita o tamanho para não travar a interface', () => {
    const nodes = Array.from({ length: 41 }, (_, i) => ({ id: `t${i}`, type: 'acao.tarefa', config: { titulo: 'x' } }))
    expect(errorsOf({ name: 'x', nodes, edges: [] })[0]).toMatch(/no máximo 40/)
  })

  it('o rascunho ganha layout da esquerda para a direita', () => {
    const r = parseFlowDraft(valid)
    if (!r.ok) throw new Error('inválido')
    const f = draftToFlow(r.value)
    const x = Object.fromEntries(f.nodes.map((n) => [n.id, n.position.x]))
    expect(x.g).toBeLessThan(x.c)
    expect(x.c).toBeLessThan(x.n)
    const y = Object.fromEntries(f.nodes.map((n) => [n.id, n.position.y]))
    expect(y.n).toBeLessThan(y.f)
  })
})

describe('exportar e importar', () => {
  it('ida e volta preserva o fluxo', () => {
    const f = templateFlow('loja-triagem-whatsapp')
    const back = parseFlowFile(JSON.parse(serializeFlow(f)))
    expect(back.ok).toBe(true)
    if (back.ok) expect(back.value).toEqual(f)
  })

  it('arquivo de versão desconhecida é recusado', () => {
    const f = { ...templateFlow('clinica-confirmacao'), version: 7 }
    const r = parseFlowFile(f)
    expect(r.ok).toBe(false)
  })
})
