import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adoptStateBackendEnv, stateBackendUrl, stateBucket } from '../lib/stack/control-store';
import { PRIVILEGED_UP_ENV } from '../lib/stack/privileged-up';
import { runIfMain } from '../lib/utils/is-main';
import { infraDir } from '../lib/utils/paths';
import { getFlag } from './args';

/**
 * Pulumi resource types only a bootstrap key may write: the database and its privileges, IAM, the VPC and private network, and the state bucket's
 * own policy (bucket-config writes on it are reserved to the operator principal). Matched as URN-type prefixes; everything else a CI deploy applies itself.
 */
const PRIVILEGED_URN_TYPES = [
  'scaleway:databases/',
  'scaleway:iam/',
  'scaleway:network/vpc:',
  'scaleway:network/privateNetwork:',
] as const;

/** Resource names (the URN's last segment) that are privileged regardless of type. */
const PRIVILEGED_URN_NAMES = new Set(['state-bucket-policy']);

/** One step of `pulumi preview --json`. */
export interface PreviewStep {
  op: string;
  urn: string;
  /** Property paths the update touches, e.g. `rules[0].condition`. */
  detailedDiff?: Record<string, { kind: string }>;
  diffReasons?: string[];
}

export interface PendingPrivilegedChange {
  op: string;
  /** `type::name`, e.g. `scaleway:iam/policy:Policy::vm-backend-policy`. */
  resource: string;
  /** Changed property paths for an update, empty otherwise. */
  paths: string[];
}

/** URN `urn:pulumi:<stack>::<project>::<type>::<name>` → its type and name. */
export function splitUrn(urn: string): { type: string; name: string } {
  const parts = urn.split('::');
  return { type: parts[2] ?? '', name: parts.slice(3).join('::') };
}

export function isPrivilegedUrn(urn: string): boolean {
  const { type, name } = splitUrn(urn);
  return PRIVILEGED_URN_NAMES.has(name) || PRIVILEGED_URN_TYPES.some((prefix) => type.startsWith(prefix));
}

const MUTATING_OPS = new Set([
  'create',
  'update',
  'replace',
  'delete',
  'create-replacement',
  'delete-replaced',
  'import',
]);

/** The bootstrap-owned changes a preview would apply, i.e. the ones a CI deploy cannot make and an operator Apply must run first. */
export function classifyPreviewSteps(steps: PreviewStep[]): {
  privileged: PendingPrivilegedChange[];
  ciApplicable: number;
} {
  const privileged: PendingPrivilegedChange[] = [];
  let ciApplicable = 0;
  for (const step of steps) {
    if (!MUTATING_OPS.has(step.op)) continue;
    if (!isPrivilegedUrn(step.urn)) {
      ciApplicable++;
      continue;
    }
    const { type, name } = splitUrn(step.urn);
    privileged.push({ op: step.op, resource: `${type}::${name}`, paths: Object.keys(step.detailedDiff ?? {}).sort() });
  }
  return { privileged, ciApplicable };
}

/** The exact operator command for the mode. */
export function applyHint(mode: string): string {
  return `pnpm infra --mode ${mode}  →  Stack setup  →  Apply infra change`;
}

export function formatPending(mode: string, pending: PendingPrivilegedChange[]): string {
  const lines = [`✗ ${pending.length} bootstrap-owned change(s) pending; a CI deploy cannot apply them:`];
  for (const change of pending) {
    lines.push(
      `  ${change.op.padEnd(7)} ${change.resource}${change.paths.length ? `  (${change.paths.join(', ')})` : ''}`,
    );
  }
  lines.push(`  Run first: ${applyHint(mode)}`);
  return lines.join('\n');
}

/** `pulumi preview --json` under the privileged marker, so VM policy rules are diffed too. Read-only: the CI key can run it. */
export async function runPrivilegedPreview(
  stack: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PreviewStep[]> {
  const child = spawn('pulumi', ['preview', '--stack', stack, '--json', '--non-interactive'], {
    cwd: infraDir,
    env: { ...env, [PRIVILEGED_UP_ENV]: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const code = await new Promise<number | null>((done) => child.once('close', done));
  if (code !== 0) throw new Error(`pulumi preview exited ${code}: ${stderr.trim().split('\n').slice(-5).join(' | ')}`);
  const parsed = JSON.parse(stdout) as { steps?: PreviewStep[] };
  return parsed.steps ?? [];
}

/**
 * Standalone entry: `pnpm --filter infra preflight --mode <m> [--login]`. Exit 2 with the operator command when a bootstrap-owned change is pending,
 * 0 when a CI deploy can apply everything, 1 when the preview itself failed. `--login` performs the state-backend login + stack select first (the deploy has already done both).
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const mode = getFlag(argv, '--mode') ?? process.env.APP_MODE ?? process.env.INFRA_MODE;
  if (!mode) throw new Error('preflight: --mode (or APP_MODE) is required');
  process.env.APP_MODE = mode;
  const stack = getFlag(argv, '--stack') ?? `organization/infra/${mode}`;
  // The S3 state backend reads AWS_*; a CI job supplies only SCW_*.
  adoptStateBackendEnv();

  if (argv.includes('--login')) {
    const { loadEngineConfig } = await import('../config/engine-config');
    const { spawnSync } = await import('node:child_process');
    const appConfig = await loadEngineConfig();
    const url = stateBackendUrl(stateBucket(appConfig.slug), appConfig.s3.region);
    for (const args of [
      ['login', url],
      ['stack', 'select', stack],
    ]) {
      const res = spawnSync('pulumi', args, { cwd: infraDir, stdio: 'inherit' });
      if (res.status !== 0) throw new Error(`pulumi ${args.join(' ')} exited ${res.status}`);
    }
  }
  const stackFile = resolve(infraDir, `Pulumi.${mode}.yaml`);
  if (!existsSync(stackFile) || !/^encryptionsalt:/m.test(readFileSync(stackFile, 'utf8'))) {
    console.info(`[preflight] no bootstrapped Pulumi.${mode}.yaml: nothing to check`);
    return;
  }

  const steps = await runPrivilegedPreview(stack);
  const { privileged, ciApplicable } = classifyPreviewSteps(steps);
  if (privileged.length > 0) {
    console.error(formatPending(mode, privileged));
    process.exitCode = 2;
    return;
  }
  console.info(`✓ no bootstrap-owned change pending (${ciApplicable} CI-applicable change(s) in the plan)`);
}

runIfMain(import.meta.url, main);
