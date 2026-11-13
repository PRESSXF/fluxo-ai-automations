import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Maximize, Minus, Plus, Trash2 } from 'lucide-react'
import { CATALOG, isNodeType } from '../domain/catalog'
import type { StepStatus } from '../domain/engine'
import { bounds, edgeMidpoint, edgePath, NODE_H, NODE_W, portPoint } from '../domain/layout'
import type { FlowNode, Port, Position } from '../domain/types'
import type { FlowEditor } from '../hooks/useFlowEditor'
import { NodeCard } from './NodeCard'
import { CATEGORY_STYLE } from './nodeMeta'

export interface CanvasHandle {
  fit: () => void
  /** Centro da área visível, em coordenadas do fluxo. Usado para inserir blocos pelo teclado. */
  center: () => Position
  /** Traz uma etapa para dentro da área visível, se ela estiver fora. */
  reveal: (id: string) => void
}

interface Props {
  editor: FlowEditor
  readOnly?: boolean
  sim: { activeNodeId?: string; nodes: Map<string, StepStatus>; edges: Set<string> }
  onActivateNode?: (id: string) => void
  onMessage: (msg: string) => void
}

type View = { x: number; y: number; k: number }
const MIN_K = 0.3
const MAX_K = 1.6
const ARROWS: Record<string, string> = { base: 'rgb(var(--ink2) / .6)', sim: 'rgb(var(--ok) / .8)', nao: 'rgb(var(--bad) / .75)', ember: 'rgb(var(--ember))' }
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas({ editor, readOnly = false, sim, onActivateNode, onMessage }, ref) {
  const { flow, selection, setSelection, issuesByNode } = editor
  const box = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 40, y: 40, k: 1 })
  const viewRef = useRef(view)
  viewRef.current = view
  const autoFit = useRef(true)
  const [ghost, setGhost] = useState<{ from: Position; to: Position; port: Port; target?: string } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; k: number } | null>(null)

  const toWorld = useCallback((clientX: number, clientY: number): Position => {
    const r = box.current!.getBoundingClientRect()
    const v = viewRef.current
    return { x: (clientX - r.left - v.x) / v.k, y: (clientY - r.top - v.y) / v.k }
  }, [])

  const fit = useCallback(() => {
    const el = box.current
    if (!el) return
    const { width: W, height: H } = el.getBoundingClientRect()
    if (W < 10 || H < 10) return
    if (!flow.nodes.length) return setView({ x: 40, y: 40, k: 1 })
    const b = bounds(flow.nodes)
    // Margem maior embaixo para o fluxo não ficar sob os controles de zoom e o minimapa.
    const pad = W < 600 ? { x: 24, top: 28, bottom: 76 } : { x: 56, top: 48, bottom: 128 }
    const k = clamp(Math.min((W - pad.x * 2) / b.w, (H - pad.top - pad.bottom) / b.h), MIN_K, 1)
    setView({ x: (W - b.w * k) / 2 - b.x * k, y: pad.top + (H - pad.top - pad.bottom - b.h * k) / 2 - b.y * k, k })
  }, [flow.nodes])

  useImperativeHandle(
    ref,
    () => ({
      fit: () => {
        autoFit.current = true
        fit()
      },
      center: () => {
        const r = box.current?.getBoundingClientRect()
        if (!r) return { x: 80, y: 80 }
        const p = toWorld(r.left + r.width / 2, r.top + r.height / 2)
        return { x: p.x - NODE_W / 2 + (Math.random() * 40 - 20), y: p.y - NODE_H / 2 + (Math.random() * 40 - 20) }
      },
      reveal: (id: string) => {
        const n = flow.nodes.find((x) => x.id === id)
        const r = box.current?.getBoundingClientRect()
        if (!n || !r) return
        const v = viewRef.current
        const sx = n.position.x * v.k + v.x
        const sy = n.position.y * v.k + v.y
        const inside = sx > 0 && sy > 0 && sx + NODE_W * v.k < r.width && sy + NODE_H * v.k < r.height
        if (inside) return
        autoFit.current = false
        setView({ ...v, x: r.width / 2 - (n.position.x + NODE_W / 2) * v.k, y: r.height / 2 - (n.position.y + NODE_H / 2) * v.k })
      },
    }),
    [fit, toWorld, flow.nodes],
  )

  // Ajusta à tela quando o fluxo troca (modelo, IA, importação) e quando o painel muda de tamanho,
  // até o usuário mexer na visão manualmente.
  useEffect(() => {
    autoFit.current = true
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.id])
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => autoFit.current && fit())
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    autoFit.current = false
    const r = box.current!.getBoundingClientRect()
    const px = cx ?? r.width / 2
    const py = cy ?? r.height / 2
    setView((v) => {
      const k = clamp(v.k * factor, MIN_K, MAX_K)
      const f = k / v.k
      return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f }
    })
  }, [])

  // Roda do mouse: rolar move a visão; Ctrl/⌘ + rolar (ou pinça no trackpad) aproxima.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top)
      else {
        autoFit.current = false
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  /* ---------- gestos ---------- */

  const gesture = (e: React.PointerEvent, onMove: (dx: number, dy: number, ev: PointerEvent) => void, onUp: (moved: boolean, ev: PointerEvent) => void) => {
    const sx = e.clientX
    const sy = e.clientY
    let moved = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx
      const dy = ev.clientY - sy
      if (!moved && Math.hypot(dx, dy) < 3) return
      moved = true
      onMove(dx, dy, ev)
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      onUp(moved, ev)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const onNodePointerDown = useCallback(
    (e: React.PointerEvent, node: FlowNode) => {
      if (e.button !== 0) return
      e.stopPropagation()
      setSelection({ kind: 'node', id: node.id })
      if (readOnly) {
        gesture(e, () => {}, (moved) => !moved && onActivateNode?.(node.id))
        return
      }
      editor.dragStart()
      gesture(
        e,
        (dx, dy) => editor.dragMove([node.id], dx / viewRef.current.k, dy / viewRef.current.k),
        () => editor.dragEnd(),
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readOnly, editor.dragStart, editor.dragMove, editor.dragEnd, setSelection, onActivateNode],
  )

  const nodeAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-node-id]') as HTMLElement | null)?.dataset.nodeId

  const onPortDown = useCallback(
    (e: React.PointerEvent, node: FlowNode, port: Port) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      const from = portPoint(node, port)
      setGhost({ from, to: from, port })
      gesture(
        e,
        (_dx, _dy, ev) => {
          const target = nodeAt(ev.clientX, ev.clientY)
          setGhost({ from, to: toWorld(ev.clientX, ev.clientY), port, target: target && target !== node.id ? target : undefined })
        },
        (_moved, ev) => {
          setGhost(null)
          const target = nodeAt(ev.clientX, ev.clientY)
          if (!target || target === node.id) return
          const err = editor.connect(node.id, port, target)
          if (err) onMessage(err)
        },
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor.connect, onMessage, toWorld],
  )

  const onBackgroundDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-node-id],[data-edge],[data-ui]')) return
    box.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: viewRef.current.k }
    }
  }
  const onBackgroundMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    autoFit.current = false
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const r = box.current!.getBoundingClientRect()
      const factor = (pinch.current.k * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist)) / viewRef.current.k
      zoomAt(factor, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top)
      return
    }
    setView((v) => ({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }))
  }
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const onBackgroundUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    const s = startRef.current
    if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 4) setSelection(null)
    startRef.current = null
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 50 : 10
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (arrows[e.key]) {
      e.preventDefault()
      const [dx, dy] = arrows[e.key]
      if (selection?.kind === 'node' && !readOnly) editor.moveBy([selection.id], dx * step, dy * step)
      else {
        autoFit.current = false
        setView((v) => ({ ...v, x: v.x - dx * step * 4, y: v.y - dy * step * 4 }))
      }
    } else if (e.key === '+' || e.key === '=') zoomAt(1.2)
    else if (e.key === '-') zoomAt(1 / 1.2)
    else if (e.key === '0') {
      autoFit.current = true
      fit()
    }
  }

  /* ---------- soltar blocos da paleta ---------- */

  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData('application/x-fluxo-node')
    if (!type || readOnly || !isNodeType(type)) return
    e.preventDefault()
    const p = toWorld(e.clientX, e.clientY)
    editor.addNode(type, { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 })
  }

  /* ---------- desenho ---------- */

  const byId = useMemo(() => new Map(flow.nodes.map((n) => [n.id, n])), [flow.nodes])
  const simActive = sim.nodes.size > 0
  const selectedEdge = selection?.kind === 'edge' ? flow.edges.find((e) => e.id === selection.id) : undefined

  const edges = flow.edges
    .map((e) => {
      const a = byId.get(e.from)
      const b = byId.get(e.to)
      if (!a || !b) return null
      const p1 = portPoint(a, e.port)
      const p2 = portPoint(b, 'in')
      return { e, p1, p2, d: edgePath(p1, p2) }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)

  const grid = 22 * view.k

  return (
    <div
      ref={box}
      tabIndex={0}
      role="application"
      aria-roledescription="canvas"
      aria-label={`Canvas do fluxo com ${flow.nodes.length} etapas. ${readOnly ? 'Somente leitura.' : 'Tab passa pelas etapas; setas movem a etapa selecionada; mais e menos aproximam; zero ajusta à tela.'}`}
      onPointerDown={(e) => {
        startRef.current = { x: e.clientX, y: e.clientY }
        onBackgroundDown(e)
      }}
      onPointerMove={onBackgroundMove}
      onPointerUp={onBackgroundUp}
      onPointerCancel={onBackgroundUp}
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        if (!readOnly && e.dataTransfer.types.includes('application/x-fluxo-node')) e.preventDefault()
      }}
      onDrop={onDrop}
      className="dot-grid relative h-full w-full touch-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ember/60"
      style={{ backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className="pointer-events-none absolute overflow-visible" style={{ left: 0, top: 0, width: 1, height: 1 }} aria-hidden>
          <defs>
            {Object.entries(ARROWS).map(([id, fill]) => (
              <marker key={id} id={`seta-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={fill} />
              </marker>
            ))}
          </defs>
          {edges.map(({ e, d }) => {
            const taken = sim.edges.has(e.id)
            const selected = selectedEdge?.id === e.id
            const tone = selected || taken ? 'ember' : e.port === 'out' ? 'base' : e.port
            const color = ARROWS[tone]
            return (
              <g key={e.id}>
                <path
                  d={d}
                  data-edge={e.id}
                  stroke="transparent"
                  strokeWidth={16}
                  fill="none"
                  style={{ pointerEvents: readOnly ? 'none' : 'stroke', cursor: 'pointer' }}
                  onPointerDown={(ev) => {
                    ev.stopPropagation()
                    setSelection({ kind: 'edge', id: e.id })
                  }}
                />
                <path
                  d={d}
                  stroke={color}
                  strokeWidth={selected || taken ? 2.75 : 2}
                  fill="none"
                  markerEnd={`url(#seta-${tone})`}
                  strokeDasharray={taken ? '7 5' : undefined}
                  className={taken ? 'animate-dash' : ''}
                  opacity={simActive && !taken ? 0.45 : 1}
                />
              </g>
            )
          })}
          {ghost && <path d={edgePath(ghost.from, ghost.to)} stroke="rgb(var(--ember))" strokeWidth={2} strokeDasharray="5 4" fill="none" />}
        </svg>

        {flow.nodes.map((n) =>
          isNodeType(n.type) ? (
            <NodeCard
              key={n.id}
              node={n}
              selected={selection?.kind === 'node' && selection.id === n.id}
              issues={issuesByNode.get(n.id) ?? []}
              simStatus={sim.nodes.get(n.id)}
              active={sim.activeNodeId === n.id}
              dimmed={simActive && !sim.nodes.has(n.id)}
              connectTarget={ghost?.target === n.id}
              readOnly={readOnly}
              onPointerDown={onNodePointerDown}
              onPortDown={onPortDown}
              onFocus={(id) => setSelection({ kind: 'node', id })}
              onActivate={(id) => onActivateNode?.(id)}
            />
          ) : null,
        )}

        {selectedEdge && !readOnly && (() => {
          const a = byId.get(selectedEdge.from)
          const b = byId.get(selectedEdge.to)
          if (!a || !b) return null
          const m = edgeMidpoint(portPoint(a, selectedEdge.port), portPoint(b, 'in'))
          return (
            <button
              data-ui
              type="button"
              onClick={() => editor.deleteSelection()}
              aria-label="Excluir ligação selecionada"
              className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-ember bg-surface text-ember shadow hover:bg-ember hover:text-white"
              style={{ left: m.x, top: m.y }}
            >
              <Trash2 size={13} />
            </button>
          )
        })()}
      </div>

      {flow.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
          <div className="max-w-sm rounded-2xl border border-dashed border-line bg-surface/80 p-6">
            <p className="font-display text-lg font-semibold">Canvas vazio</p>
            <p className="mt-1 text-sm text-muted">Arraste um bloco da paleta, escolha um modelo pronto ou descreva o processo para a IA montar.</p>
          </div>
        </div>
      )}

      <div data-ui className="absolute bottom-3 left-3 flex items-center gap-1 rounded-xl border border-line bg-surface/95 p-1 shadow-sm">
        <button type="button" onClick={() => zoomAt(1 / 1.2)} aria-label="Afastar" className="grid size-8 place-items-center rounded-lg text-ink2 hover:bg-sunk">
          <Minus size={15} />
        </button>
        <span className="w-11 text-center font-mono text-[11px] tabular-nums text-muted" aria-live="polite" aria-label={`Zoom ${Math.round(view.k * 100)}%`}>
          {Math.round(view.k * 100)}%
        </span>
        <button type="button" onClick={() => zoomAt(1.2)} aria-label="Aproximar" className="grid size-8 place-items-center rounded-lg text-ink2 hover:bg-sunk">
          <Plus size={15} />
        </button>
        <button
          type="button"
          onClick={() => {
            autoFit.current = true
            fit()
          }}
          aria-label="Ajustar à tela"
          className="grid size-8 place-items-center rounded-lg text-ink2 hover:bg-sunk"
        >
          <Maximize size={14} />
        </button>
      </div>

      {!readOnly && <Minimap nodes={flow.nodes} view={view} box={box} onCenter={(p) => {
        const r = box.current!.getBoundingClientRect()
        autoFit.current = false
        setView((v) => ({ ...v, x: r.width / 2 - p.x * v.k, y: r.height / 2 - p.y * v.k }))
      }} />}
    </div>
  )
})

