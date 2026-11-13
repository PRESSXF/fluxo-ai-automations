import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react'
import type { Issue } from '../domain/validate'

export function IssueItem({ issue, compact, onLocate }: { issue: Issue; compact?: boolean; onLocate?: (id: string) => void }) {
  const err = issue.severity === 'erro'
  const Icon = err ? OctagonAlert : TriangleAlert
  return (
    <li className={`rounded-xl border p-3 ${err ? 'border-bad/30 bg-bad/[.04]' : 'border-warn/30 bg-warn/[.05]'}`}>
      <div className="flex gap-2.5">
        <Icon size={16} className={`mt-0.5 shrink-0 ${err ? 'text-bad' : 'text-warn'}`} aria-hidden />
        <div className="min-w-0 text-[13px]">
          <p className="font-medium leading-snug text-ink">
            <span className="sr-only">{err ? 'Erro: ' : 'Aviso: '}</span>
            {issue.message}
          </p>
          <p className={`mt-1 leading-snug text-ink2 ${compact ? 'text-[12px]' : ''}`}>{issue.hint}</p>
          {onLocate && issue.nodeIds[0] && (
            <button type="button" onClick={() => onLocate(issue.nodeIds[0])} className="mt-1.5 text-[12px] font-semibold text-ember underline underline-offset-2">
              Mostrar a etapa
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

export function IssuesPanel({ issues, onLocate }: { issues: Issue[]; onLocate: (id: string) => void }) {
  const errs = issues.filter((i) => i.severity === 'erro').length
  if (!issues.length)
    return (
      <div className="flex items-start gap-3 p-4">
        <CircleCheck className="mt-0.5 shrink-0 text-ok" size={20} aria-hidden />
        <div>
          <p className="font-display font-semibold">Nenhum problema</p>
          <p className="mt-0.5 text-[13px] text-ink2">Todas as etapas estão ligadas, preenchidas e sem ciclos. O fluxo pode ser simulado.</p>
        </div>
      </div>
    )
  return (
    <div className="space-y-3 p-4">
      <p className="text-[13px] text-ink2">
        {errs > 0 ? (
          <>
            <strong className="text-bad">
              {errs} erro{errs > 1 ? 's' : ''}
            </strong>{' '}
            impede{errs > 1 ? 'm' : ''} a simulação.
          </>
        ) : (
          'Só avisos: o fluxo pode rodar, mas vale revisar.'
        )}
      </p>
      <ul className="space-y-2">
        {issues.map((i, k) => (
          <IssueItem key={k} issue={i} onLocate={onLocate} />
        ))}
      </ul>
    </div>
  )
}
