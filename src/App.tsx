import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, Github, Keyboard, LayoutTemplate, Plus, Redo2, Sparkles, Undo2, Upload } from 'lucide-react'
import { createAnthropicProvider } from './ai/anthropic'
import { createDemoProvider } from './ai/demo/provider'
import { CATALOG, NODE_TYPES, nodeTitle } from './domain/catalog'
import { parseFlowFile, serializeFlow } from './domain/schema'
import { templateFlow } from './domain/templates'
import type { NodeType, Port } from './domain/types'
import { useFlowEditor } from './hooks/useFlowEditor'
import { useSimulator } from './hooks/useSimulator'
import { Canvas, type CanvasHandle } from './components/Canvas'
import { Palette } from './components/Palette'
import { StepList } from './components/StepList'
import { Inspector } from './components/Inspector'
import { IssuesPanel } from './components/IssuesPanel'
import { SimulatorPanel } from './components/SimulatorPanel'
import { AiComposer } from './components/AiComposer'
import { TemplatesDialog } from './components/TemplatesDialog'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { Dialog } from './components/Dialog'
import { DEFAULT_MODEL, SettingsDialog, type ProviderSettings } from './components/SettingsDialog'

const REPO_URL = 'https://github.com/PRESSXF/fluxo-ai-automations'

type RightTab = 'etapa' | 'problemas' | 'simular'
type LeftTab = 'blocos' | 'etapas'
type MobileTab = 'fluxo' | 'etapas' | 'problemas' | 'simular'

