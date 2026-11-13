import { normalizeText, type Classification } from '../../domain/engine'
import type { Provider } from '../types'
import { parseDescription } from './parser'

/**
 * Provedor de demonstração: regras locais, determinísticas, sem chave.
 * Devolve exatamente o mesmo formato de JSON que o modelo real, para passar
 * pela mesma validação. A interface avisa sempre que este modo está ativo.
 */

const KEYWORDS: Record<string, string[]> = {
  reclamacao: ['reclam', 'absurdo', 'nao chegou', 'ate agora nada', 'atras', 'demor', 'ninguem responde', 'pessim', 'horrivel', 'errad', 'quebrad', 'defeito', 'insatisf', 'solucao', 'procon', 'decepcion', 'descaso', 'frio'],
  duvida: ['?', 'qual ', 'quanto', 'tem no', 'como ', 'onde', 'duvida', 'gostaria de saber', 'funciona', 'voces tem', 'aceita'],
  elogio: ['amei', 'adorei', 'perfeit', 'obrigad', 'parabens', 'otim', 'excelente', 'maravilh', 'elogi', 'nota 10', 'capricho'],
  troca: ['troca', 'trocar', 'nao serviu', 'tamanho errado', 'apertad', 'folgad'],
  devolucao: ['devolu', 'devolver', 'estorno', 'reembolso'],
  pedido: ['quero pedir', 'gostaria de pedir', 'encomend', 'quero comprar', 'faz entrega', 'quero um', 'quero uma'],
  cancelamento: ['cancel', 'desist'],
  urgente: ['urgente', 'agora', 'imediat', 'socorro'],
  orcamento: ['orcamento', 'preco', 'quanto custa', 'valor'],
  agendamento: ['agendar', 'marcar', 'horario', 'consulta', 'remarcar'],
}

export function classifyDemo(text: string, categories: string[]): Classification {
  const t = ` ${normalizeText(text)} `
  let best = { cat: categories[0], score: 0, hits: [] as string[] }
  for (const cat of categories) {
    const key = normalizeText(cat).replace(/s$/, '')
    const words = KEYWORDS[key] ?? KEYWORDS[normalizeText(cat)] ?? [key]
    const hits = words.filter((w) => t.includes(w))
    if (hits.length > best.score) best = { cat, score: hits.length, hits }
  }
  if (best.score === 0) {
    const fallback = categories.find((c) => /outr|geral|duvida/.test(normalizeText(c))) ?? categories[categories.length - 1]
    return { categoria: fallback, confianca: 0.4, motivo: 'Nenhuma palavra típica encontrada; ficou na categoria mais genérica.' }
  }
  return {
    categoria: best.cat,
    confianca: Math.min(0.95, 0.55 + best.score * 0.1),
    motivo: `Sinais encontrados: ${best.hits.map((h) => `"${h.trim()}"`).join(', ')}.`,
  }
}

const WEIGHT = /reclam|elogi|acabou|demor|atras|pediu|nao |sem |falt|quebr|erro|cancel|ninguem|urgente|\d/

/** Resumo extrativo: escolhe as frases com mais informação e mantém a ordem original. */
export function summarizeDemo(text: string, max = 220): string {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (sentences.length <= 1) return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
  const scored = sentences.map((s, i) => ({ s, i, score: (WEIGHT.test(normalizeText(s)) ? 2 : 0) + Math.min(s.length, 120) / 120 - i * 0.05 }))
  const picked: typeof scored = []
  let len = 0
  for (const c of [...scored].sort((a, b) => b.score - a.score)) {
    if (len + c.s.length > max && picked.length) continue
    picked.push(c)
    len += c.s.length + 1
    if (picked.length === 3) break
  }
  return picked
    .sort((a, b) => a.i - b.i)
    .map((c) => c.s)
    .join(' ')
}

const estimate = (s: string) => Math.ceil(s.length / 4)

export function createDemoProvider(opts: { latencyMs?: number } = {}): Provider {
  const wait = (signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      if (!opts.latencyMs) return resolve()
      const id = setTimeout(resolve, opts.latencyMs)
      signal?.addEventListener('abort', () => {
        clearTimeout(id)
        reject(new Error('Cancelado.'))
      })
    })
  return {
    id: 'demo',
    label: 'Demonstração',
    model: 'regras locais',
    async buildFlow(description, signal) {
      await wait(signal)
      const r = parseDescription(description)
      const usage = { inputTokens: estimate(description) + 900, outputTokens: r.ok ? estimate(JSON.stringify(r.draft)) : 40, estimated: true }
      if (!r.ok) return { raw: null, refusal: r.error, notes: r.notes, usage }
      return { raw: r.draft, notes: r.notes, usage }
    },
    async classify(text, categories, signal) {
      await wait(signal)
      return classifyDemo(text, categories)
    },
    async summarize(text, signal) {
      await wait(signal)
      return summarizeDemo(text)
    },
  }
}
