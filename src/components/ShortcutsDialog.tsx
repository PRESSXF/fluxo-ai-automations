import { Dialog } from './Dialog'

const ROWS: Array<[string[], string]> = [
  [['Tab'], 'Passa pelas etapas do canvas, na ordem do fluxo'],
  [['Enter'], 'Abre a etapa focada no painel de propriedades'],
  [['←', '↑', '→', '↓'], 'Move a etapa selecionada (Shift: passo maior); sem seleção, move a visão'],
  [['Delete'], 'Exclui a etapa ou a ligação selecionada'],
  [['Ctrl', 'D'], 'Duplica a etapa selecionada'],
  [['Ctrl', 'Z'], 'Desfaz'],
  [['Ctrl', 'Shift', 'Z'], 'Refaz (Ctrl+Y também)'],
  [['+', '−'], 'Aproxima e afasta'],
  [['0'], 'Ajusta o fluxo à tela'],
  [['Ctrl', 'K'], 'Abre "Descreva e a IA monta"'],
  [['Ctrl', 'Enter'], 'Roda a simulação'],
  [['Esc'], 'Limpa a seleção'],
  [['?'], 'Mostra estes atalhos'],
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Atalhos de teclado" subtitle="No Mac, use ⌘ no lugar de Ctrl. Tudo também pode ser feito pelos painéis.">
      <table className="w-full text-[13px]">
        <tbody>
          {ROWS.map(([keys, desc]) => (
            <tr key={desc} className="border-b border-line/70 last:border-0">
              <td className="whitespace-nowrap py-2 pr-4 align-top">
                {keys.map((k) => (
                  <kbd key={k} className="kbd mr-1">
                    {k}
                  </kbd>
                ))}
              </td>
              <td className="py-2 text-ink2">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  )
}
