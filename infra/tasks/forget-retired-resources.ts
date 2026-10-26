import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { engineMadeRuntimeSecrets } from '../lib/runtime-secrets';
import { retiredUrns, withoutUrns } from '../lib/stack/retired-state';
import { runIfMain } from '../lib/utils/is-main';
import { infraDir } from '../lib/utils/paths';
import { getFlag } from './args';

/**
 * Take the retired resources out of a stack's Pulumi state, and leave them live (lib/stack/retired-state.ts): the program no longer declares
 * them, so an update would otherwise delete them. Idempotent: a stack without them is left alone. The caller holds the stack lock; the export
 * before the change is kept beside the edited one in a temporary folder.
 */
export function forgetRetiredResources(stack: string, log: (message: string) => void = console.info): number {
  const generated = new Set(engineMadeRuntimeSecrets().map((definition) => definition.secretName));
  const run = (args: string[]) => spawnSync('pulumi', [...args, '--stack', stack], { cwd: infraDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const exported = run(['stack', 'export']);
  if (exported.status !== 0) throw new Error(`pulumi stack export failed: ${exported.stderr.trim()}`);
  const document: unknown = JSON.parse(exported.stdout);
  const urns = retiredUrns(document, generated);
  if (urns.length === 0) {
    log('The state holds no retired resource.');
    return 0;
  }
  const folder = mkdtempSync(join(tmpdir(), 'forget-retired-resources-'));
  writeFileSync(join(folder, 'before.json'), exported.stdout);
  const editedFile = join(folder, 'after.json');
  writeFileSync(editedFile, JSON.stringify(withoutUrns(document, urns)));
  const imported = run(['stack', 'import', '--file', editedFile]);
  if (imported.status !== 0)
    throw new Error(`pulumi stack import failed: ${imported.stderr.trim()} (the export before the change is ${folder}/before.json)`);
  const check = run(['stack', 'export']);
  if (check.status !== 0 || retiredUrns(JSON.parse(check.stdout), generated).length > 0) {
    throw new Error(`the state still holds retired resources after the import (the export before the change is ${folder}/before.json)`);
  }
  log(`Took ${urns.length} retired resource(s) out of the state; they stay live: ${urns.map((u) => u.split('::').pop()).join(', ')}.`);
  return urns.length;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const stack = getFlag(argv, '--stack');
  if (!stack) throw new Error('Required: --stack <name>');
  forgetRetiredResources(stack);
}

runIfMain(import.meta.url, main);
