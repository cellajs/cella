import { writeFile } from 'node:fs/promises';
import { type GenerationKeys, readStandingKey } from '../lib/scaleway/machine-keys';
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { runIfMain } from '../lib/utils/is-main';
import { getFlag } from './args';

/**
 * Read each running service's standing key from the deploy folder into `--out`, which the deploy hands `pulumi up` as
 * INFRA_GENERATION_KEYS_FILE. The deploy key in SCW_SECRET_KEY reads them; the identity plan at the deploy's start checked them.
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const secretKey = process.env.SCW_SECRET_KEY;
  const outFile = getFlag(argv, '--out');
  const projectId = getFlag(argv, '--project-id') ?? process.env.SCW_DEFAULT_PROJECT_ID;
  if (!secretKey || !outFile || !projectId) throw new Error('Required: SCW_SECRET_KEY, --out, --project-id (or SCW_DEFAULT_PROJECT_ID)');
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  const { runningServices } = await import('../lib/services');
  const secrets = createSecretManagerClient({ secretKey, region: appConfig.s3.region, projectId });
  const keys: GenerationKeys = {};
  for (const svc of runningServices(appConfig.services)) keys[svc.slug] = await readStandingKey(secrets, svc.slug);
  await writeFile(outFile, JSON.stringify(keys), { mode: 0o600 });
}

runIfMain(import.meta.url, main);
