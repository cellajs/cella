import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { machinePolicyUrns, withoutMachinePolicies } from '../lib/stack/machine-policy-state';
import { runIfMain } from '../lib/utils/is-main';
import { infraDir } from '../lib/utils/paths';
import { getFlag } from './args';

/**
 * Take the machine policies out of a stack's Pulumi state, and leave them in IAM. The program no longer declares them, so an update would
 * otherwise delete them. Idempotent: a stack without them is left alone. The caller holds the stack lock; the export before the change is kept
 * beside the edited one in a temporary folder.
 */
export function forgetMachinePolicies(stack: string, log: (message: string) => void = console.info): number {
  const run = (args: string[]) => spawnSync('pulumi', [...args, '--stack', stack], { cwd: infraDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const exported = run(['stack', 'export']);
  if (exported.status !== 0) throw new Error(`pulumi stack export failed: ${exported.stderr.trim()}`);
  const document: unknown = JSON.parse(exported.stdout);
  const urns = machinePolicyUrns(document);
  if (urns.length === 0) {
    log('The state holds no machine policy.');
    return 0;
  }
  const folder = mkdtempSync(join(tmpdir(), 'forget-machine-policies-'));
  writeFileSync(join(folder, 'before.json'), exported.stdout);
  const editedFile = join(folder, 'after.json');
  writeFileSync(editedFile, JSON.stringify(withoutMachinePolicies(document)));
  const imported = run(['stack', 'import', '--file', editedFile]);
  if (imported.status !== 0)
    throw new Error(`pulumi stack import failed: ${imported.stderr.trim()} (the export before the change is ${folder}/before.json)`);
  const check = run(['stack', 'export']);
  if (check.status !== 0 || machinePolicyUrns(JSON.parse(check.stdout)).length > 0) {
    throw new Error(`the state still holds machine policies after the import (the export before the change is ${folder}/before.json)`);
  }
  log(
    `Took ${urns.length} machine ${urns.length === 1 ? 'policy' : 'policies'} out of the state; IAM keeps them: ${urns.map((u) => u.split('::').pop()).join(', ')}.`,
  );
  return urns.length;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const stack = getFlag(argv, '--stack');
  if (!stack) throw new Error('Required: --stack <name>');
  forgetMachinePolicies(stack);
}

runIfMain(import.meta.url, main);
