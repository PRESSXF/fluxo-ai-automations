import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as G from '../domain/graph'
import { initHistory, push, redo as redoH, replace, undo as undoH, type History } from '../domain/history'
import { parseFlowFile, serializeFlow } from '../domain/schema'
import { DEFAULT_TEMPLATE_ID, templateFlow } from '../domain/templates'
import type { Flow, FlowNode, NodeType, Port, Position } from '../domain/types'
import { validateFlow, type Issue } from '../domain/validate'

export const STORAGE_KEY = 'fluxo:atual:v1'

export type Selection = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null

function loadStored(): Flow {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const r = parseFlowFile(JSON.parse(raw))
      if (r.ok) return r.value
    }
  } catch {
    /* armazenamento indisponível ou conteúdo corrompido: começa pelo modelo */
  }
  return templateFlow(DEFAULT_TEMPLATE_ID)
}

/**
 * Estado do editor: fluxo com desfazer/refazer, seleção e validação ao vivo.
 * Toda alteração passa pelas funções puras de `domain/graph`.
 */
export function useFlowEditor() {
  const [history, setHistory] = useState<History<Flow>>(() => initHistory(loadStored()))
  const [selection, setSelection] = useState<Selection>(null)
  const dragBase = useRef<Flow | null>(null)
  const flow = history.present

  const issues = useMemo(() => validateFlow(flow), [flow])
  const issuesByNode = useMemo(() => {
    const m = new Map<string, Issue[]>()
    for (const i of issues) for (const id of i.nodeIds) m.set(id, [...(m.get(id) ?? []), i])
    return m
  }, [issues])

  // Salva no navegador com um pequeno atraso para não gravar a cada pixel de arraste.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, serializeFlow(flow))
      } catch {
        /* sem armazenamento: o editor continua funcionando, só não lembra depois */
      }
    }, 300)
    return () => clearTimeout(id)
  }, [flow])

  const commit = useCallback((fn: (f: Flow) => Flow) => setHistory((h) => push(h, fn(h.present))), [])

  const addNode = useCallback(
    (type: NodeType, at: Position): FlowNode => {
      const node = G.createNode(history.present, type, at)
      commit((f) => G.addNode(f, node))
      setSelection({ kind: 'node', id: node.id })
      return node
    },
    [history.present, commit],
  )

  /** Adiciona uma etapa logo depois de outra, já ligada. Atalho para quem edita pelo teclado. */
  const addNodeAfter = useCallback(
    (type: NodeType, fromId: string, port: Port): FlowNode | null => {
      const r = G.insertAfter(history.present, type, fromId, port)
      if (!r) return null
      setHistory((h) => push(h, r.flow))
      setSelection({ kind: 'node', id: r.node.id })
      return r.node
    },
    [history.present],
  )

  const updateNode = useCallback((id: string, patch: Parameters<typeof G.updateNode>[2]) => commit((f) => G.updateNode(f, id, patch)), [commit])

  const moveBy = useCallback((ids: string[], dx: number, dy: number) => commit((f) => G.moveNodes(f, ids, dx, dy)), [commit])

  /** Arraste: altera sem criar passos e grava um único passo ao soltar. */
  const dragStart = useCallback(() => {
    dragBase.current = history.present
  }, [history.present])
  const dragMove = useCallback((ids: string[], dx: number, dy: number) => {
    const base = dragBase.current
    if (!base) return
    setHistory((h) => replace(h, G.moveNodes(base, ids, dx, dy)))
  }, [])
  const dragEnd = useCallback(() => {
    const base = dragBase.current
    dragBase.current = null
    if (!base) return
    setHistory((h) => (h.present === base ? h : { past: [...h.past, base].slice(-100), present: h.present, future: [] }))
  }, [])

  const connect = useCallback((from: string, port: Port, to: string): string | null => {
    const r = G.connect(history.present, from, port, to)
    if (!r.ok) return r.reason
    setHistory((h) => push(h, r.flow))
    return null
  }, [history.present])

  const disconnect = useCallback((from: string, port: Port) => commit((f) => G.disconnect(f, from, port)), [commit])

  const deleteSelection = useCallback(() => {
    if (!selection) return
    if (selection.kind === 'node') commit((f) => G.removeNodes(f, [selection.id]))
    else commit((f) => G.removeEdges(f, [selection.id]))
    setSelection(null)
  }, [selection, commit])

  const duplicate = useCallback(() => {
    if (selection?.kind !== 'node') return
    const r = G.duplicateNode(history.present, selection.id)
    if (!r) return
    setHistory((h) => push(h, r.flow))
    setSelection({ kind: 'node', id: r.node.id })
  }, [selection, history.present])

  const rename = useCallback((name: string) => commit((f) => ({ ...f, name })), [commit])

  const load = useCallback((next: Flow) => {
    setHistory((h) => push(h, next))
    setSelection(null)
  }, [])

  const undo = useCallback(() => setHistory((h) => undoH(h)), [])
  const redo = useCallback(() => setHistory((h) => redoH(h)), [])

  // Seleção que apontava para algo removido (por exemplo, depois de desfazer) é limpa.
  useEffect(() => {
    if (selection?.kind === 'node' && !flow.nodes.some((n) => n.id === selection.id)) setSelection(null)
    if (selection?.kind === 'edge' && !flow.edges.some((e) => e.id === selection.id)) setSelection(null)
  }, [flow, selection])

  return {
    flow,
    issues,
    issuesByNode,
    selection,
    setSelection,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    addNode,
    addNodeAfter,
    updateNode,
    moveBy,
    dragStart,
    dragMove,
    dragEnd,
    connect,
    disconnect,
    deleteSelection,
    duplicate,
    rename,
    load,
    undo,
    redo,
  }
}

export type FlowEditor = ReturnType<typeof useFlowEditor>
