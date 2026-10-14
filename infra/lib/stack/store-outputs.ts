import { spawnSync } from 'node:child_process';
import { infraDir } from '../utils/paths';

/** The `storeOutputs` stack output: each store's outputs by store id. Empty when the stack has none or cannot be read. */
export function readStoreOutputs(env: NodeJS.ProcessEnv, stack: string): Record<string, Record<string, string>> {
  const result = spawnSync('pulumi', ['stack', 'output', 'storeOutputs', '--json', '--stack', stack], { cwd: infraDir, env, encoding: 'utf8' });
  if (result.status !== 0) return {};
  try {
    const parsed = JSON.parse(result.stdout ?? '{}') as Record<string, Record<string, unknown> | undefined>;
    return Object.fromEntries(
      Object.entries(parsed ?? {}).map(([id, outputs]) => [
        id,
        Object.fromEntries(
          Object.entries(outputs ?? {}).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : String(value ?? '')]),
        ),
      ]),
    );
  } catch {
    return {};
  }
}
