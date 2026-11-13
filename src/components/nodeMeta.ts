import {
  Bell,
  CalendarCheck,
  CircleStop,
  ClipboardCheck,
  Clock,
  MessageCircle,
  Send,
  ShoppingBag,
  Sparkles,
  Split,
  Table,
  Tags,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import type { Category, NodeType } from '../domain/types'

export const NODE_ICON: Record<NodeType, LucideIcon> = {
  'gatilho.whatsapp': MessageCircle,
  'gatilho.pedido': ShoppingBag,
  'gatilho.agendamento': CalendarCheck,
  'gatilho.horario': Clock,
  condicao: Split,
  'acao.mensagem': Send,
  'acao.notificar': Bell,
  'acao.tarefa': ClipboardCheck,
  'acao.planilha': Table,
  'ia.classificar': Tags,
  'ia.resumir': Sparkles,
  'controle.esperar': Timer,
  'controle.fim': CircleStop,
}

/** Classes por família de etapa. A cor sozinha nunca carrega informação: sempre há rótulo. */
export const CATEGORY_STYLE: Record<Category, { label: string; text: string; bg: string; border: string; dot: string; stroke: string }> = {
  gatilho: { label: 'Gatilho', text: 'text-trig', bg: 'bg-trig/10', border: 'border-trig/40', dot: 'bg-trig', stroke: 'rgb(var(--trig))' },
  condicao: { label: 'Condição', text: 'text-cond', bg: 'bg-cond/10', border: 'border-cond/40', dot: 'bg-cond', stroke: 'rgb(var(--cond))' },
  acao: { label: 'Ação', text: 'text-act', bg: 'bg-act/10', border: 'border-act/40', dot: 'bg-act', stroke: 'rgb(var(--act))' },
  ia: { label: 'IA', text: 'text-ai', bg: 'bg-ai/10', border: 'border-ai/40', dot: 'bg-ai', stroke: 'rgb(var(--ai))' },
  controle: { label: 'Controle', text: 'text-ctrl', bg: 'bg-ctrl/10', border: 'border-ctrl/40', dot: 'bg-ctrl', stroke: 'rgb(var(--ctrl))' },
}
