import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildRequest, createAnthropicProvider, extractToolInput } from '../src/ai/anthropic'
import { generateFlow } from '../src/ai/generate'
import { createDemoProvider } from '../src/ai/demo/provider'
import { BUILD_SYSTEM } from '../src/ai/prompt'
import { NODE_TYPES } from '../src/domain/catalog'

const usage = { input_tokens: 10, output_tokens: 20 }
const reply = (content: unknown[]) => new Response(JSON.stringify({ content, usage }), { status: 200 })

afterEach(() => vi.unstubAllGlobals())

describe('provedor Anthropic', () => {
  it('força a resposta pela ferramenta montar_fluxo', () => {
    const body = buildRequest('claude-haiku-4-5', 'quando chegar pedido, avise')
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'montar_fluxo' })
    expect(body.tools[0].input_schema.properties.nodes.items.properties.type.enum).toEqual(NODE_TYPES)
  })

  it('o prompt descreve todos os tipos de etapa', () => {
    for (const t of NODE_TYPES) expect(BUILD_SYSTEM).toContain(t)
  })

  it('extrai a entrada da ferramenta e o texto', () => {
    const r = extractToolInput({ content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: '1', name: 'montar_fluxo', input: { a: 1 } }], usage }, 'montar_fluxo')
    expect(r).toEqual({ input: { a: 1 }, text: 'ok' })
  })

  it('envia os cabeçalhos de acesso direto pelo navegador', async () => {
    const fetchMock = vi.fn(async () => reply([{ type: 'text', text: 'Resumo.' }]))
    vi.stubGlobal('fetch', fetchMock)
    await createAnthropicProvider('sk-ant-teste', 'claude-haiku-4-5').summarize('texto')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(headers['x-api-key']).toBe('sk-ant-teste')
  })

  it('JSON inválido do modelo é rejeitado com erro claro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply([{ type: 'tool_use', id: '1', name: 'montar_fluxo', input: { name: 'x', nodes: [{ id: 'a', type: 'gatilho.telepatia', config: {} }], edges: [] } }])))
    const r = await generateFlow(createAnthropicProvider('sk-ant-x', 'm'), 'qualquer')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.stage).toBe('formato')
    expect(!r.ok && r.errors[0]).toMatch(/nodes\[0\]\.type/)
  })

  it('resposta só em texto vira recusa, e erro HTTP vira erro do provedor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply([{ type: 'text', text: 'Não consigo.' }])))
    const a = await generateFlow(createAnthropicProvider('sk-ant-x', 'm'), 'x')
    expect(!a.ok && a.stage).toBe('recusa')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"invalid x-api-key"}', { status: 401 })))
    const b = await generateFlow(createAnthropicProvider('sk-ant-x', 'm'), 'x')
    expect(!b.ok && b.stage).toBe('provedor')
    expect(!b.ok && b.errors[0]).toMatch(/401/)
  })

  it('classificação limita confiança a 0..1', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply([{ type: 'tool_use', id: '1', name: 'classificar', input: { categoria: 'dúvida', confianca: 7, motivo: 'pergunta' } }])))
    const r = await createAnthropicProvider('sk-ant-x', 'm').classify('tem G?', ['reclamação', 'dúvida'])
    expect(r).toEqual({ categoria: 'dúvida', confianca: 1, motivo: 'pergunta' })
  })
})

describe('pipeline com o provedor de demonstração', () => {
  it('fluxo válido sai com layout e sem problemas', async () => {
    const r = await generateFlow(createDemoProvider(), 'Quando chegar um pedido acima de R$ 200, avise o gerente')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.issues).toEqual([])
    expect(r.flow.nodes.every((n) => Number.isFinite(n.position.x))).toBe(true)
    expect(r.usage.estimated).toBe(true)
  })

  it('descrição incompreensível volta como recusa explicada', async () => {
    const r = await generateFlow(createDemoProvider(), 'bom dia')
    expect(!r.ok && r.stage).toBe('recusa')
  })
})
