/**
 * Roda as avaliações no terminal.
 *   npm run eval                                              → modo demonstração (sem custo)
 *   ANTHROPIC_API_KEY=... npm run eval -- --model claude-haiku-4-5   → modelo real
 */
import { createAnthropicProvider } from '../src/ai/anthropic'
import { createDemoProvider } from '../src/ai/demo/provider'
import { runSuite } from '../src/evals/runner'

const args = process.argv.slice(2)
const i = args.indexOf('--model')
const model = i >= 0 && args[i + 1] ? args[i + 1] : 'claude-haiku-4-5'
const key = process.env.ANTHROPIC_API_KEY
const provider = key ? createAnthropicProvider(key, model) : createDemoProvider()

console.log(`\nFluxo · avaliações "descreva e a IA monta" com ${provider.id === 'demo' ? 'modo demonstração' : provider.model}\n`)
const results = await runSuite(provider, (r) => {
  const ok = r.checks.filter((c) => c.passed).length
  console.log(`${r.passed ? '✔' : '✘'} ${r.case.id.padEnd(26)} ${String(ok).padStart(2)}/${r.checks.length}  ${r.ms} ms`)
  for (const c of r.checks.filter((c) => !c.passed)) console.log(`    ✘ ${c.label}${c.detail ? `  (obtido: ${c.detail})` : ''}`)
})

const checks = results.flatMap((r) => r.checks)
const tokens = results.reduce((s, r) => s + r.tokens, 0)
console.log(
  `\n${results.filter((r) => r.passed).length}/${results.length} descrições · ${checks.filter((c) => c.passed).length}/${checks.length} verificações · ${tokens.toLocaleString('pt-BR')} tokens${provider.id === 'demo' ? ' (estimados)' : ''}\n`,
)
process.exit(results.every((r) => r.passed) ? 0 : 1)
