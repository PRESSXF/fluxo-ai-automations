import { CATALOG } from '../../domain/catalog'
import { normalizeText, parseNumber } from '../../domain/engine'
import type { ConfigValue, FlowDraft, NodeType } from '../../domain/types'

/**
 * Leitor de descrições em português usado pelo modo demonstração.
 * Reconhece um conjunto grande, mas finito, de jeitos de escrever gatilho,
 * condição e ações, e monta o mesmo JSON que o modelo real devolveria.
 * Não tenta ser esperto: quando não entende, diz o que faltou.
 */

export type TriggerKind = 'gatilho.pedido' | 'gatilho.whatsapp' | 'gatilho.agendamento' | 'gatilho.horario'

export interface ParsedCondition {
  campo: string
  operador: string
  valor: string
  /** A condição depende de uma classificação feita pela IA. */
  needsClassify?: string
  at: number
}

interface ActionPlan {
  type: NodeType
  config: Record<string, ConfigValue>
  label?: string
  at: number
}

export type ParseOutcome = { ok: true; draft: FlowDraft; notes: string[] } | { ok: false; error: string; notes: string[] }

/* ---------- vocabulário ---------- */

const ROLES: Record<string, string> = {
  gerente: 'Gerente',
  gestor: 'Gestor',
  dono: 'Dono',
  dona: 'Dona',
  socio: 'Sócio',
  equipe: 'Equipe',
  time: 'Equipe',
  cozinha: 'Cozinha',
  atendimento: 'Atendimento',
  atendente: 'Atendente',
  financeiro: 'Financeiro',
  recepcao: 'Recepção',
  recepcionista: 'Recepção',
  vendedor: 'Vendedor',
  estoque: 'Estoque',
  entregador: 'Entregador',
  supervisor: 'Supervisor',
  responsavel: 'Responsável',
  dentista: 'Dentista',
  medico: 'Médico',
  medica: 'Médica',
}
const ROLE_RE = new RegExp(`\\b(${Object.keys(ROLES).join('|')})\\b`)
const ROLE_AFTER_PARA_RE = new RegExp(`\\bpara (?:o |a |os |as )?(${Object.keys(ROLES).join('|')})\\b`)

export const CATEGORY_LABELS: Record<string, string> = {
  reclamacao: 'reclamação',
  duvida: 'dúvida',
  elogio: 'elogio',
  troca: 'troca',
  devolucao: 'devolução',
  cancelamento: 'cancelamento',
  urgente: 'urgente',
  orcamento: 'orçamento',
  pedido: 'pedido',
  agendamento: 'agendamento',
}

const NUMBER_WORDS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, dez: 10, quinze: 15, vinte: 20, trinta: 30 }

const IMPERATIVE = {
  notify: /\b(avise|notifique|alerte|chame|acione|informe|comunique)\b/,
  send: /\b(envie|mande|responda|agradeca|confirme|lembre|dispare|escreva|retorne|responde|manda|envia)\b/,
}
const ANY_FORM = {
  notify: /\b(avis[ae]r?|notifi(?:que|car)|alert[ae]r?|cham[ae]r?|acion[ae]r?|inform[ae]r?|comuni(?:que|car))\b/,
  send: /\b(envi[ae]r?|mand[ae]r?|respond[ae]r?|agradec[ae]r?|agradeca|confirm[ae]r?|lembr[ae]r?|dispar[ae]r?|escrev[ae]r?|retorn[ae]r?)\b/,
}
const TASK_RE = /\btarefas?\b/
const SHEET_RE = /\bplanilha\b|\bregistr[ae]r?\b|\banot[ae]r?\b/
const CLASSIFY_RE = /\bclassifi\w*|\bcategoriz\w*|\btriagem\b/
const SUMMARY_RE = /\bresum(?:a|ir|o|e)\b/
const WAIT_RE = /\b(?:espere|esperar|aguarde|aguardar|depois de|apos|passados?)\s+(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|dez|quinze|vinte|trinta|meia)\s*(minutos?|min|horas?|h|dias?)\b/
const WAIT_AFTER_RE = /\b(\d+|um|uma|dois|duas|tres)\s*(minutos?|min|horas?|h|dias?)\s+depois\b/
const END_RE = /\b(encerre|encerrar|nao faca nada|nao faz nada|ignore|ignorar|nada)\b/