function Minimap({ nodes, view, box, onCenter }: { nodes: FlowNode[]; view: View; box: React.RefObject<HTMLDivElement>; onCenter: (p: Position) => void }) {
  const W = 168
  const H = 104
  if (!nodes.length || !box.current) return null
  const r = box.current.getBoundingClientRect()
  const vis = { x: -view.x / view.k, y: -view.y / view.k, w: r.width / view.k, h: r.height / view.k }
  const b = bounds(nodes)
  const minX = Math.min(b.x, vis.x) - 40
  const minY = Math.min(b.y, vis.y) - 40
  const maxX = Math.max(b.x + b.w, vis.x + vis.w) + 40
  const maxY = Math.max(b.y + b.h, vis.y + vis.h) + 40
  const s = Math.min(W / (maxX - minX), H / (maxY - minY))
  const ox = (W - (maxX - minX) * s) / 2
  const oy = (H - (maxY - minY) * s) / 2
  const tx = (x: number) => ox + (x - minX) * s
  const ty = (y: number) => oy + (y - minY) * s
  return (
    <svg
      data-ui
      width={W}
      height={H}
      aria-hidden
      className="absolute bottom-3 right-3 hidden cursor-pointer rounded-xl border border-line bg-surface/95 shadow-sm md:block"
      onPointerDown={(e) => {
        e.stopPropagation()
        const rr = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
        onCenter({ x: (e.clientX - rr.left - ox) / s + minX, y: (e.clientY - rr.top - oy) / s + minY })
      }}
    >
      {nodes.map((n) =>
        isNodeType(n.type) ? (
          <rect key={n.id} x={tx(n.position.x)} y={ty(n.position.y)} width={NODE_W * s} height={NODE_H * s} rx={2} fill={CATEGORY_STYLE[CATALOG[n.type].category].stroke} opacity={0.7} />
        ) : null,
      )}
      <rect x={tx(vis.x)} y={ty(vis.y)} width={vis.w * s} height={vis.h * s} fill="rgb(var(--ember) / .06)" stroke="rgb(var(--ember))" strokeWidth={1.25} rx={3} />
    </svg>
  )
}
