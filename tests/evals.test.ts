import { describe, expect, it } from 'vitest'
import { createDemoProvider } from '../src/ai/demo/provider'
import { runCase } from '../src/evals/runner'
import { CASES } from '../src/evals/cases'

describe('avaliações: descrição em português → estrutura do fluxo', () => {
  const provider = createDemoProvider()
  it('o conjunto tem 8 descrições de 3 segmentos', () => {
    expect(CASES).toHaveLength(8)
    expect(new Set(CASES.map((c) => c.segment))).toEqual(new Set(['Restaurante', 'Loja', 'Clínica']))
  })
  for (const c of CASES) {
    it(c.description, async () => {
      const r = await runCase(c, provider)
      const failed = r.checks.filter((k) => !k.passed).map((k) => `${k.label} (obtido: ${k.detail ?? '-'})`)
      expect(failed).toEqual([])
    })
  }
})
