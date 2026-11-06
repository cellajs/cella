import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { agentBundleScript, frontendScript } from '../lib/builder/builder-machine';
import { infraDir } from '../lib/utils/paths';

/**
 * Print one of the builder's scripts as a deploy would hand it to the builder machine, for a run outside a deploy: CI's frontend-build job
 * runs the frontend one on every PR, so a change the builder cannot build fails there and not at the release deploy.
 * Usage: `pnpm --filter infra builder-script <frontend|agent>`.
 */
async function main(which: string | undefined): Promise<number> {
  const scripts = { frontend: frontendScript, agent: agentBundleScript } as const;
  const script = which === 'frontend' || which === 'agent' ? scripts[which] : undefined;
  if (!script) {
    console.error('Usage: builder-script <frontend|agent>');
    return 1;
  }
  const rootPackage = JSON.parse(await readFile(join(infraDir, '..', 'package.json'), 'utf8')) as { packageManager?: string };
  const pnpmVersion = rootPackage.packageManager?.match(/^pnpm@(.+)$/)?.[1];
  if (!pnpmVersion) throw new Error("the builder installs the pnpm the root package.json's 'packageManager' names");
  process.stdout.write(script(pnpmVersion));
  return 0;
}

process.exit(await main(process.argv[2]));