/* ---------- gatilho ---------- */

const TRIGGER_START = /^(quando|sempre que|assim que|toda vez que|todo|toda|todos|nos|aos|de segunda|diariamente|se|caso|ao|cada vez que)\b/

export function detectTrigger(t: string, clause: string): { type: TriggerKind; config: Record<string, ConfigValue>; note: string } | null {
  const daily = /\b(todo dia|todos os dias|diariamente|toda manha|todas as manhas|toda noite|toda tarde|dias uteis|segunda a sexta|de manha cedo|cada dia)\b/
  const hour = /\b(?:as|a partir das)\s*(\d{1,2})(?:\s*[:h]\s*(\d{2}))?\s*(?:h\b|horas?\b)?|\bmeio[- ]dia\b/
  if (daily.test(t)) {
    const m = t.match(hour)
    let hh = 9
    let mm = 0
    if (m) {
      if (m[0].startsWith('meio')) hh = 12
      else {
        hh = Math.min(23, Number(m[1]))
        mm = m[2] ? Math.min(59, Number(m[2])) : 0
      }
    }
    if (/\b(da noite|a noite)\b/.test(t) && hh < 12) hh += 12
    if (/\b(da tarde|a tarde)\b/.test(t) && hh < 12) hh += 12
    const hora = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    const uteis = /\b(dias uteis|segunda a sexta)\b/.test(t)
    return { type: 'gatilho.horario', config: { hora, dias: uteis ? 'uteis' : 'todos' }, note: `Gatilho: horário programado, ${hora}${uteis ? ' em dias úteis' : ' todos os dias'}.` }
  }
  const tests: Array<[TriggerKind, RegExp, string]> = [
    ['gatilho.agendamento', /\b(agendamento|agendar|agendad[oa]s?|consultas? (?:for |forem )?marcad[ao]s?|marcar (?:uma )?consulta|marcarem|horario (?:for )?marcado|nova consulta|paciente marcar)\b/, 'Gatilho: agendamento marcado.'],
    ['gatilho.pedido', /\b(pedidos?|compras?|vendas? nova|nova venda|encomendas?)\b/, 'Gatilho: pedido criado.'],
    ['gatilho.whatsapp', /\b(mensage(?:m|ns)|whatsapp|zap|escrever|escrevem|perguntar|chamar no)\b/, 'Gatilho: mensagem recebida no WhatsApp.'],
  ]
  for (const scope of [clause, t]) {
    for (const [type, re, note] of tests) {
      if (re.test(scope)) {
        const config: Record<string, ConfigValue> = { ...CATALOG[type].defaults }
        if (type === 'gatilho.pedido') {
          if (/\b(ifood|app de entrega|aplicativo)\b/.test(scope)) config.canal = 'app'
          else if (/\bsite\b/.test(scope)) config.canal = 'site'
          else if (/\bbalcao\b/.test(scope)) config.canal = 'balcao'
        }
        return { type, config, note }
      }
    }
  }
  return null
}

/* ---------- caminhos de dados por gatilho ---------- */

function paths(trigger: TriggerKind) {
  const person = trigger === 'gatilho.agendamento' ? 'paciente' : 'cliente'
  return {
    nome: `{{${person}.nome}}`,
    telefone: `{{${person}.telefone}}`,
    email: `{{${person}.email}}`,
    valor: trigger === 'gatilho.horario' ? 'vendasOntem.total' : 'pedido.valor',
    texto: trigger === 'gatilho.whatsapp' ? 'mensagem.texto' : trigger === 'gatilho.pedido' ? 'pedido.observacao' : trigger === 'gatilho.agendamento' ? 'agendamento.procedimento' : 'vendasOntem.comentarios',
    ref: trigger === 'gatilho.pedido' ? 'pedido {{pedido.id}}' : trigger === 'gatilho.agendamento' ? 'consulta de {{paciente.nome}}' : trigger === 'gatilho.whatsapp' ? '{{cliente.nome}}' : 'ontem',
  }
}

/* ---------- condição ---------- */

