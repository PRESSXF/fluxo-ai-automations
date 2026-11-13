import { CATALOG, NUMERIC_OPERATORS, isNodeType, isTrigger, nodeTitle } from './catalog'
import type { Flow, FlowNode, Port } from './types'

export type IssueCode =
  | 'sem_gatilho'
  | 'varios_gatilhos'
  | 'tipo_desconhecido'
  | 'ligacao_quebrada'
  | 'saida_invalida'
  | 'saida_duplicada'
  | 'entrada_em_gatilho'
  | 'ciclo'
  | 'etapa_solta'
  | 'campo_obrigatorio'
  | 'valor_invalido'
  | 'condicao_sem_sim'
  | 'condicao_sem_senao'
  | 'gatilho_sem_saida'
  | 'caminho_aberto'

export interface Issue {
  code: IssueCode
  severity: 'erro' | 'aviso'
  message: string
  /** O que fazer para resolver, em linguagem de quem usa. */
  hint: string
  nodeIds: string[]
  edgeId?: string
}

/**
 * Encontra ciclos com DFS em três cores. Devolve cada ciclo como a lista de
 * etapas que o formam, na ordem em que o fluxo passaria por elas.
 */
export function findCycles(flow: Pick<Flow, 'nodes' | 'edges'>): string[][] {
  const adj = new Map<string, string[]>()
  for (const n of flow.nodes) adj.set(n.id, [])
  for (const e of flow.edges) if (adj.has(e.from) && adj.has(e.to)) adj.get(e.from)!.push(e.to)

  const color = new Map<string, 0 | 1 | 2>()
  const stack: string[] = []
  const cycles: string[][] = []
  const seenKeys = new Set<string>()

  const dfs = (u: string) => {
    color.set(u, 1)
    stack.push(u)
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? 0
      if (c === 0) dfs(v)
      else if (c === 1) {
        const cycle = stack.slice(stack.indexOf(v))
        const key = [...cycle].sort().join('|')
        if (!seenKeys.has(key)) {
          seenKeys.add(key)
          cycles.push(cycle)
        }
      }
    }
    stack.pop()
    color.set(u, 2)
  }
  for (const n of flow.nodes) if ((color.get(n.id) ?? 0) === 0) dfs(n.id)
  return cycles
}

export function reachableFrom(flow: Pick<Flow, 'nodes' | 'edges'>, start: string[]): Set<string> {
  const seen = new Set<string>()
  const queue = [...start]
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const e of flow.edges) if (e.from === id) queue.push(e.to)
  }
  return seen
}

const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === ''

