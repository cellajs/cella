import type { ImportResource } from '@pulumi/pulumi/automation';
import { infraDir } from '../utils/paths';

/**
 * The engine's seam to the Pulumi engine: one stack update + output reads.
 * Backed by the Automation API (LocalWorkspace in workDir mode, which re-runs
 * the program per operation so multiple updates in one deploy always see fresh
 * module state). The interface stays the extraction seam for embedding the
 * engine in a service.
 */
export interface PulumiDriver {
  /** One full stack update. */
  update(): Promise<void>;
  /** Read a stack output. Throws when the output is missing. */
  output<T>(name: string): Promise<T>;
  /** The stack's state, as `pulumi stack export` writes it. */
  exportState(): Promise<unknown>;
  /** Import live resources into the state under the given types and names, unprotected and without generated code. */
  importResources(resources: ImportResource[]): Promise<void>;
}

/** `env`: the environment Pulumi runs in, with the run's key and passphrase; the process's own by default. */
export function createPulumiDriver(stack: string, opts: { env?: NodeJS.ProcessEnv } = {}): PulumiDriver {
  const envVars = opts.env && Object.fromEntries(Object.entries(opts.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  // Lazily resolved: the automation host manages its own pulumi engine session.
  let stackPromise: Promise<import('@pulumi/pulumi/automation').Stack> | undefined;
  const getStack = () => {
    stackPromise ??= (async () => {
      const { LocalWorkspace } = await import('@pulumi/pulumi/automation');
      return LocalWorkspace.createOrSelectStack({ stackName: stack, workDir: infraDir }, envVars ? { envVars } : undefined);
    })();
    return stackPromise;
  };
  return {
    async update() {
      const s = await getStack();
      await s.up({ onOutput: (line) => process.stdout.write(line) });
    },
    async output<T>(name: string): Promise<T> {
      const s = await getStack();
      const outputs = await s.outputs();
      const entry = outputs[name];
      if (entry === undefined) throw new Error(`stack output '${name}' is missing on stack '${stack}'`);
      return entry.value as T;
    },
    async exportState() {
      return (await getStack()).exportStack();
    },
    async importResources(resources) {
      const s = await getStack();
      await s.import({ resources, protect: false, generateCode: false, onOutput: (line) => process.stdout.write(line) });
    },
  };
}
