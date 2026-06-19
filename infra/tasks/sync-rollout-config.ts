import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { getFlag } from './args'

interface GenerationMetadata {
  service: string
  gen: number
  sha?: string
}

function runPulumi(args: string[], opts: { allowFailure?: boolean } = {}): string {
  const res = spawnSync('pulumi', args, {
    cwd: new URL('..', import.meta.url).pathname,
    env: process.env,
    encoding: 'utf-8',
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  if (res.stdout) process.stdout.write(res.stdout)
  if (res.stderr) process.stderr.write(res.stderr)
  if (res.status !== 0 && !opts.allowFailure) throw new Error(`pulumi ${args.join(' ')} failed with exit ${res.status}`)
  return res.stdout.trim()
}

function configKey(service: string, key: 'gen' | 'sha' | 'pendingGen' | 'pendingSha'): string {
  return `infra:${key}_${service}`
}

function currentConfig(stack: string, key: string): string | undefined {
  const out = runPulumi(['config', 'get', key, '--stack', stack], { allowFailure: true }).trim()
  return out || undefined
}

function setConfig(stack: string, key: string, value: string | number): void {
  runPulumi(['config', 'set', key, String(value), '--stack', stack])
}

function rmConfig(stack: string, key: string): void {
  runPulumi(['config', 'rm', key, '--stack', stack], { allowFailure: true })
}

function stackOutput(stack: string, name: string): string | undefined {
  return runPulumi(['stack', 'output', name, '--stack', stack, '--json'], { allowFailure: true }).trim() || undefined
}

export function selectGeneration(items: GenerationMetadata[]): GenerationMetadata {
  return [...items].sort((a, b) => b.gen - a.gen)[0]!
}

export function generationsByService(metadata: GenerationMetadata[]): Map<string, GenerationMetadata[]> {
  const services = new Map<string, GenerationMetadata[]>()
  for (const item of metadata) {
    const generations = services.get(item.service) ?? []
    generations.push(item)
    services.set(item.service, generations)
  }
  return services
}

export async function syncRolloutConfig(argv = process.argv.slice(2)): Promise<void> {
  const stack = getFlag(argv, '--stack')
  if (!stack) throw new Error('Usage: sync-rollout-config.ts --stack <stack>')

  const rawMetadata = stackOutput(stack, 'computeGenerationMetadata')
  if (!rawMetadata) {
    console.info('[sync-rollout-config] no computeGenerationMetadata output yet; skipping')
    return
  }

  const metadata = JSON.parse(rawMetadata) as GenerationMetadata[]
  const byService = generationsByService(metadata)

  for (const [service, generations] of byService) {
    const generation = selectGeneration(generations)
    const sha = generation.sha ?? currentConfig(stack, configKey(service, 'sha')) ?? 'latest'

    console.info(`[sync-rollout-config] ${service}: gen=${generation.gen} sha=${sha}`)
    setConfig(stack, configKey(service, 'gen'), generation.gen)
    setConfig(stack, configKey(service, 'sha'), sha)
    rmConfig(stack, configKey(service, 'pendingGen'))
    rmConfig(stack, configKey(service, 'pendingSha'))
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await syncRolloutConfig()