function checkFields(n: FlowNode, issues: Issue[]) {
  const spec = CATALOG[n.type]
  const title = nodeTitle(n)
  for (const f of spec.fields) {
    const v = n.config[f.key]
    const optionalHere = n.type === 'condicao' && f.key === 'valor' && n.config.operador === 'existe'
    if (f.required && !optionalHere && isBlank(v)) {
      issues.push({
        code: 'campo_obrigatorio',
        severity: 'erro',
        message: `"${title}" está sem ${f.label.toLowerCase()}.`,
        hint: `Abra a etapa e preencha o campo "${f.label}".`,
        nodeIds: [n.id],
      })
      continue
    }
    if (isBlank(v)) continue
    if (f.kind === 'number' && (!Number.isFinite(Number(v)) || Number(v) < 0)) {
      issues.push({ code: 'valor_invalido', severity: 'erro', message: `"${title}": ${f.label.toLowerCase()} precisa ser um número.`, hint: 'Use só algarismos, sem unidade.', nodeIds: [n.id] })
    }
    if (f.kind === 'select' && f.options && !f.options.some(([o]) => o === String(v))) {
      issues.push({ code: 'valor_invalido', severity: 'erro', message: `"${title}": opção "${v}" não existe em ${f.label.toLowerCase()}.`, hint: 'Escolha uma das opções da lista.', nodeIds: [n.id] })
    }
    if (f.kind === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) {
      issues.push({ code: 'valor_invalido', severity: 'erro', message: `"${title}": horário "${v}" inválido.`, hint: 'Use o formato 24 h, como 09:00.', nodeIds: [n.id] })
    }
  }
  if (n.type === 'controle.esperar' && Number(n.config.minutos) === 0) {
    issues.push({ code: 'valor_invalido', severity: 'erro', message: `"${title}" espera 0 minutos.`, hint: 'Defina um tempo maior que zero ou remova a etapa.', nodeIds: [n.id] })
  }
  if (n.type === 'condicao' && NUMERIC_OPERATORS.has(String(n.config.operador)) && !isBlank(n.config.valor) && !Number.isFinite(Number(String(n.config.valor).replace(',', '.')))) {
    issues.push({
      code: 'valor_invalido',
      severity: 'erro',
      message: `"${title}" compara "${n.config.campo}" com "${n.config.valor}", que não é número.`,
      hint: 'Para maior/menor, use um número, como 200. Para texto, use "contém" ou "igual a".',
      nodeIds: [n.id],
    })
  }
  if (n.type === 'ia.classificar') {
    const cats = String(n.config.categorias ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (cats.length === 1) issues.push({ code: 'valor_invalido', severity: 'erro', message: `"${title}" tem uma categoria só.`, hint: 'Classificar exige pelo menos duas categorias, separadas por vírgula.', nodeIds: [n.id] })
  }
}

/**
 * Valida o fluxo inteiro e explica cada problema. Erros impedem a execução;
 * avisos não. A ordem segue a gravidade: estrutura primeiro, depois campos.
 */
export function validateFlow(flow: Flow): Issue[] {
  const issues: Issue[] = []
  const byId = new Map(flow.nodes.map((n) => [n.id, n]))

  for (const n of flow.nodes) {
    if (!isNodeType(n.type)) {
      issues.push({ code: 'tipo_desconhecido', severity: 'erro', message: `Etapa "${n.id}" tem um tipo desconhecido (${String(n.type)}).`, hint: 'Remova a etapa ou troque por um bloco da paleta.', nodeIds: [n.id] })
    }
  }
  const nodes = flow.nodes.filter((n) => isNodeType(n.type))
  const triggers = nodes.filter((n) => isTrigger(n.type))

  if (nodes.length === 0) {
    issues.push({ code: 'sem_gatilho', severity: 'erro', message: 'O fluxo está vazio.', hint: 'Comece por um gatilho, como "Pedido criado", ou descreva o processo para a IA montar.', nodeIds: [] })
    return issues
  }
  if (triggers.length === 0) {
    issues.push({ code: 'sem_gatilho', severity: 'erro', message: 'O fluxo não tem gatilho, então nunca vai começar.', hint: 'Adicione um gatilho da paleta e ligue a saída dele à primeira etapa.', nodeIds: [] })
  } else if (triggers.length > 1) {
    issues.push({
      code: 'varios_gatilhos',
      severity: 'erro',
      message: `O fluxo tem ${triggers.length} gatilhos. Cada fluxo começa por um evento só.`,
      hint: 'Mantenha um gatilho e crie outro fluxo para o segundo evento.',
      nodeIds: triggers.map((t) => t.id),
    })
  }

  const portCount = new Map<string, number>()
  for (const e of flow.edges) {
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    if (!a || !b) {
      issues.push({ code: 'ligacao_quebrada', severity: 'erro', message: 'Existe uma ligação apontando para uma etapa que não existe.', hint: 'Exclua a ligação e refaça.', nodeIds: [a?.id, b?.id].filter(Boolean) as string[], edgeId: e.id })
      continue
    }
    if (!isNodeType(a.type) || !isNodeType(b.type)) continue
    if (!CATALOG[a.type].ports.includes(e.port)) {
      issues.push({ code: 'saida_invalida', severity: 'erro', message: `"${nodeTitle(a)}" não tem a saída "${e.port}".`, hint: 'Refaça a ligação a partir de uma saída que a etapa tenha.', nodeIds: [a.id], edgeId: e.id })
    }
    if (!CATALOG[b.type].hasInput) {
      issues.push({ code: 'entrada_em_gatilho', severity: 'erro', message: `"${nodeTitle(b)}" é um gatilho e não pode receber ligação.`, hint: 'Gatilhos só iniciam o fluxo. Remova a ligação que chega nele.', nodeIds: [b.id], edgeId: e.id })
    }
    const key = `${e.from}:${e.port}`
    portCount.set(key, (portCount.get(key) ?? 0) + 1)
    if (portCount.get(key) === 2) {
      issues.push({ code: 'saida_duplicada', severity: 'erro', message: `"${nodeTitle(a)}" tem duas ligações saindo do mesmo ponto.`, hint: 'Cada saída leva a uma etapa só. Encadeie as ações uma depois da outra.', nodeIds: [a.id] })
    }
  }

  for (const cycle of findCycles({ nodes, edges: flow.edges })) {
    const names = cycle.map((id) => nodeTitle(byId.get(id)!))
    issues.push({
      code: 'ciclo',
      severity: 'erro',
      message: `Ciclo: ${[...names, names[0]].join(' → ')}. O fluxo rodaria para sempre.`,
      hint: 'Remova uma das ligações que voltam para uma etapa anterior.',
      nodeIds: cycle,
    })
  }

  if (triggers.length > 0) {
    const reach = reachableFrom({ nodes, edges: flow.edges }, triggers.map((t) => t.id))
    const loose = nodes.filter((n) => !reach.has(n.id))
    for (const n of loose) {
      issues.push({
        code: 'etapa_solta',
        severity: 'erro',
        message: `"${nodeTitle(n)}" está solta: nenhum caminho a partir do gatilho chega nela.`,
        hint: 'Ligue uma etapa anterior a ela ou exclua a etapa.',
        nodeIds: [n.id],
      })
    }
  }

  for (const n of nodes) {
    const outs = new Set<Port>(flow.edges.filter((e) => e.from === n.id).map((e) => e.port))
    if (n.type === 'condicao') {
      if (!outs.has('sim'))
        issues.push({ code: 'condicao_sem_sim', severity: 'erro', message: `"${nodeTitle(n)}" não diz o que fazer quando a regra é verdadeira.`, hint: 'Ligue a saída "se sim" a uma etapa.', nodeIds: [n.id] })
      if (!outs.has('nao'))
        issues.push({
          code: 'condicao_sem_senao',
          severity: 'erro',
          message: `"${nodeTitle(n)}" não diz o que fazer quando a regra é falsa.`,
          hint: 'Ligue a saída "se não" a uma etapa. Se nada deve acontecer, ligue a um bloco "Encerrar" para deixar isso explícito.',
          nodeIds: [n.id],
        })
    } else if (isTrigger(n.type) && !outs.has('out')) {
      issues.push({ code: 'gatilho_sem_saida', severity: 'erro', message: `O gatilho "${nodeTitle(n)}" não leva a nenhuma etapa.`, hint: 'Ligue a saída do gatilho à primeira ação.', nodeIds: [n.id] })
    } else if (n.type === 'ia.classificar' && !outs.has('out')) {
      issues.push({ code: 'caminho_aberto', severity: 'aviso', message: `"${nodeTitle(n)}" classifica, mas nenhuma etapa usa o resultado.`, hint: 'Ligue a uma condição que leia a categoria, como classificacao.categoria igual a reclamação.', nodeIds: [n.id] })
    }
    checkFields(n, issues)
  }

  const rank = (i: Issue) => (i.severity === 'erro' ? 0 : 1)
  return issues.sort((a, b) => rank(a) - rank(b))
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.severity === 'erro')