const NUM = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\s*(?:min|h\b|hora|dia|%|\d))`

export function detectCondition(t: string, trigger: TriggerKind, src = t): ParsedCondition | null {
  const p = paths(trigger)
  const gt = new RegExp(String.raw`\b(acima de|maior (?:que|do que)|mais (?:de|que|do que)|superior a|a partir de|passar de|ultrapassar|acima dos?|igual ou maior (?:que|a))\s*(?:r\$\s*)?${NUM}`)
  const lt = new RegExp(String.raw`\b(abaixo de|menor (?:que|do que)|menos (?:de|que|do que)|inferior a|ate(?= r\$)|nao passar de|abaixo dos?)\s*(?:r\$\s*)?${NUM}`)
  for (const [re, kind] of [
    [gt, 'gt'],
    [lt, 'lt'],
  ] as const) {
    const m = t.match(re)
    if (m && m.index !== undefined) {
      const n = parseNumber(m[2])
      if (n === null) continue
      const inclusive = /a partir de|igual ou maior/.test(m[1]) || m[1] === 'ate'
      const operador = kind === 'gt' ? (inclusive ? 'maior_igual' : 'maior') : inclusive ? 'menor_igual' : 'menor'
      return { campo: p.valor, operador, valor: String(n), at: m.index }
    }
  }

  const cat = t.match(/\bse (?:a mensagem |o cliente |o assunto |o contato |ela |ele )?(?:for|forem|estiver|parecer|vier como|tratar de|se tratar de)\s+(?:uma |um |de )?(reclamacao|duvida|elogio|troca|devolucao|cancelamento|urgente|orcamento|pedido|agendamento)/)
  if (cat && cat.index !== undefined) {
    const label = CATEGORY_LABELS[cat[1]]
    return { campo: 'classificacao.categoria', operador: 'igual', valor: label, needsClassify: label, at: cat.index }
  }

  if (/\bprimeira consulta\b/.test(t) && /\b(se|caso|quando) (?:for |a |o )?(?:a )?primeira consulta\b/.test(t)) {
    return { campo: 'agendamento.primeiraConsulta', operador: 'igual', valor: 'sim', at: t.indexOf('primeira consulta') }
  }

  const has = t.match(/\b(?:contiver|conter|contem|contendo|tiver|mencionar|mencione|mencionando|falar(?: em| de| sobre)?|falando(?: em| de| sobre)?|fale(?: em| de)?|disser|citar|citando|com a palavra|com o termo)\s+(?:a palavra |o termo |a expressao |as palavras )?["'“”‘’]?([a-z0-9][a-z0-9 ]{0,30}?)["'“”‘’]?(?=[,;.]|$| e | entao| avise| notifique| crie| envie| mande| responda)/)
  if (has && has.index !== undefined && /\b(se|quando|caso|com)\b/.test(t.slice(Math.max(0, has.index - 40), has.index + 1))) {
    const start = has.index + has[0].indexOf(has[1])
    const word = src.slice(start, start + has[1].length).trim().toLowerCase()
    if (word && !['valor', 'pedido'].includes(word)) return { campo: p.texto, operador: 'contem', valor: word, at: has.index }
  }
  return null
}

/* ---------- ações ---------- */

/**
 * Normaliza sem mudar o comprimento: cada posição de `t` (minúsculo, sem acento)
 * corresponde à mesma posição de `src` (texto original). Assim o leitor casa
 * padrões no texto normalizado e recorta títulos e palavras do original, com acento.
 */
export function normalizeKeepingIndex(input: string): { t: string; src: string } {
  const src = input.normalize('NFC').replace(/\s+/g, ' ').trim().replace(/R\$\s*/gi, 'R$ ')
  const t = src
    .split('')
    .map((ch) => ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().charAt(0) || ch)
    .join('')
  return { t, src }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function channelOf(seg: string): 'whatsapp' | 'email' | 'sms' {
  if (/\be-?mail\b/.test(seg)) return 'email'
  if (/\bsms\b/.test(seg)) return 'sms'
  return 'whatsapp'
}

function waitMinutes(seg: string): number | null {
  const m = seg.match(WAIT_RE) ?? seg.match(WAIT_AFTER_RE)
  if (!m) return null
  const qty = m[1] === 'meia' ? 0.5 : (NUMBER_WORDS[m[1]] ?? Number(m[1]))
  const unit = m[2].startsWith('d') ? 1440 : m[2].startsWith('h') ? 60 : 1
  const min = Math.round(qty * (m[1] === 'meia' ? 60 : unit))
  return min > 0 ? min : null
}

function roleIn(seg: string): string | null {
  const m = seg.match(ROLE_AFTER_PARA_RE) ?? seg.match(ROLE_RE)
  return m ? ROLES[m[1]] : null
}

interface Ctx {
  src: string
  trigger: TriggerKind
  hasSummary: boolean
  hasClassify: boolean
}

function messageText(seg: string, ctx: Ctx): { texto: string; label?: string } {
  const p = paths(ctx.trigger)
  if (/\bcupom|desconto\b/.test(seg)) return { texto: `${p.nome}, obrigado pela preferência! Use o cupom VOLTE10 e ganhe 10% no próximo pedido.`, label: 'Enviar cupom' }
  if (/\bcardapio\b/.test(seg)) return { texto: `Oi, ${p.nome}! Segue o nosso cardápio de hoje: exemplo.com/cardapio`, label: 'Responder com cardápio' }
  if (/\blembr|lembrete\b/.test(seg))
    return { texto: ctx.trigger === 'gatilho.agendamento' ? `${p.nome}, lembrete da sua consulta em {{agendamento.data}} às {{agendamento.hora}}.` : `${p.nome}, passando para lembrar do seu ${p.ref}.`, label: 'Lembrete' }
  if (/\bconfirm/.test(seg))
    return {
      texto: ctx.trigger === 'gatilho.agendamento' ? `Olá, ${p.nome}! Sua consulta está marcada para {{agendamento.data}} às {{agendamento.hora}}.` : `Oi, ${p.nome}! Confirmamos o ${p.ref}.`,
      label: 'Confirmação',
    }
  if (/\bficha|cadastro|formulario/.test(seg)) return { texto: `${p.nome}, preencha sua ficha de cadastro antes do atendimento: exemplo.com/ficha`, label: 'Enviar ficha de cadastro' }
  if (/\bagradec|obrigad/.test(seg)) return { texto: `Obrigado pela compra, ${p.nome}! Qualquer coisa, é só chamar por aqui.`, label: 'Agradecimento' }
  if (/\bpesquisa|avalia/.test(seg)) return { texto: `${p.nome}, de 0 a 10, quanto você recomenda a gente? Responda com a nota.`, label: 'Pesquisa de satisfação' }
  if (/\bstatus|andamento|preparando|a caminho\b/.test(seg)) return { texto: `Oi, ${p.nome}! Seu ${p.ref} já está em preparo.`, label: 'Status do pedido' }
  if (ctx.trigger === 'gatilho.whatsapp') return { texto: `Oi, ${p.nome}! Recebemos sua mensagem e já vamos te atender.`, label: 'Resposta ao cliente' }
  if (ctx.trigger === 'gatilho.agendamento') return { texto: `Olá, ${p.nome}! Seu agendamento foi registrado.`, label: 'Mensagem ao paciente' }
  return { texto: `Oi, ${p.nome}! Recebemos o seu ${p.ref}.`, label: 'Mensagem ao cliente' }
}

function notifyText(ctx: Ctx): string {
  if (ctx.hasSummary) return ctx.trigger === 'gatilho.horario' ? 'Resumo de ontem: {{resumo}}' : `Resumo: {{resumo}}`
  switch (ctx.trigger) {
    case 'gatilho.pedido':
      return 'Pedido {{pedido.id}} de R$ {{pedido.valor}} para {{cliente.nome}}.'
    case 'gatilho.whatsapp':
      return ctx.hasClassify ? '{{classificacao.categoria}} de {{cliente.nome}}: {{mensagem.texto}}' : 'Mensagem de {{cliente.nome}}: {{mensagem.texto}}'
    case 'gatilho.agendamento':
      return 'Novo agendamento: {{paciente.nome}}, {{agendamento.data}} às {{agendamento.hora}}.'
    case 'gatilho.horario':
      return 'Vendas de ontem: R$ {{vendasOntem.total}} em {{vendasOntem.pedidos}} pedidos.'
  }
}

function taskTitle(seg: string, at: number, ctx: Ctx): string {
  const p = paths(ctx.trigger)
  const m = seg.match(/\btarefas? (?:de|para|pra) (.+?)(?= para (?:o |a )?(?:\w+)$| para (?:o |a )| no | na | com prazo| em ate|$)/)
  let base = m && m.index !== undefined ? ctx.src.slice(at + m.index + m[0].indexOf(m[1]), at + m.index + m[0].indexOf(m[1]) + m[1].length).trim() : undefined
  if (base && ROLES[normalizeText(base).replace(/^(o|a) /, '')]) base = undefined
  if (!base) return ctx.trigger === 'gatilho.pedido' ? 'Conferir pedido {{pedido.id}}' : ctx.trigger === 'gatilho.whatsapp' ? 'Atender {{cliente.nome}}' : ctx.trigger === 'gatilho.agendamento' ? 'Preparar consulta de {{paciente.nome}}' : 'Tarefa do dia'
  const suffix = ctx.trigger === 'gatilho.horario' ? '' : ctx.trigger === 'gatilho.pedido' ? ' · pedido {{pedido.id}}' : ` · ${p.nome}`
  return `${cap(base)}${suffix}`
}

function sheetConfig(seg: string, at: number, ctx: Ctx) {
  const m = seg.match(/\bplanilha (?:de |do |da |dos |das )?([a-z0-9 ]+?)(?= e |,|;|\.| com | para |$)/)
  const orig = m && m.index !== undefined ? ctx.src.slice(at + m.index + m[0].lastIndexOf(m[1]), at + m.index + m[0].lastIndexOf(m[1]) + m[1].length).trim() : ''
  const name = orig ? cap(orig) : ctx.trigger === 'gatilho.pedido' ? 'Pedidos' : ctx.trigger === 'gatilho.agendamento' ? 'Agendamentos' : ctx.trigger === 'gatilho.whatsapp' ? 'Atendimentos' : 'Fechamento'
  const linha =
    ctx.trigger === 'gatilho.pedido'
      ? '{{pedido.id}}; {{cliente.nome}}; {{pedido.valor}}'
      : ctx.trigger === 'gatilho.agendamento'
        ? '{{agendamento.data}}; {{paciente.nome}}; {{agendamento.procedimento}}'
        : ctx.trigger === 'gatilho.whatsapp'
          ? `{{cliente.nome}}; {{cliente.telefone}}; ${ctx.hasClassify ? '{{classificacao.categoria}}' : '{{mensagem.texto}}'}`
          : '{{vendasOntem.data}}; {{vendasOntem.total}}; {{vendasOntem.pedidos}}'
  return { planilha: name, linha }
}

function planAction(seg: string, at: number, ctx: Ctx, inTriggerClause: boolean, inElse: boolean, cond: ParsedCondition | null): ActionPlan | null {
  const p = paths(ctx.trigger)
  const notifyRe = inTriggerClause ? IMPERATIVE.notify : ANY_FORM.notify
  const sendRe = inTriggerClause ? IMPERATIVE.send : ANY_FORM.send
  const verbAt = (re: RegExp) => seg.search(re)

  const wait = waitMinutes(seg)
  if (wait) return { type: 'controle.esperar', config: { minutos: wait }, at: at + Math.max(0, seg.search(WAIT_RE)) }

  if (CLASSIFY_RE.test(seg)) {
    const cats = ['reclamação', 'dúvida', 'elogio', 'pedido']
    if (cond?.needsClassify && !cats.includes(cond.needsClassify)) cats.unshift(cond.needsClassify)
    return { type: 'ia.classificar', config: { texto: `{{${p.texto}}}`, categorias: cats.join(', '), salvarEm: 'classificacao' }, at: at + seg.search(CLASSIFY_RE) }
  }
  if (SUMMARY_RE.test(seg)) {
    return { type: 'ia.resumir', config: { texto: `{{${p.texto}}}`, salvarEm: 'resumo' }, at: at + seg.search(SUMMARY_RE) }
  }
  if (TASK_RE.test(seg)) {
    const role = roleIn(seg)
    const prazo = seg.match(/\b(?:prazo de|em ate|ate) (\d+) ?(h|horas?)\b/)
    return { type: 'acao.tarefa', config: { titulo: taskTitle(seg, at, ctx), responsavel: role ?? 'Equipe', prazoHoras: prazo ? Number(prazo[1]) : 4 }, at: at + seg.search(TASK_RE) }
  }
  if (/\bplanilha\b/.test(seg) || (SHEET_RE.test(seg) && !inTriggerClause && !sendRe.test(seg) && !notifyRe.test(seg))) {
    if (inTriggerClause && !/\b(registre|anote|atualize|adicione|lance)\b/.test(seg)) return null
    return { type: 'acao.planilha', config: sheetConfig(seg, at, ctx), at: at + Math.max(0, seg.search(SHEET_RE)) }
  }
  const role = roleIn(seg)
  const mentionsCustomer = /\b(cliente|paciente|comprador|consumidor|contato)\b/.test(seg)
  const n = verbAt(notifyRe)
  const s = verbAt(sendRe)
  if (n >= 0 || (s >= 0 && role && !mentionsCustomer)) {
    const dest = role ?? (mentionsCustomer ? null : 'Equipe')
    if (dest) return { type: 'acao.notificar', config: { destinatario: dest, canal: channelOf(seg), texto: notifyText(ctx) }, at: at + (n >= 0 ? n : s) }
  }
  if (s >= 0 || n >= 0) {
    const canal = channelOf(seg)
    const { texto, label } = messageText(seg, ctx)
    return { type: 'acao.mensagem', label, config: { canal, para: canal === 'email' ? p.email : p.telefone, texto }, at: at + Math.max(s, n) }
  }
  if (inElse && END_RE.test(seg)) return { type: 'controle.fim', config: {}, label: 'Nada a fazer', at }
  return null
}

/* ---------- montagem ---------- */

function splitSegments(text: string, offset: number): Array<{ seg: string; at: number }> {
  const out: Array<{ seg: string; at: number }> = []
  const sep = /\s*(?:[,;.:]|\be (?=(?:depois |em seguida |entao |tambem )?(?:avis|notifi|alert|cri|ger|abr|envi|mand|respond|agradec|esper|aguard|registr|atualiz|anot|adicion|lanc|classifi|categoriz|resum|lembr|confirm|encerr|cham|acion|inform|dispar|escrev|retorn))|\b(?:depois|em seguida|entao|e depois|logo apos)\b)\s*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = sep.exec(text))) {
    if (m.index > last) out.push({ seg: text.slice(last, m.index), at: offset + last })
    last = m.index + m[0].length
    if (m[0].length === 0) sep.lastIndex++
  }
  if (last < text.length) out.push({ seg: text.slice(last), at: offset + last })
  return out.filter((s) => s.seg.trim())
}

function triggerClauseEnd(t: string): number {
  if (!TRIGGER_START.test(t)) return 0
  const m = t.search(/[,;:]/)
  return m < 0 ? t.length : m
}

const ELSE_RE = /(?:[,;.]\s*|\s)(?:senao|caso contrario|do contrario|se nao for|se nao)\b[,:]?\s*/

export function parseDescription(input: string): ParseOutcome {
  const notes: string[] = []
  const { t, src } = normalizeKeepingIndex(input)
  if (t.length < 8) return { ok: false, error: 'Descreva o processo com um pouco mais de detalhe: o que dispara, a regra (se houver) e o que fazer.', notes }

  const clauseEnd = triggerClauseEnd(t)
  const trig = detectTrigger(t, t.slice(0, clauseEnd || t.length))
  if (!trig) {
    return {
      ok: false,
      error: 'Não identifiquei o que dispara o fluxo. Comece com algo como "Quando chegar um pedido", "Quando um cliente mandar mensagem", "Quando um agendamento for marcado" ou "Todo dia às 9h".',
      notes,
    }
  }
  notes.push(trig.note)

  const elseMatch = t.match(ELSE_RE)
  const elseAt = elseMatch?.index ?? -1
  const main = elseAt >= 0 ? t.slice(0, elseAt) : t
  const elsePart = elseAt >= 0 ? t.slice(elseAt + elseMatch![0].length) : ''

  const cond = detectCondition(main, trig.type, src)
  const ctx: Ctx = { src, trigger: trig.type, hasSummary: false, hasClassify: false }

  const plans: Array<ActionPlan & { branch: 'pre' | 'sim' | 'nao' }> = []
  for (const { seg, at } of splitSegments(main, 0)) {
    const inTrigger = at < clauseEnd
    const plan = planAction(seg, at, ctx, inTrigger, false, cond)
    if (!plan) continue
    if (plan.type === 'ia.resumir') ctx.hasSummary = true
    if (plan.type === 'ia.classificar') ctx.hasClassify = true
    plans.push({ ...plan, branch: cond && plan.at < cond.at ? 'pre' : 'sim' })
  }
  if (!cond) for (const p of plans) p.branch = 'pre'

  if (elsePart) {
    if (!cond) notes.push('Encontrei um "senão", mas nenhuma regra antes dele. Ignorei essa parte.')
    else
      for (const { seg, at } of splitSegments(elsePart, elseAt)) {
        const plan = planAction(seg, at, ctx, false, true, cond)
        if (plan) plans.push({ ...plan, branch: 'nao' })
      }
  }

  if (cond?.needsClassify && !plans.some((p) => p.type === 'ia.classificar')) {
    const p = paths(trig.type)
    plans.unshift({ type: 'ia.classificar', branch: 'pre', at: -1, config: { texto: `{{${p.texto}}}`, categorias: ['reclamação', 'dúvida', 'elogio', 'pedido'].includes(cond.needsClassify) ? 'reclamação, dúvida, elogio, pedido' : `${cond.needsClassify}, reclamação, dúvida, elogio`, salvarEm: 'classificacao' } })
    notes.push('A regra depende do tipo de mensagem, então coloquei "Classificar com IA" antes dela.')
  }

  if (!plans.some((p) => p.type !== 'controle.fim')) {
    return { ok: false, error: 'Entendi o gatilho, mas não encontrei nenhuma ação. Diga o que deve acontecer, por exemplo "avise o gerente", "envie uma mensagem para o cliente" ou "crie uma tarefa".', notes }
  }

  // Monta o grafo.
  const nodes: FlowDraft['nodes'] = [{ id: 'gatilho', type: trig.type, config: trig.config }]
  const edges: FlowDraft['edges'] = []
  const counters: Record<string, number> = {}
  const idFor = (type: NodeType) => {
    const base = type.split('.').pop()!
    counters[base] = (counters[base] ?? 0) + 1
    return counters[base] === 1 ? base : `${base}_${counters[base]}`
  }
  const chain = (from: string, port: 'out' | 'sim' | 'nao', items: ActionPlan[]) => {
    let prev = from
    let prevPort = port
    for (const it of items) {
      const id = idFor(it.type)
      nodes.push({ id, type: it.type, config: { ...CATALOG[it.type].defaults, ...it.config }, ...(it.label ? { label: it.label } : {}) })
      edges.push({ from: prev, to: id, port: prevPort })
      prev = id
      prevPort = 'out'
      if (it.type === 'controle.fim') break
    }
    return prev
  }
  const byBranch = (b: 'pre' | 'sim' | 'nao') => plans.filter((p) => p.branch === b).sort((a, b2) => a.at - b2.at)

  const last = chain('gatilho', 'out', byBranch('pre'))
  if (cond) {
    const condId = 'condicao'
    const op = cond.operador
    const label = cond.needsClassify ? `É ${cond.valor}?` : op === 'contem' ? `Fala em "${cond.valor}"?` : cond.campo.endsWith('primeiraConsulta') ? 'Primeira consulta?' : undefined
    nodes.push({ id: condId, type: 'condicao', config: { campo: cond.campo, operador: op, valor: cond.valor }, ...(label ? { label } : {}) })
    edges.push({ from: last, to: condId, port: 'out' })
    notes.push(`Regra: ${cond.campo} ${op.replace('_', ' ')} ${cond.valor}.`)
    const sim = byBranch('sim')
    const nao = byBranch('nao')
    if (sim.length) chain(condId, 'sim', sim)
    else {
      chain(condId, 'sim', [{ type: 'controle.fim', config: {}, label: 'Nada a fazer', at: 0 }])
      notes.push('Nenhuma ação depois da regra; o caminho "se sim" termina num "Encerrar".')
    }
    if (nao.length) chain(condId, 'nao', nao)
    else {
      chain(condId, 'nao', [{ type: 'controle.fim', config: {}, label: 'Nada a fazer', at: 0 }])
      notes.push('Você não disse o que fazer quando a regra não vale, então o caminho "se não" termina num "Encerrar" explícito.')
    }
  }

  const name = cap(input.trim().replace(/\s+/g, ' ').replace(/[.]+$/, ''))
  return { ok: true, draft: { name: name.length > 70 ? `${name.slice(0, 67).trimEnd()}…` : name, description: input.trim(), nodes, edges }, notes }
}
