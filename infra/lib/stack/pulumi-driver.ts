import { infraDir } from '../utils/paths'
import { runPulumi } from './run-pulumi'

/**
 * The engine's seam to the Pulumi engine: one stack update + output reads.
 * Two implementations: the CLI driver shells `pulumi` per call (the proven
 * default), the Automation API driver holds a LocalWorkspace session and
 * streams engine output in-process. Select with INFRA_PULUMI_DRIVER=automation.
 */
export interface PulumiDriver {
  kind: 'cli' | 'automation'
  /** One full stack update (provisions pending generations, reaps displaced ones). */
  update(): Promise<void>
  /** Read a stack output. Throws when the output is missing. */
  output<T>(name: string): Promise<T>
}

type ExecPulumi = (args: string[], opts?: { quiet?: boolean }) => string

export function createCliDriver(stack: string, exec: ExecPulumi = runPulumi): PulumiDriver {
  // Generation stacks are created on first use (micro topology); the select
  // probe runs once per driver, quietly (its failure is the expected branch).
  let ensured = false
  const ensureStack = () => {
    if (ensured) return
    ensured = true
    try {
      exec(['stack', 'select', stack], { quiet: true })
    } catch {
      exec(['stack', 'init', stack])
    }
  }
  return {
    kind: 'cli',
    async update() {
      ensureStack()
      // --skip-preview: non-interactive and serialized by the stack lock; the
      // preview pass would diff the whole stack a second time.
      exec(['up', '--stack', stack, '--yes', '--non-interactive', '--skip-preview'])
    },
    async output<T>(name: string): Promise<T> {
      return JSON.parse(exec(['stack', 'output', name, '--stack', stack, '--json'])) as T
    },
  }
}

export function createAutomationDriver(stack: string): PulumiDriver {
  // Lazily resolved: the automation host manages its own pulumi engine session.
  // workDir mode re-runs the program per operation (like the CLI), so multiple
  // updates in one deploy always see fresh module state.
  let stackPromise: Promise<import('@pulumi/pulumi/automation').Stack> | undefined
  const getStack = () => {
    stackPromise ??= (async () => {
      const { LocalWorkspace } = await import('@pulumi/pulumi/automation')
      return LocalWorkspace.createOrSelectStack({ stackName: stack, workDir: infraDir })
    })()
    return stackPromise
  }
  return {
    kind: 'automation',
    async update() {
      const s = await getStack()
      await s.up({ onOutput: (line) => process.stdout.write(line) })
    },
    async output<T>(name: string): Promise<T> {
      const s = await getStack()
      const outputs = await s.outputs()
      const entry = outputs[name]
      if (entry === undefined) throw new Error(`stack output '${name}' is missing on stack '${stack}'`)
      return entry.value as T
    },
  }
}

/** Driver for a stack, selected by INFRA_PULUMI_DRIVER (default: cli). */
export function createPulumiDriver(stack: string): PulumiDriver {
  return process.env.INFRA_PULUMI_DRIVER === 'automation' ? createAutomationDriver(stack) : createCliDriver(stack)
}
