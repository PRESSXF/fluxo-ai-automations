import type { Provider, Usage } from './types'
import { BUILD_SYSTEM, BUILD_TOOL, CLASSIFY_SYSTEM, SUMMARY_SYSTEM, classifyTool } from './prompt'

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }

interface MessagesResponse {
  content: Block[]
  usage: { input_tokens: number; output_tokens: number }
}

export const API_URL = 'https://api.anthropic.com/v1/messages'

/** Monta o corpo da chamada. Separado para ser testado sem rede. */
export function buildRequest(model: string, description: string) {
  return {
    model,
    max_tokens: 2000,
    system: BUILD_SYSTEM,
    tools: [BUILD_TOOL],
    // Força a resposta pela ferramenta: o modelo devolve JSON estruturado, nunca texto livre.
    tool_choice: { type: 'tool', name: BUILD_TOOL.name },
    messages: [{ role: 'user', content: `Descrição do processo:\n"""${description}"""` }],
  }
}

/** Extrai a entrada da ferramenta pedida. Se o modelo respondeu outra coisa, devolve o texto como recusa. */
export function extractToolInput(data: MessagesResponse, tool: string): { input?: unknown; text: string } {
  const text = data.content
    .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  const use = data.content.find((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use' && b.name === tool)
  return { input: use?.input, text }
}

const toUsage = (u: MessagesResponse['usage']): Usage => ({ inputTokens: u.input_tokens, outputTokens: u.output_tokens, estimated: false })

export function createAnthropicProvider(apiKey: string, model: string): Provider {
  async function call(body: unknown, signal?: AbortSignal): Promise<MessagesResponse> {
    const res = await fetch(API_URL, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // A chave fica só no navegador de quem testa; não existe servidor intermediário.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`A API respondeu ${res.status}: ${txt.slice(0, 240)}`)
    }
    return (await res.json()) as MessagesResponse
  }

  return {
    id: 'anthropic',
    label: 'Anthropic',
    model,
    async buildFlow(description, signal) {
      const data = await call(buildRequest(model, description), signal)
      const { input, text } = extractToolInput(data, BUILD_TOOL.name)
      if (input === undefined) return { raw: text, refusal: text || 'O modelo não chamou a ferramenta montar_fluxo.', notes: [], usage: toUsage(data.usage) }
      return { raw: input, notes: [], usage: toUsage(data.usage) }
    },
    async classify(text, categories, signal) {
      const tool = classifyTool(categories)
      const data = await call(
        { model, max_tokens: 300, system: CLASSIFY_SYSTEM, tools: [tool], tool_choice: { type: 'tool', name: tool.name }, messages: [{ role: 'user', content: `Categorias: ${categories.join(', ')}\n\nMensagem:\n"""${text}"""` }] },
        signal,
      )
      const { input } = extractToolInput(data, tool.name)
      const r = (input ?? {}) as { categoria?: unknown; confianca?: unknown; motivo?: unknown }
      // O motor confere se a categoria está na lista; aqui só normalizamos o formato.
      return {
        categoria: String(r.categoria ?? ''),
        confianca: typeof r.confianca === 'number' ? Math.max(0, Math.min(1, r.confianca)) : 0.5,
        motivo: String(r.motivo ?? ''),
      }
    },
    async summarize(text, signal) {
      const data = await call({ model, max_tokens: 300, system: SUMMARY_SYSTEM, messages: [{ role: 'user', content: text }] }, signal)
      return extractToolInput(data, '').text.trim()
    },
  }
}
