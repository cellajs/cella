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

/** The env files every mode reads, in loading order. */
const baseEnvFiles = (): string[] => [resolve(infraDir, '..', 'backend', '.env'), resolve(infraDir, '..', '.env')];

/** Load backend/.env before the root fallback so infra tasks share the app's local config. Existing environment variables keep precedence over both files. */
export function loadBaseEnvFiles(): void {
  for (const envFile of baseEnvFiles()) {
    if (existsSync(envFile)) process.loadEnvFile(envFile);
  }
}

/** The project id that a file every mode reads names. Such an id belongs to no single environment. */
export function sharedFileProjectId(): string | undefined {
  for (const envFile of baseEnvFiles()) {
    const id = existsSync(envFile) ? parseEnvFile(envFile).SCW_PROJECT_ID?.trim() : undefined;
    if (id) return id;
  }
  return undefined;
}

/** The project id a mode's own env file names: every environment has a project of its own, and this is where its id lives. */
export function ownProjectId(mode: string): string | undefined {
  const path = modeEnvPath(mode);
  return (existsSync(path) ? parseEnvFile(path).SCW_PROJECT_ID?.trim() : undefined) || undefined;
}

/** Names a mode env file held for the admin application key, which is retired: never read, and removed when the observer key is written. */
export const RETIRED_KEY_NAMES = [
  'SCW_ADMIN_ACCESS_KEY',
  'SCW_ADMIN_SECRET_KEY',
  'SCW_ACCESS_KEY',
  'SCW_SECRET_KEY',
  'SCW_STATE_ACCESS_KEY',
  'SCW_STATE_SECRET_KEY',
] as const;

/** Where the observer key lives in `infra/.env.<mode>`. */
export const OBSERVER_KEY_NAMES = { accessKey: 'SCW_OBSERVER_ACCESS_KEY', secretKey: 'SCW_OBSERVER_SECRET_KEY' } as const;

/**
 * Names whose value a person supplies at the prompt, every run: a privileged key and the Pulumi passphrase. The CLI reads none of them from a
 * file or the environment, in any form, as a value on disk would let it change infrastructure with nobody at the terminal.
 */
const PROMPT_ONLY_NAMES = [
  'PULUMI_CONFIG_PASSPHRASE',
  'SCW_OWNER_ACCESS_KEY',
  'SCW_OWNER_SECRET_KEY',
  'SCW_BOOTSTRAP_ACCESS_KEY',
  'SCW_BOOTSTRAP_SECRET_KEY',
  'SCW_BOOTSTRAP_KEY',
] as const;

/** Take the prompt-only names out of `env` and return the ones it held, for the CLI to name once. */
export function dropPromptOnlyEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const found = PROMPT_ONLY_NAMES.filter((name) => env[name] !== undefined);
  for (const name of found) delete env[name];
  return found;
}

/**
 * The values a parsed mode env file exports, and the warnings it earns. A retired name is dropped: the admin application key is gone, and the
 * provider's own `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` keep meaning the key the process was started with (a CI runner, a shell export).
 */
export function modeEnvValues(parsed: Record<string, string>, mode: string): { values: Record<string, string>; warnings: string[] } {
  const values = { ...parsed };
  const warnings: string[] = [];
  const stored = PROMPT_ONLY_NAMES.filter((name) => name in values);
  for (const name of stored) delete values[name];
  if (stored.length > 0) {
    warnings.push(
      `infra/.env.${mode}: ${stored.join(', ')} ${stored.length === 1 ? 'is' : 'are'} not read. The CLI asks for a privileged key at the prompt and fetches the passphrase with it: remove ${stored.length === 1 ? 'the line' : 'these lines'}.`,
    );
  }
  const retired = RETIRED_KEY_NAMES.filter((name) => name in values);
  for (const name of retired) delete values[name];
  if (retired.length > 0) {
    warnings.push(
      `infra/.env.${mode}: ${retired.join(', ')} ${retired.length === 1 ? 'is' : 'are'} not read. The admin application key is retired and the observer key (SCW_OBSERVER_*) reads: remove ${retired.length === 1 ? 'the line' : 'these lines'}.`,
    );
  }
  return { values, warnings };
}

/**
 * Load `infra/.env.<mode>`, which overrides the ambient env so a staging run cannot inherit production values. The file holds a live secret key,
 * so it is tightened to 0600 on sight. Returns the warnings the file earned (superseded key names, values the CLI no longer reads).
 */
export function loadModeEnvFile(mode: string, log: (message: string) => void = () => {}): string[] {
  // A bare infra/.env is never read; naming the file that is read saves a round of prompts for the values it holds.
  const strayEnvPath = resolve(infraDir, '.env');
  if (existsSync(strayEnvPath)) log(`${strayEnvPath} is not read: mode-scoped keys live in infra/.env.${mode} (infra/README.md, Key files).`);
  const modeEnvPath = resolve(infraDir, `.env.${mode}`);
  if (!existsSync(modeEnvPath)) return [];
  const fileMode = statSync(modeEnvPath).mode;
  if ((fileMode & 0o077) !== 0) {
    chmodSync(modeEnvPath, 0o600);
    log(`Tightened ${modeEnvPath} to 600 (was ${(fileMode & 0o777).toString(8)}): it carries a live secret key.`);
  }
  const { values, warnings } = modeEnvValues(parseEnvFile(modeEnvPath), mode);
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  log(`Loaded ${modeEnvPath} (mode-scoped env, overrides ambient values)`);
  return warnings;
}

/** Path of the mode-scoped operator env file. */
function modeEnvPath(mode: string): string {
  return resolve(infraDir, `.env.${mode}`);
}

/**
 * Write (or update) values in a dotenv-style file, keeping every other line and comment as it is, creating the file mode 0600.
 * Values are written unquoted on one line each; a newline in a value is refused, as `isEnvFileDeliverable` would.
 * `remove` drops the named keys (superseded names); the ones actually found are returned.
 */
export function writeEnvValues(path: string, values: Record<string, string>, opts: { remove?: readonly string[] } = {}): string[] {
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

/** The observer key a mode's env file holds, read from the file itself; undefined when it holds none. */
export function observerKeyInModeFile(mode: string): { accessKey: string; secretKey: string } | undefined {
  const path = modeEnvPath(mode);
  if (!existsSync(path)) return undefined;
  const parsed = parseEnvFile(path);
  const accessKey = parsed[OBSERVER_KEY_NAMES.accessKey]?.trim();
  const secretKey = parsed[OBSERVER_KEY_NAMES.secretKey]?.trim();
  return accessKey && secretKey ? { accessKey, secretKey } : undefined;
}

/**
 * Write the observer key to `mode`'s env file and to every other mode file in `modes` that holds one, so the one key of the app's observer
 * serves them all; the retired names leave each file written. Returns the files written.
 */
export function writeObserverKey(mode: string, pair: { accessKey: string; secretKey: string }, modes: readonly string[]): string[] {
  const targets = [mode, ...modes.filter((other) => other !== mode && observerKeyInModeFile(other))];
  const values = { [OBSERVER_KEY_NAMES.accessKey]: pair.accessKey, [OBSERVER_KEY_NAMES.secretKey]: pair.secretKey };
  return targets.map((target) => writeModeEnvValues(target, values, { remove: RETIRED_KEY_NAMES }).path);
}
