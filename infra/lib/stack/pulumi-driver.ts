import { infraDir } from '../utils/paths'

/**
 * The engine's seam to the Pulumi engine: one stack update + output reads.
 * Backed by the Automation API (LocalWorkspace in workDir mode, which re-runs
 * the program per operation so multiple updates in one deploy always see fresh
 * module state). The interface stays the extraction seam for embedding the
 * engine in a service.
 */
export interface PulumiDriver {
  /** One full stack update (provisions pending generations, reaps displaced ones). */
  update(): Promise<void>
  /** Read a stack output. Throws when the output is missing. */
  output<T>(name: string): Promise<T>
}

export function createPulumiDriver(stack: string): PulumiDriver {
  // Lazily resolved: the automation host manages its own pulumi engine session.
  let stackPromise: Promise<import('@pulumi/pulumi/automation').Stack> | undefined
  const getStack = () => {
    stackPromise ??= (async () => {
      const { LocalWorkspace } = await import('@pulumi/pulumi/automation')
      return LocalWorkspace.createOrSelectStack({ stackName: stack, workDir: infraDir })
    })()
    return stackPromise
  }
  return {
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
