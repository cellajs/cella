import type { RuntimeSecretDefinition } from '../lib/runtime-secrets';
import type { createSecretManagerClient, SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { RUNTIME_FOLDER } from '../lib/scaleway/secret-paths';
import { crossMark, pc } from '../lib/utils/cli-output';
import { isEnvFileDeliverable } from '../lib/utils/env-file';
import { isMain } from '../lib/utils/is-main';

export type SecretManagerClient = ReturnType<typeof createSecretManagerClient>;

/** A secret of the runtime folder, with the date its newest version was written. */
export type RuntimeContainer = SecretManagerSecret & { setAt?: string };

/** What the table reads of a container. */
type ContainerState = Pick<RuntimeContainer, 'version_count' | 'setAt'>;

/** A row of the table: the operator values of one group, the services that read them, and what Secret Manager holds for them. */
export interface SecretRow {
  /** The group, or the env var of a value without one. */
  label: string;
  definitions: RuntimeSecretDefinition[];
  usedBy: string;
  state: string;
  kind: 'missing' | 'set' | 'partial' | 'empty';
}

const kindOrder: SecretRow['kind'][] = ['missing', 'set', 'partial', 'empty'];
const kindMarks: Record<SecretRow['kind'], string> = { missing: crossMark, set: pc.green('●'), partial: '◐', empty: pc.dim('○') };

/** `Nov 8` in the local time zone, or nothing without a date. */
export function shortDate(iso: string | undefined): string {
  const date = iso ? new Date(iso) : undefined;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
}

const holdsValue = (container: ContainerState | undefined): boolean => (container?.version_count ?? 0) > 0;

/**
 * The row of `definitions` under `label`: set once every value is, with the newest date; missing while a required value is not; else empty or
 * the count of the values set.
 */
export function secretRow(label: string, definitions: RuntimeSecretDefinition[], containers: ReadonlyMap<string, ContainerState>): SecretRow {
  const held = definitions.map((definition) => containers.get(definition.secretName)).filter(holdsValue);
  const row = { label, definitions, usedBy: [...new Set(definitions.flatMap((definition) => definition.services))].join(', ') };
  if (held.length === definitions.length) {
    const newest = held
      .map((container) => container?.setAt ?? '')
      .sort()
      .at(-1);
    return { ...row, kind: 'set', state: `set ${shortDate(newest)}`.trimEnd() };
  }
  if (definitions.some((definition) => definition.required && !holdsValue(containers.get(definition.secretName)))) {
    return { ...row, kind: 'missing', state: 'missing · required' };
  }
  if (held.length === 0) return { ...row, kind: 'empty', state: 'empty' };
  return { ...row, kind: 'partial', state: `${held.length} of ${definitions.length} set` };
}

/**
 * One row per group of operator values, a value without a group its own: rows that miss a required value first, then the set, the partly
 * set and the empty ones, in registry order within each. The values infra makes have no row. `containers` are the runtime folder's secrets
 * by name.
 */
export function secretsTable(definitions: readonly RuntimeSecretDefinition[], containers: ReadonlyMap<string, ContainerState>): SecretRow[] {
  const groups = new Map<string, RuntimeSecretDefinition[]>();
  for (const definition of definitions) {
    if (definition.valueSource !== 'operator') continue;
    const label = definition.group ?? definition.envVar;
    groups.set(label, [...(groups.get(label) ?? []), definition]);
  }
  const rows = [...groups].map(([label, members]) => secretRow(label, members, containers));
  return rows.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind));
}

/**
 * One line per row, a mark per state and the services dimmed, in columns aligned across the rows and `infra`: the last line, which lists the
 * values infra makes with `note` dimmed beside them.
 */
export function formatSecretsTable(rows: readonly SecretRow[], infra?: { label: string; note?: string }): string[] {
  const labelWidth = Math.max(0, ...[...rows, ...(infra ? [infra] : [])].map((row) => row.label.length));
  const usedByWidth = Math.max(0, ...rows.map((row) => row.usedBy.length));
  const lines = rows.map((row) => `${kindMarks[row.kind]} ${row.label.padEnd(labelWidth)}  ${pc.dim(row.usedBy.padEnd(usedByWidth))}  ${row.state}`);
  if (!infra) return lines;
  return [...lines, `${pc.dim('◇')} ${infra.note ? `${infra.label.padEnd(labelWidth)}  ${pc.dim(infra.note)}` : infra.label}`];
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

/** A key of an imported `.env` file: the value it sets, or why it is skipped. */
export interface EnvImportLine {
  key: string;
  note: string;
  write?: { definition: RuntimeSecretDefinition; value: string };
}

/**
 * Each key of an imported `.env` file once, in file order with its last value, matched to the runtime secret whose env var it names. A key
 * no secret reads, one infra makes, and a value a set refuses are skipped. A value is trimmed, as a set trims it. A value that replaces
 * one of `containers` says so, with the date the replaced one was set.
 */
export function planEnvImport(
  entries: ReadonlyArray<{ key: string; value: string }>,
  definitions: readonly RuntimeSecretDefinition[],
  containers: ReadonlyMap<string, ContainerState> = new Map(),
): EnvImportLine[] {
  const byEnvVar = new Map(definitions.map((definition) => [definition.envVar, definition]));
  return [...new Map(entries.map(({ key, value }) => [key, value.trim()]))].map(([key, value]): EnvImportLine => {
    const definition = byEnvVar.get(key);
    if (!definition) return { key, note: 'no such env var' };
    if (definition.valueSource !== 'operator') return { key, note: 'made by infra' };
    const verdict = isEnvFileDeliverable(value);
    if (!verdict.ok) return { key, note: verdict.reason === 'empty' ? 'empty' : 'not one line' };
    const held = containers.get(definition.secretName);
    const replaces = holdsValue(held) ? ` · replaces the value set ${shortDate(held?.setAt)}`.trimEnd() : '';
    return { key, note: `set (${value.length} chars)${replaces}`, write: { definition, value } };
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
