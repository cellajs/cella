import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { infraDir } from './paths';

/** Parse a dotenv-style file into key/value pairs (no interpolation). */
export function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    out[match[1]!] = (match[2] ?? '').replace(/^['"]|['"]$/g, '');
  }
  return out;
}

/** Load backend/.env before the root fallback so infra tasks share the app's local config. Existing environment variables keep precedence over both files. */
export function loadBaseEnvFiles(): void {
  for (const envFile of [resolve(infraDir, '..', 'backend', '.env'), resolve(infraDir, '..', '.env')]) {
    if (existsSync(envFile)) process.loadEnvFile(envFile);
  }
}

/** The names a mode env file used for the admin application key before 0.12: read as `SCW_ADMIN_*` with a rename warning, removed by the actions that write the admin key. */
export const LEGACY_ADMIN_KEY_NAMES = [
  'SCW_ACCESS_KEY',
  'SCW_SECRET_KEY',
  'SCW_STATE_ACCESS_KEY',
  'SCW_STATE_SECRET_KEY',
] as const;

/**
 * The values a parsed mode env file exports, and the warnings it earns. The provider's own `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` never come from
 * the file: in it they meant the admin application key, which now travels as `SCW_ADMIN_*`, and in the process env they keep meaning the key the
 * process was started with (a CI runner, a shell export).
 */
export function modeEnvValues(
  parsed: Record<string, string>,
  mode: string,
): { values: Record<string, string>; warnings: string[] } {
  const values = { ...parsed };
  const warnings: string[] = [];
  const legacy = ['SCW_ACCESS_KEY', 'SCW_SECRET_KEY'] as const;
  if (legacy.some((name) => name in values)) {
    if ('SCW_ADMIN_ACCESS_KEY' in values || 'SCW_ADMIN_SECRET_KEY' in values) {
      warnings.push(
        `infra/.env.${mode}: SCW_ACCESS_KEY / SCW_SECRET_KEY are ignored because SCW_ADMIN_* is set; remove them.`,
      );
    } else {
      if (values.SCW_ACCESS_KEY !== undefined) values.SCW_ADMIN_ACCESS_KEY = values.SCW_ACCESS_KEY;
      if (values.SCW_SECRET_KEY !== undefined) values.SCW_ADMIN_SECRET_KEY = values.SCW_SECRET_KEY;
      warnings.push(
        `infra/.env.${mode}: SCW_ACCESS_KEY / SCW_SECRET_KEY are read as SCW_ADMIN_ACCESS_KEY / SCW_ADMIN_SECRET_KEY; rename them (Manage keys & secrets → Fetch admin application key rewrites the file).`,
      );
    }
    for (const name of legacy) delete values[name];
  }
  return { values, warnings };
}

/**
 * Load `infra/.env.<mode>`, which overrides the ambient env so a staging run cannot inherit production values. The file holds a live secret key
 * and the Pulumi passphrase, so it is tightened to 0600 on sight. Returns the warnings the file earned (superseded key names).
 */
export function loadModeEnvFile(mode: string, log: (message: string) => void = () => {}): string[] {
  // A bare infra/.env is never read; naming the file that is read saves a round of prompts for the values it holds.
  const strayEnvPath = resolve(infraDir, '.env');
  if (existsSync(strayEnvPath))
    log(`${strayEnvPath} is not read: mode-scoped keys live in infra/.env.${mode} (infra/README.md, Key files).`);
  const modeEnvPath = resolve(infraDir, `.env.${mode}`);
  if (!existsSync(modeEnvPath)) return [];
  const fileMode = statSync(modeEnvPath).mode;
  if ((fileMode & 0o077) !== 0) {
    chmodSync(modeEnvPath, 0o600);
    log(`Tightened ${modeEnvPath} to 600 (was ${(fileMode & 0o777).toString(8)}): it carries a live secret key.`);
  }
  const { values, warnings } = modeEnvValues(parseEnvFile(modeEnvPath), mode);
  for (const [key, value] of Object.entries(values)) process.env[key] = resolveSecretReference(key, value);
  log(`Loaded ${modeEnvPath} (mode-scoped env, overrides ambient values)`);
  return warnings;
}

/** Minimal command runner, injectable for tests. */
export type ExecLike = (
  cmd: string,
  args: string[],
  input?: string,
) => { status: number | null; stdout: string; stderr: string };

const defaultExec: ExecLike = (cmd, args, input) => {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'pipe'],
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
};