function readSettings(): ProviderSettings {
  try {
    const raw = sessionStorage.getItem('fluxo:provider')
    if (raw) return { mode: 'demo', apiKey: '', model: DEFAULT_MODEL, ...JSON.parse(raw) }
  } catch {
    /* sessionStorage indisponível: segue no modo demonstração */
  }
  return { mode: 'demo', apiKey: '', model: DEFAULT_MODEL }
}

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches)
  useEffect(() => {
    const m = matchMedia(query)
    const on = () => setMatch(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return match
}

const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: Array<[T, string, number?]>; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-line px-2 pt-2">
      {items.map(([v, l, badge]) => (
        <button
          key={v}
          role="tab"
          type="button"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`relative -mb-px inline-flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-2 text-[13px] font-medium transition ${value === v ? 'border-line bg-surface text-ink' : 'border-transparent text-muted hover:text-ink'}`}
        >
          {l}
          {badge ? <span className="rounded-full bg-bad px-1.5 text-[10.5px] font-bold leading-[1.35rem] text-white">{badge}</span> : null}
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const editor = useFlowEditor()
  const { flow, selection, setSelection, issues } = editor
  const desktop = useMedia('(min-width: 1024px)')
  const canvas = useRef<CanvasHandle>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const [settings, setSettings] = useState<ProviderSettings>(readSettings)
  const provider = useMemo(
    () => (settings.mode === 'anthropic' && settings.apiKey ? createAnthropicProvider(settings.apiKey, settings.model) : createDemoProvider({ latencyMs: 320 })),
    [settings],
  )
  const sim = useSimulator(flow, provider)

  const [leftTab, setLeftTab] = useState<LeftTab>('blocos')
  const [rightTab, setRightTab] = useState<RightTab>('etapa')
  const [mobileTab, setMobileTab] = useState<MobileTab>('fluxo')
  const [mobileDetail, setMobileDetail] = useState(false)
  const [dialog, setDialog] = useState<null | 'ia' | 'modelos' | 'atalhos' | 'config'>(null)
  const [importErrors, setImportErrors] = useState<string[] | null>(null)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const [runSignal, setRunSignal] = useState(0)

  const say = useCallback((text: string) => setToast({ id: Date.now(), text }), [])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3800)
    return () => clearTimeout(id)
  }, [toast])

  const errorCount = issues.filter((i) => i.severity === 'erro').length
  const selectedNode = selection?.kind === 'node' ? flow.nodes.find((n) => n.id === selection.id) : undefined

  /** Onde um bloco novo entra: depois da etapa selecionada, se ela tiver uma saída livre. */
  const freePort = useMemo((): Port | null => {
    if (!selectedNode) return null
    const used = new Set(flow.edges.filter((e) => e.from === selectedNode.id).map((e) => e.port))
    const ports = CATALOG[selectedNode.type].ports
    // Prefere uma saída livre; se todas estão ligadas, insere no meio do primeiro caminho.
    return ports.find((p) => !used.has(p)) ?? ports[0] ?? null
  }, [selectedNode, flow.edges])

  const addFromPalette = (type: NodeType) => {
    if (selectedNode && freePort && CATALOG[type].hasInput) {
      const n = editor.addNodeAfter(type, selectedNode.id, freePort)
      if (n) setTimeout(() => canvas.current?.reveal(n.id), 0)
      say(`"${CATALOG[type].title}" adicionada depois de "${nodeTitle(selectedNode)}".`)
    } else {
      editor.addNode(type, canvas.current?.center() ?? { x: 80, y: 80 })
      say(`"${CATALOG[type].title}" adicionada. Ligue-a a uma etapa para ela fazer parte do fluxo.`)
    }
    setRightTab('etapa')
  }

  const selectNode = useCallback(
    (id: string) => {
      setSelection({ kind: 'node', id })
      if (desktop) {
        setRightTab('etapa')
        canvas.current?.reveal(id)
      } else {
        setMobileTab('etapas')
        setMobileDetail(true)
      }
    },
    [desktop, setSelection],
  )

  const loadFlow = (f: typeof flow, message: string) => {
    editor.load(f)
    sim.reset()
    say(message)
    setTimeout(() => canvas.current?.fit(), 0)
  }

  const exportFlow = () => {
    const blob = new Blob([serializeFlow(flow)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `fluxo-${flow.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sem-nome'}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    say('Fluxo exportado em JSON.')
  }

  const importFile = async (file: File) => {
    let raw: unknown
    try {
      raw = JSON.parse(await file.text())
    } catch {
      setImportErrors(['O arquivo não é um JSON válido.'])
      return
    }
    const r = parseFlowFile(raw)
    if (!r.ok) setImportErrors(r.errors)
    else loadFlow({ ...r.value, id: `importado-${Date.now().toString(36)}` }, `"${r.value.name}" importado.`)
  }

  const saveSettings = (v: ProviderSettings) => {
    setSettings(v)
    setDialog(null)
    try {
      sessionStorage.setItem('fluxo:provider', JSON.stringify(v))
    } catch {
      /* ignora */
    }
  }

  // Atalhos globais. Ficam desligados enquanto se digita ou com um diálogo aberto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (document.querySelector('dialog[open]')) return
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setDialog('ia')
        return
      }
      if (isTyping(e.target)) return
      const k = e.key.toLowerCase()
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) editor.redo()
        else editor.undo()
      } else if (mod && k === 'y') {
        e.preventDefault()
        editor.redo()
      } else if (mod && k === 'd') {
        e.preventDefault()
        editor.duplicate()
      } else if (mod && e.key === 'Enter') {
        e.preventDefault()
        setRightTab('simular')
        setMobileTab('simular')
        setRunSignal((n) => n + 1)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection && desktop) {
        e.preventDefault()
        editor.deleteSelection()
      } else if (e.key === 'Escape') setSelection(null)
      else if (e.key === '?') setDialog('atalhos')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor, selection, setSelection, desktop])

  const simVisual = { activeNodeId: sim.activeNodeId, nodes: sim.visual.nodes, edges: sim.visual.edges }
  const providerName = provider.id === 'demo' ? 'modo demonstração' : `Claude · ${provider.model}`

  const iconBtn = 'grid size-9 place-items-center rounded-lg text-paper/80 transition hover:bg-white/10 hover:text-paper disabled:opacity-30 disabled:hover:bg-transparent'

  const simulator = (
    <SimulatorPanel
      flow={flow}
      issues={issues}
      sim={sim}
      providerLabel={providerName}
      runSignal={runSignal}
      onSelectNode={selectNode}
      onShowIssues={() => {
        setRightTab('problemas')
        setMobileTab('problemas')
      }}
    />
  )

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] bg-paper">
      <header className="flex items-center gap-2 bg-ink px-3 py-2 text-paper sm:px-4">
        <a href="./" className="flex shrink-0 items-center gap-2 rounded-lg pr-1" aria-label="Fluxo, início">
          <img src="/favicon.svg" alt="" className="size-8 rounded-lg ring-1 ring-white/10" />
          <span className="font-display text-[19px] font-bold tracking-tight">Fluxo</span>
        </a>
        <span className="hidden font-mono text-[10.5px] uppercase tracking-[.12em] text-paper/50 xl:inline">automações com IA</span>

        {desktop && (
          <label className="ml-3 flex min-w-0 max-w-[22rem] flex-1 items-center">
            <span className="sr-only">Nome do fluxo</span>
            <input
              key={flow.id + flow.name}
              defaultValue={flow.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== flow.name && editor.rename(e.target.value.trim())}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="w-full truncate rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[13.5px] text-paper/90 hover:border-white/15 focus:border-white/30 focus:bg-white/5 focus:outline-none"
            />
          </label>
        )}

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <button type="button" className={iconBtn} onClick={editor.undo} disabled={!editor.canUndo} aria-label="Desfazer" title="Desfazer (Ctrl+Z)">
            <Undo2 size={17} />
          </button>
          <button type="button" className={iconBtn} onClick={editor.redo} disabled={!editor.canRedo} aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)">
            <Redo2 size={17} />
          </button>
          <span className="mx-1 hidden h-5 w-px bg-white/15 sm:block" aria-hidden />
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-paper/80 transition hover:bg-white/10 hover:text-paper" onClick={() => setDialog('modelos')} title="Modelos prontos">
            <LayoutTemplate size={16} aria-hidden /> <span className="hidden md:inline">Modelos</span>
            <span className="sr-only md:hidden">Modelos</span>
          </button>
          {desktop && (
            <>
              <button type="button" className={iconBtn} onClick={() => fileInput.current?.click()} aria-label="Importar fluxo em JSON" title="Importar JSON">
                <Upload size={16} />
              </button>
              <button type="button" className={iconBtn} onClick={exportFlow} aria-label="Exportar fluxo em JSON" title="Exportar JSON">
                <Download size={16} />
              </button>
              <button type="button" className={iconBtn} onClick={() => setDialog('atalhos')} aria-label="Atalhos de teclado" title="Atalhos (?)">
                <Keyboard size={16} />
              </button>
              <a href={REPO_URL} className={iconBtn} aria-label="Código no GitHub" title="Código no GitHub" target="_blank" rel="noreferrer">
                <Github size={16} />
              </a>
              <button
                type="button"
                onClick={() => setDialog('config')}
                className={`ml-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${provider.id === 'demo' ? 'border-trig/60 bg-trig/20 text-[#f3c86b]' : 'border-ok/60 bg-ok/20 text-[#8fe0b0]'}`}
                title="Trocar o provedor de IA"
              >
                <span className={`size-1.5 rounded-full ${provider.id === 'demo' ? 'bg-[#f3c86b]' : 'bg-[#8fe0b0]'}`} aria-hidden />
                {provider.id === 'demo' ? 'Modo demonstração' : `Claude · ${provider.model}`}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setDialog('ia')}
            className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-ember px-3 py-2 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/.2)] transition hover:brightness-110"
            title="Descreva e a IA monta (Ctrl+K)"
          >
            <Sparkles size={15} aria-hidden />
            <span className="hidden sm:inline">Descreva e a IA monta</span>
            <span className="sm:hidden">IA monta</span>
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importFile(f)
            e.target.value = ''
          }}
        />
      </header>

      {desktop ? (
        <main className="grid min-h-0 grid-cols-[248px_minmax(0,1fr)_384px] grid-rows-[minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-line bg-sunk/40" aria-label="Blocos e etapas">
            <Tabs
              label="Painel da esquerda"
              value={leftTab}
              onChange={setLeftTab}
              items={[
                ['blocos', 'Blocos'],
                ['etapas', `Etapas (${flow.nodes.length})`],
              ]}
            />
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-surface/40">
              {leftTab === 'blocos' ? (
                <Palette
                  onAdd={addFromPalette}
                  hint={
                    selectedNode && freePort
                      ? `Clique num bloco para inserir depois de "${nodeTitle(selectedNode)}"${freePort !== 'out' ? ` (${freePort === 'sim' ? 'se sim' : 'se não'})` : ''}. Ou arraste para o canvas.`
                      : 'Arraste um bloco para o canvas ou clique para inserir no centro. Com uma etapa selecionada, o bloco entra já ligado depois dela.'
                  }
                />
              ) : (
                <StepList flow={flow} selectedId={selectedNode?.id} issuesByNode={editor.issuesByNode} onSelect={selectNode} />
              )}
            </div>
          </aside>

          <section className="relative min-h-0" aria-label="Editor visual">
            <Canvas ref={canvas} editor={editor} sim={simVisual} onMessage={say} onActivateNode={selectNode} />
          </section>

          <aside className="flex min-h-0 flex-col border-l border-line bg-surface/60" aria-label="Propriedades, problemas e simulação">
            <Tabs
              label="Painel da direita"
              value={rightTab}
              onChange={setRightTab}
              items={[
                ['etapa', selection ? 'Propriedades' : 'Visão geral'],
                ['problemas', 'Problemas', errorCount],
                ['simular', 'Simular'],
              ]}
            />
            <div className={`min-h-0 flex-1 bg-surface ${rightTab === 'simular' ? '' : 'scroll-thin overflow-y-auto'}`}>
              {rightTab === 'etapa' && <Inspector editor={editor} onShowIssues={() => setRightTab('problemas')} />}
              {rightTab === 'problemas' && <IssuesPanel issues={issues} onLocate={selectNode} />}
              {rightTab === 'simular' && simulator}
            </div>
          </aside>
        </main>
      ) : (
        <main className="flex min-h-0 flex-col">
          <Tabs
            label="Seções"
            value={mobileTab}
            onChange={(v) => {
              setMobileTab(v)
              if (v !== 'etapas') setMobileDetail(false)
            }}
            items={[
              ['fluxo', 'Fluxo'],
              ['etapas', 'Etapas'],
              ['problemas', 'Problemas', errorCount],
              ['simular', 'Simular'],
            ]}
          />
          <div className={`min-h-0 flex-1 bg-surface ${mobileTab === 'fluxo' || mobileTab === 'simular' ? '' : 'scroll-thin overflow-y-auto'}`}>
            {mobileTab === 'fluxo' && (
              <div className="flex h-full flex-col">
                <p className="border-b border-line bg-sunk/60 px-4 py-2 text-[12px] text-ink2">No celular o canvas é só para ver. Toque numa etapa para editar ou use a aba Etapas.</p>
                <div className="relative min-h-0 flex-1">
                  <Canvas ref={canvas} editor={editor} sim={simVisual} readOnly onMessage={say} onActivateNode={selectNode} />
                </div>
              </div>
            )}
            {mobileTab === 'etapas' &&
              (mobileDetail && selection ? (
                <div>
                  <button type="button" onClick={() => setMobileDetail(false)} className="m-3 mb-0 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-ink2 hover:bg-sunk">
                    <ArrowLeft size={15} aria-hidden /> Todas as etapas
                  </button>
                  <Inspector editor={editor} onShowIssues={() => setMobileTab('problemas')} />
                </div>
              ) : (
                <div>
                  <MobileAdd
                    onAdd={(t) => {
                      addFromPalette(t)
                      setMobileDetail(true)
                    }}
                    after={selectedNode && freePort ? nodeTitle(selectedNode) : undefined}
                  />
                  <StepList flow={flow} selectedId={selectedNode?.id} issuesByNode={editor.issuesByNode} onSelect={selectNode} />
                </div>
              ))}
            {mobileTab === 'problemas' && <IssuesPanel issues={issues} onLocate={selectNode} />}
            {mobileTab === 'simular' && simulator}
          </div>
        </main>
      )}

      <footer className="flex items-center gap-3 border-t border-line bg-sunk/70 px-3 py-1.5 text-[11.5px] text-muted sm:px-4">
        <button
          type="button"
          onClick={() => {
            setRightTab('problemas')
            setMobileTab('problemas')
          }}
          className={`inline-flex shrink-0 items-center gap-1.5 font-medium ${errorCount ? 'text-bad' : 'text-ok'}`}
        >
          <span className={`size-2 rounded-full ${errorCount ? 'bg-bad' : 'bg-ok'}`} aria-hidden />
          {errorCount ? `${errorCount} problema${errorCount > 1 ? 's' : ''}` : 'Fluxo válido'}
        </button>
        {!desktop && (
          <button type="button" onClick={() => setDialog('config')} className={`shrink-0 font-medium ${provider.id === 'demo' ? 'text-trig' : 'text-ok'}`}>
            {provider.id === 'demo' ? 'Modo demonstração' : 'Claude'}
          </button>
        )}
        <span className="ml-auto min-w-0 truncate">
          Empresas, pessoas e dados fictícios<span className="hidden md:inline"> · salvo só neste navegador</span>
          <span className="hidden lg:inline">
            {' '}
            · Feito por{' '}
            <a href="https://www.linkedin.com/in/joaoguilhermegr/" className="underline underline-offset-2 hover:text-ink" target="_blank" rel="noreferrer">
              João Guilherme Gomes de Araújo
            </a>{' '}
            ·{' '}
            <a href="https://clairix.enterprises/cases" className="underline underline-offset-2 hover:text-ink" target="_blank" rel="noreferrer">
              ClairiX
            </a>
          </span>
        </span>
      </footer>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-12 z-50 flex justify-center px-4">
        {toast && (
          <p key={toast.id} className="animate-rise rounded-xl bg-ink px-4 py-2.5 text-[13px] text-paper shadow-lg">
            {toast.text}
          </p>
        )}
      </div>

      <AiComposer
        open={dialog === 'ia'}
        onClose={() => setDialog((d) => (d === 'ia' ? null : d))}
        provider={provider}
        current={flow}
        onApply={(f) => loadFlow(f, 'Fluxo aplicado. Ctrl+Z desfaz.')}
        onOpenSettings={() => setDialog('config')}
      />
      <TemplatesDialog
        open={dialog === 'modelos'}
        onClose={() => setDialog(null)}
        onPick={(id) => {
          setDialog(null)
          loadFlow({ ...templateFlow(id), id: `${id}-${Date.now().toString(36)}` }, 'Modelo carregado.')
        }}
      />
      <ShortcutsDialog open={dialog === 'atalhos'} onClose={() => setDialog(null)} />
      <SettingsDialog open={dialog === 'config'} value={settings} onClose={() => setDialog(null)} onSave={saveSettings} />
      <Dialog open={!!importErrors} onClose={() => setImportErrors(null)} title="Arquivo recusado" subtitle="O fluxo atual não foi alterado.">
        <ul className="space-y-1 font-mono text-[12px]">
          {importErrors?.map((e, i) => (
            <li key={i} className="rounded-md bg-surface px-2 py-1">
              {e}
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  )
}

function MobileAdd({ onAdd, after }: { onAdd: (t: NodeType) => void; after?: string }) {
  const [type, setType] = useState<NodeType>('acao.mensagem')
  return (
    <form
      className="flex items-end gap-2 border-b border-line p-3"
      onSubmit={(e) => {
        e.preventDefault()
        onAdd(type)
      }}
    >
      <label className="min-w-0 flex-1">
        <span className="mb-1 block text-[12px] font-medium text-ink2">{after ? `Adicionar depois de "${after}"` : 'Adicionar etapa'}</span>
        <select value={type} onChange={(e) => setType(e.target.value as NodeType)} className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px]">
          {NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {CATALOG[t].title}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-paper">
        <Plus size={15} aria-hidden /> Adicionar
      </button>
    </form>
  )
}
