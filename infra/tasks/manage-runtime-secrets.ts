import { protectsStoredData, type RuntimeSecretDefinition, runtimeSecrets } from '../lib/runtime-secrets';
import type { createSecretManagerClient, SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { RUNTIME_FOLDER } from '../lib/scaleway/secret-paths';
import { crossMark, pc } from '../lib/utils/cli-output';
import { isEnvFileDeliverable } from '../lib/utils/env-file';
import { isMain } from '../lib/utils/is-main';
import { ensureSecrets } from './ensure-secrets';

export type SecretManagerClient = ReturnType<typeof createSecretManagerClient>;

/** A secret of the runtime folder, with the date its newest version was written. */
export type RuntimeContainer = SecretManagerSecret & { setAt?: string };

/** A row of the table: the name the app reads, the services that read it, and what Secret Manager holds for it. */
export interface SecretRow {
  envVar: string;
  usedBy: string;
  state: string;
  kind: 'missing' | 'empty' | 'set' | 'infra';
  definition: RuntimeSecretDefinition;
}

const kindOrder: SecretRow['kind'][] = ['missing', 'set', 'empty', 'infra'];
const kindMarks: Record<SecretRow['kind'], string> = { missing: crossMark, empty: pc.dim('○'), set: pc.green('●'), infra: pc.dim('◇') };

/** `Nov 8` in the local time zone, or nothing when Secret Manager gave no date. */
function shortDate(iso: string | undefined): string {
  const date = iso ? new Date(iso) : undefined;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
}

/**
 * One row per runtime secret: required values without a version first, then optional ones without, then the ones set, then the ones infra
 * makes, in registry order within each. `containers` are the runtime folder's secrets by name.
 */
export function secretsTable(
  definitions: readonly RuntimeSecretDefinition[],
  containers: ReadonlyMap<string, { version_count?: number; setAt?: string }>,
): SecretRow[] {
  const rows = definitions.map((definition): SecretRow => {
    const row = { envVar: definition.envVar, usedBy: definition.services.join(', '), definition };
    if (definition.valueSource !== 'operator') {
      return { ...row, kind: 'infra', state: protectsStoredData(definition) ? 'made by infra · kept' : 'made by infra' };
    }
    const container = containers.get(definition.secretName);
    if (container && (container.version_count ?? 0) > 0) return { ...row, kind: 'set', state: `set ${shortDate(container.setAt)}`.trimEnd() };
    return definition.required ? { ...row, kind: 'missing', state: 'missing · required' } : { ...row, kind: 'empty', state: 'empty · optional' };
  });
  return rows.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind));
}

/** The column header and a line formatter whose columns align across `rows`. */
export function tableColumns(rows: readonly SecretRow[]): { header: string; line: (row: SecretRow) => string } {
  const header = { envVar: 'NAME', usedBy: 'USED BY', state: 'STATE' };
  const nameWidth = Math.max(...[header, ...rows].map((row) => row.envVar.length));
  const usedByWidth = Math.max(...[header, ...rows].map((row) => row.usedBy.length));
  const text = (row: Pick<SecretRow, 'envVar' | 'usedBy' | 'state'>) =>
    `${row.envVar.padEnd(nameWidth)}  ${row.usedBy.padEnd(usedByWidth)}  ${row.state}`;
  return {
    header: pc.dim(`  ${text(header)}`),
    line: (row) => `${kindMarks[row.kind]} ${row.kind === 'infra' ? pc.dim(text(row)) : text(row)}`,
  };
}

/** The header, then one line per row: a mark per state, and the rows infra makes dimmed. */
export function formatSecretsTable(rows: readonly SecretRow[]): string[] {
  const { header, line } = tableColumns(rows);
  return [header, ...rows.map(line)];
}

/** The runtime folder's secrets by name. */
export async function readContainers(client: SecretManagerClient): Promise<Map<string, RuntimeContainer>> {
  const secrets = await client.listSecretsUnder(RUNTIME_FOLDER);
  // The secret's own `updated_at` moves with its container (a move, a description), so the date a value was set is its newest version's.
  const setAt = await Promise.all(
    secrets.map(async (secret) => {
      if ((secret.version_count ?? 0) === 0) return undefined;
      const versions = await client.listSecretVersions(secret.id).catch(() => []);
      const newest = versions.reduce<(typeof versions)[number] | undefined>(
        (best, version) => (!best || version.revision > best.revision ? version : best),
        undefined,
      );
      return newest?.created_at ?? undefined;
    }),
  );
  return new Map(secrets.map((secret, index) => [secret.name, { ...secret, setAt: setAt[index] }]));
}

/** Write `value` as the secret's new version and disable the one before, so a deploy reads this one. */
export function setValue(client: SecretManagerClient, container: SecretManagerSecret, value: string): Promise<{ revision: number }> {
  return client.putSecretValue({
    secretId: container.id,
    value,
    description: 'Updated by the infra CLI (Env vars & secrets)',
    disablePrevious: true,
  });
}

/**
 * A fresh random value for `secret` and for every value derived from it: the Yjs relay's public key refuses every token a new private key
 * signs. Returns the env vars written, none when no container exists yet.
 */
export async function rotateSecret(client: SecretManagerClient, secret: RuntimeSecretDefinition): Promise<string[]> {
  const rotated = [secret, ...runtimeSecrets.filter((candidate) => candidate.derivedFrom?.secretId === secret.id)];
  const written = new Set(await ensureSecrets({ client, secrets: rotated, rotate: true, log: () => {} }));
  return rotated.filter((definition) => written.has(definition.secretName)).map((definition) => definition.envVar);
}

/** A key of an imported `.env` file: the value it sets, or why it is skipped. */
export interface EnvImportLine {
  key: string;
  note: string;
  write?: { definition: RuntimeSecretDefinition; value: string };
}

/**
 * Each key of an imported `.env` file once, in file order with its last value, matched to the runtime secret whose env var it names. A key
 * no secret reads, one infra makes, and a value a set refuses are skipped. A value is trimmed, as a set trims it.
 */
export function planEnvImport(
  entries: ReadonlyArray<{ key: string; value: string }>,
  definitions: readonly RuntimeSecretDefinition[],
): EnvImportLine[] {
  const byEnvVar = new Map(definitions.map((definition) => [definition.envVar, definition]));
  return [...new Map(entries.map(({ key, value }) => [key, value.trim()]))].map(([key, value]): EnvImportLine => {
    const definition = byEnvVar.get(key);
    if (!definition) return { key, note: 'no such env var' };
    if (definition.valueSource !== 'operator') return { key, note: 'made by infra' };
    const verdict = isEnvFileDeliverable(value);
    if (!verdict.ok) return { key, note: verdict.reason === 'empty' ? 'empty' : 'not one line' };
    return { key, note: `set (${value.length} chars)`, write: { definition, value } };
  });
}

/** One line per key with the names aligned, the skipped keys dimmed. */
export function formatEnvImport(lines: readonly EnvImportLine[]): string[] {
  const width = Math.max(0, ...lines.map((line) => line.key.length));
  return lines.map((line) => {
    const text = `  ${line.key.padEnd(width)}  ${line.note}`;
    return line.write ? text : pc.dim(text);
  });
}

if (isMain(import.meta.url)) {
  process.stderr.write('Run this task through the infra CLI (Env vars & secrets) so prompts and stack context stay aligned.\n');
  process.exit(1);
}