/** `keychain:<service>/<account>` → the OS keychain entry; `op:<op://vault/item/field>` → the 1Password CLI. Anything else is the literal value. */
export function parseSecretReference(
  value: string,
): { kind: 'keychain'; service: string; account: string } | { kind: 'op'; ref: string } | undefined {
  const keychain = value.match(/^keychain:([^/]+)\/(.+)$/);
  if (keychain) return { kind: 'keychain', service: keychain[1] as string, account: keychain[2] as string };
  const op = value.match(/^op:(op:\/\/.+)$/);
  if (op) return { kind: 'op', ref: op[1] as string };
  return undefined;
}

/**
 * Resolve a secret reference to its value at load time, so a passphrase or key can live in the OS keychain or a password manager while the env file
 * holds only a pointer. A literal value passes through untouched. A reference that cannot be read throws with the command to fix it.
 */
export function resolveSecretReference(
  key: string,
  value: string,
  exec: ExecLike = defaultExec,
  platform = process.platform,
): string {
  const ref = parseSecretReference(value);
  if (!ref) return value;
  const fail = (what: string, detail: string) => new Error(`${key}: ${what} (${detail.trim() || 'no output'})`);
  if (ref.kind === 'op') {
    const res = exec('op', ['read', ref.ref]);
    if (res.status !== 0) throw fail(`1Password read of ${ref.ref} failed`, res.stderr);
    return res.stdout.replace(/\r?\n$/, '');
  }
  const [cmd, args] =
    platform === 'darwin'
      ? ['security', ['find-generic-password', '-s', ref.service, '-a', ref.account, '-w']]
      : ['secret-tool', ['lookup', 'service', ref.service, 'account', ref.account]];
  const res = exec(cmd, args);
  if (res.status !== 0 || res.stdout === '') {
    throw fail(
      `keychain entry ${ref.service}/${ref.account} not found`,
      `store it with: pnpm infra → Manage keys & secrets → Store passphrase in keychain, or ${cmd} directly; ${res.stderr}`,
    );
  }
  return res.stdout.replace(/\r?\n$/, '');
}

/** Write a secret into the OS keychain under `service`/`account`, replacing an existing entry. */
export function storeInKeychain(
  service: string,
  account: string,
  value: string,
  exec: ExecLike = defaultExec,
  platform = process.platform,
): void {
  const res =
    platform === 'darwin'
      ? exec('security', ['add-generic-password', '-U', '-s', service, '-a', account, '-w', value])
      : exec('secret-tool', ['store', `--label=${service} ${account}`, 'service', service, 'account', account], value);
  if (res.status !== 0)
    throw new Error(`keychain write for ${service}/${account} failed (${res.stderr.trim() || 'no output'})`);
}

/** The reference `resolveSecretReference` reads back for a keychain entry. */
export function keychainReference(service: string, account: string): string {
  return `keychain:${service}/${account}`;
}

/** Path of the mode-scoped operator env file. */
export function modeEnvPath(mode: string): string {
  return resolve(infraDir, `.env.${mode}`);
}

/**
 * Write (or update) values in a dotenv-style file, keeping every other line and comment as it is, creating the file mode 0600.
 * Values are written unquoted on one line each; a newline in a value is refused, as `isEnvFileDeliverable` would.
 * `remove` drops the named keys (superseded names); the ones actually found are returned.
 */
export function writeEnvValues(
  path: string,
  values: Record<string, string>,
  opts: { remove?: readonly string[] } = {},
): string[] {
  for (const [key, value] of Object.entries(values)) {
    if (/[\r\n]/.test(value)) throw new Error(`${key}: a value cannot span lines in ${path}`);
  }
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split('\n') : [];
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const pending = new Map(Object.entries(values));
  const removable = new Set(opts.remove ?? []);
  const removed: string[] = [];
  const out: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    const key = match?.[1];
    if (key && removable.has(key)) {
      removed.push(key);
      continue;
    }
    if (!key || !pending.has(key)) {
      out.push(line);
      continue;
    }
    out.push(`${key}=${pending.get(key) as string}`);
    pending.delete(key);
  }
  for (const [key, value] of pending) out.push(`${key}=${value}`);
  writeFileSync(path, `${out.join('\n')}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return removed;
}

/** Write values into `infra/.env.<mode>`, the file `loadModeEnvFile` reads; `remove` drops superseded names. */
export function writeModeEnvValues(
  mode: string,
  values: Record<string, string>,
  opts: { remove?: readonly string[] } = {},
): { path: string; removed: string[] } {
  const path = modeEnvPath(mode);
  return { path, removed: writeEnvValues(path, values, opts) };
}
