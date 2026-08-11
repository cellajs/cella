import { spawn, spawnSync } from 'node:child_process';
import { isBootstrapOwned } from '../scaleway/permissions';
import { crossMark, pc, warningMark } from '../utils/cli-output';
import { infraDir } from '../utils/paths';

/** Set one stack config key, exiting on failure. `secret` encrypts the value;
 *  `configFile` targets an alternate stack config file (the exposure overlay). */
export function pulumiConfigSet(
  env: NodeJS.ProcessEnv,
  stack: string,
  key: string,
  value: string,
  opts: { secret?: boolean; configFile?: string } = {},
): void {
  const args = [
    'config',
    'set',
    ...(opts.secret ? ['--secret'] : []),
    key,
    value,
    '--stack',
    stack,
    ...(opts.configFile ? ['--config-file', opts.configFile] : []),
  ];
  const result = spawnSync('pulumi', args, { cwd: infraDir, env, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`${crossMark} pulumi config set ${key} failed (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

/** Remove one stack config key. Best-effort: a missing key is not an error here. */
export function pulumiConfigRm(env: NodeJS.ProcessEnv, stack: string, key: string): void {
  const result = spawnSync('pulumi', ['config', 'rm', key, '--stack', stack], { cwd: infraDir, env, stdio: 'inherit' });
  if (result.status !== 0)
    console.warn(`${warningMark} pulumi config rm ${key} exited ${result.status} (already unset?) — continuing.`);
}

function waitForExitCode(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve) => child.once('close', (code) => resolve(code ?? 1)));
}

export type PermissionHint =
  | { kind: 'bootstrap-owned'; resource: string }
  | { kind: 'ci-grantable'; resource: string }
  | undefined;

/** Scans pulumi-up stderr for a Scaleway "insufficient permissions: write <resource>"
 *  diagnostic and classifies the resource as bootstrap-owned vs CI-grantable.
 *  Returns undefined when no such error is present. Pure. */
export function classifyPermissionError(stderr: string): PermissionHint {
  const m = stderr.match(/insufficient permissions:\s*write\s+([\w_]+)/i);
  if (!m?.[1]) return undefined;
  const resource = m[1];
  return isBootstrapOwned(resource) ? { kind: 'bootstrap-owned', resource } : { kind: 'ci-grantable', resource };
}

/**
 * Detects a Scaleway "secret ... already exists" conflict: a secret container
 * live in Scaleway but missing from Pulumi state (e.g. after a state restore),
 * so `up` fails trying to recreate it. Returns the secret name when the error
 * text carries one. Pure.
 */
export function classifyDuplicateSecretError(output: string): { name?: string } | undefined {
  const m = output.match(/secret[^\n]*already exists/i);
  if (!m) return undefined;
  return { name: m[0].match(/['"]([A-Za-z0-9][\w./-]*)['"]/)?.[1] };
}

/**
 * Extracts delete URNs whose provider returned not-found, making state pruning safe.
 * Update/read failures remain excluded because those resources should still exist.
 */
export function parseOrphanedDeletes(output: string): string[] {
  const urns = new Set<string>();
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const next = lines[i + 1] ?? '';
    const m = line.match(/error: deleting (urn:pulumi:\S+): /);
    if (!m?.[1]) continue;
    const notFound404 = /\b404\b[^\n]*not found/i;
    if (notFound404.test(line) || (/^\s*\* /.test(next) && notFound404.test(next))) urns.add(m[1]);
  }
  return [...urns];
}

/** `pulumi state delete --yes` each URN. Returns true when all succeeded; a
 *  refusal (e.g. a dependent still references the entry) is reported and the
 *  entry left in place. */
export function pruneOrphanedDeletes(urns: string[], stack: string, cwd: string, env: NodeJS.ProcessEnv): boolean {
  let ok = true;
  for (const urn of urns) {
    const res = spawnSync('pulumi', ['state', 'delete', urn, '--stack', stack, '--yes'], {
      cwd,
      env,
      encoding: 'utf8',
    });
    if (res.status === 0) {
      console.info(`  pruned ${urn}`);
    } else {
      ok = false;
      console.warn(`${warningMark} state delete refused for ${urn}: ${(res.stderr ?? '').trim().slice(0, 300)}`);
    }
  }
  return ok;
}

export interface PulumiUpResult {
  code: number;
  /** Combined stdout+stderr for post-mortem parsing (permission hints, orphaned deletes). */
  output: string;
}

/** Runs `pulumi up --stack <s> --yes --non-interactive` in `cwd` with `env`.
 *  `configFile` swaps the stack config for an alternate file (`--config-file`),
 *  used by the DB-exposure overlay. On non-zero exit, prints a permission hint
 *  when stderr indicates one. */
export async function runPulumiUpWithHint(
  stack: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  configFile?: string,
): Promise<PulumiUpResult> {
  const configFileArgs = configFile ? ['--config-file', configFile] : [];
  console.info(
    `\n→ pulumi up (base infra)\n  $ pulumi up --stack ${stack} --yes --non-interactive${configFileArgs.map((a) => ` ${a}`).join('')}`,
  );
  // stdout is teed, not inherited, so the Diagnostics section reaches
  // parseOrphanedDeletes; with --non-interactive pulumi already uses the plain
  // (non-TTY) display, so piping does not change what the operator sees.
  const child = spawn('pulumi', ['up', '--stack', stack, '--yes', '--non-interactive', ...configFileArgs], {
    cwd,
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  let stdoutBuf = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
    process.stdout.write(chunk);
  });
  let stderrBuf = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString();
    process.stderr.write(chunk);
  });

  const exitCode = await waitForExitCode(child);
  if (exitCode !== 0) {
    const dup = classifyDuplicateSecretError(`${stdoutBuf}\n${stderrBuf}`);
    if (dup) {
      console.error(
        `\n${warningMark} ${pc.bold('State hint:')} a secret container exists in Scaleway but is missing from Pulumi state.`,
      );
      console.error('  Adopt it into state, then re-run:');
      console.error(
        `  ${pc.cyan(`pulumi import scaleway:secrets/secret:Secret secret-${dup.name ?? '<secret-name>'} <region>/<secret-uuid> --stack ${stack} --yes`)}`,
      );
    }
    const hint = classifyPermissionError(stderrBuf);
    if (hint) {
      console.error(`\n${warningMark} ${pc.bold('Permission hint:')} key lacks write on ${pc.cyan(hint.resource)}.`);
      if (hint.kind === 'bootstrap-owned')
        console.error(
          `  Looks bootstrap-owned. Re-run bootstrap and choose ${pc.italic('"Apply infra change"')} to apply with a bootstrap key.`,
        );
      else
        console.error(
          `  Add the matching permission set to PROJECT_PERMISSION_SETS in lib/permissions.ts, then re-run bootstrap and choose ${pc.italic('"Rotate keys"')}.`,
        );
    }
  }

  return { code: exitCode, output: `${stdoutBuf}\n${stderrBuf}` };
}
