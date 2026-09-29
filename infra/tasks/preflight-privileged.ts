import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adoptStateBackendEnv, stateBackendUrl, stateBucket } from '../lib/stack/control-store';
import { PRIVILEGED_UP_ENV } from '../lib/stack/privileged-up';
import { ExitCodeError } from '../lib/utils/errors';
import { runIfMain } from '../lib/utils/is-main';
import { infraDir } from '../lib/utils/paths';
import { getFlag } from './args';

/**
 * Pulumi resource types only a privileged run (the Owner API key) may write: the database and its privileges, IAM, the VPC and private network, and the state bucket's
 * own policy (bucket-config writes on it are reserved to the admin application). Matched as URN-type prefixes; everything else a CI deploy applies itself.
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
  /** The resource as state holds it (the provider diffs against its outputs) and as the program declares it. */
  oldState?: { inputs?: Record<string, unknown>; outputs?: Record<string, unknown> };
  newState?: { inputs?: Record<string, unknown>; outputs?: Record<string, unknown> };
}

export interface PendingPrivilegedChange {
  op: string;
  /** `type::name`, e.g. `scaleway:iam/policy:Policy::vm-backend-policy`. */
  resource: string;
  /** Changed property paths for an update, empty otherwise. */
  paths: string[];
  /** Old (state outputs) and new (program inputs) value per changed path; IAM policies only, whose rules hold no secret. */
  values?: Array<{ path: string; old: unknown; new: unknown }>;
}

/** Read a `detailedDiff` path such as `rules[0].condition` out of a state object; undefined when any segment is missing. */
export function readPath(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const part of path.split('.')) {
    const match = part.match(/^([^[]+)((?:\[\d+\])*)$/);
    if (!match) return undefined;
    current = (current as Record<string, unknown> | undefined)?.[match[1] as string];
    for (const index of (match[2] as string).matchAll(/\[(\d+)\]/g)) {
      current = (current as unknown[] | undefined)?.[Number(index[1])];
    }
  }
  return current;
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

/** The privileged changes a preview would apply, i.e. the ones a CI deploy cannot make and an operator Apply must run first. */
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
    const paths = Object.keys(step.detailedDiff ?? {}).sort();
    // A policy's rules carry no secret, and the old value is what Pulumi will overwrite: an update Scaleway never kept shows up here as stale outputs.
    const values =
      type.startsWith('scaleway:iam/') && paths.length > 0 && (step.oldState || step.newState)
        ? paths.map((path) => ({
            path,
            old: readPath(step.oldState?.outputs, path),
            new: readPath(step.newState?.inputs, path),
          }))
        : undefined;
    privileged.push({ op: step.op, resource: `${type}::${name}`, paths, ...(values ? { values } : {}) });
  }
  return { privileged, ciApplicable };
}

const showValue = (value: unknown): string =>
  value === undefined ? '(unset)' : typeof value === 'string' ? value : JSON.stringify(value);

/** The exact operator command for the mode. */
export function applyHint(mode: string): string {
  return `pnpm infra --mode ${mode}  →  Stack setup  →  Apply infra change`;
}

export function formatPending(mode: string, pending: PendingPrivilegedChange[]): string {
  const lines = [`✗ ${pending.length} privileged change(s) pending; a CI deploy cannot apply them:`];
  for (const change of pending) {
    lines.push(
      `  ${change.op.padEnd(7)} ${change.resource}${change.paths.length ? `  (${change.paths.join(', ')})` : ''}`,
    );
    for (const value of change.values ?? []) {
      lines.push(`          ${value.path}: ${showValue(value.old)} → ${showValue(value.new)}`);
    }
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

/** What `main` reads from the machine: whether the mode's stack is set up, and the privileged preview. */
export interface PreflightEffects {
  /** True when `Pulumi.<mode>.yaml` exists and carries an encryption salt. */
  stackIsSetUp(mode: string): boolean;
  preview(stack: string): Promise<PreviewStep[]>;
}

const liveEffects: PreflightEffects = {
  stackIsSetUp: (mode) => {
    const stackFile = resolve(infraDir, `Pulumi.${mode}.yaml`);
    return existsSync(stackFile) && /^encryptionsalt:/m.test(readFileSync(stackFile, 'utf8'));
  },
  preview: (stack) => runPrivilegedPreview(stack),
};

/**
 * Standalone entry: `pnpm --filter infra preflight --mode <m> [--login]`. Exit 2 with the operator command when a privileged change is pending,
 * 0 when a CI deploy can apply everything, 1 when the preview itself failed. `--login` performs the state-backend login + stack select first (the deploy has already done both).
 */
export async function main(argv = process.argv.slice(2), fx: PreflightEffects = liveEffects): Promise<void> {
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
  if (!fx.stackIsSetUp(mode)) {
    console.info(`[preflight] no set-up Pulumi.${mode}.yaml: nothing to check`);
    return;
  }

  const steps = await fx.preview(stack);
  const { privileged, ciApplicable } = classifyPreviewSteps(steps);
  // Thrown, never set as the exit code: the deploy runs this task in-process and must stop here.
  if (privileged.length > 0) throw new ExitCodeError(formatPending(mode, privileged), 2);
  console.info(`✓ no privileged change pending (${ciApplicable} CI-applicable change(s) in the plan)`);
}

runIfMain(import.meta.url, main);
