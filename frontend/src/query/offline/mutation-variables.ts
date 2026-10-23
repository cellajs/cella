import type { DehydratedState } from '@tanstack/react-query';
import type { StxBase } from 'sdk';
import { isRecord } from 'shared/utils/as-record';
import { quarantineFailedSync } from '~/query/offline/failed-sync';
import type { QueryOrgContext } from '~/query/types';

/** A create of one or more rows, each under the id the client gave it. With the update and delete shapes, it lets the offline helpers read any product's queue. */
export type CreateVariables<TRow> = QueryOrgContext & { data: TRow[]; stx?: StxBase };

/** An update of one row: `ops` holds the changed fields, `stx` their stamps. */
export type UpdateVariables<TOps> = QueryOrgContext & { id: string; ops: TOps; stx?: StxBase };

/** A delete of rows, each as the cache held it, so a refusal can put it back. */
export type DeleteVariables<TRow> = QueryOrgContext & { rows: TRow[]; stx?: StxBase };

type Row = Record<string, unknown>;

const rowsIn = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRecord) : isRecord(value) ? [value] : []);

/** The rows of a queued create as the live objects of its variables, which an edit folds into; one row under `data` or at the top level reads as a list of one. */
export function createRowsOf(variables: unknown): Row[] {
  if (!isRecord(variables)) return [];
  return typeof variables.id === 'string' ? [variables] : rowsIn(variables.data);
}

/** What a queued update holds, or null for variables that are no update of one row. */
export function queuedUpdateOf(variables: unknown): { id: string; ops: Row; fieldTimestamps: Record<string, string> } | null {
  if (!isRecord(variables) || typeof variables.id !== 'string') return null;
  const stx = isRecord(variables.stx) ? variables.stx : {};
  // Cast: the stamps are the strings the stx helpers wrote; a queue restored from disk is this app's own.
  const fieldTimestamps = (isRecord(stx.fieldTimestamps) ? stx.fieldTimestamps : {}) as Record<string, string>;
  return { id: variables.id, ops: isRecord(variables.ops) ? variables.ops : {}, fieldTimestamps };
}

/** The ids of the rows a queued mutation creates, changes or deletes. */
export function entityIdsOf(variables: unknown): string[] {
  if (!isRecord(variables)) return [];
  return [variables, ...rowsIn(variables.data), ...rowsIn(variables.rows)].flatMap((row) => (typeof row.id === 'string' ? [row.id] : []));
}

/** Rewrites variables a bundle of an older version queued into the shape the mutation reads now; null when it cannot. */
type VariablesUpgrade = (variables: unknown, fromVersion: number) => unknown;

const versions = new Map<string, { version: number; upgrade: VariablesUpgrade }>();
const versionKey = (mutationKey: unknown) => JSON.stringify(mutationKey);

/**
 * Declares a new shape of a mutation's variables and how one queued offline in an older shape moves to it: the persister stamps each
 * queued mutation with its version and passes an older one through `upgrade` on restore. Register next to the mutation defaults, in a
 * module that loads with the entry: like the defaults, a version registered after a restore misses the mutations it brought back.
 * @param mutationKey - The key the mutation defaults are set under.
 * @param version - The current version; a key without a registration is at 1.
 */
export function registerVariablesVersion(mutationKey: readonly unknown[], version: number, upgrade: VariablesUpgrade): void {
  versions.set(versionKey(mutationKey), { version, upgrade });
}

/** The version of the variables a mutation of this key is issued with now. */
export function variablesVersionOf(mutationKey: unknown): number {
  return versions.get(versionKey(mutationKey))?.version ?? 1;
}

/** A queued mutation as the persister stores it: `meta.variablesVersion` is the version of its variables. */
type StoredMutation = DehydratedState['mutations'][number];

const stamped = (mutation: StoredMutation, variablesVersion: number): StoredMutation => ({
  ...mutation,
  meta: { ...mutation.meta, variablesVersion },
});

/** Stamps a queued mutation this bundle issued with its key's current version for the persister; one from a restore keeps the stamp of the shape it holds. */
export function withVariablesVersion(mutation: StoredMutation): StoredMutation {
  return mutation.meta?.variablesVersion === undefined ? stamped(mutation, variablesVersionOf(mutation.mutationKey)) : mutation;
}

/**
 * The stx mutation id of queued variables in any shape this app has used: a batch, the top level, or rows under `data`.
 * @public
 */
export function mutationIdOf(variables: unknown): string | undefined {
  const holders = Array.isArray(variables) ? variables : isRecord(variables) ? [variables, ...rowsIn(variables.data)] : [];
  for (const holder of holders) {
    if (isRecord(holder) && isRecord(holder.stx) && typeof holder.stx.mutationId === 'string') return holder.stx.mutationId;
  }
  return undefined;
}

/**
 * Brings one mutation of a restored queue to the shape this bundle reads, before it is hydrated. One the upgrade does not know or throws
 * on, and one a newer bundle stored (a rollback), goes to the failed-sync quarantine: replayed as it is, its `mutationFn` would misread it.
 * @returns The mutation to hydrate, carrying the stamp of its shape, or null when it was quarantined.
 */
export function upgradePersistedMutation(mutation: StoredMutation): StoredMutation | null {
  const stored = mutation.meta?.variablesVersion ?? 1;
  const registered = versions.get(versionKey(mutation.mutationKey));
  if (!registered || stored === registered.version) return stamped(mutation, stored);

  const { variables } = mutation.state;
  let upgraded: unknown = null;
  if (stored < registered.version) {
    try {
      upgraded = registered.upgrade(variables, stored) ?? null;
    } catch {
      upgraded = null;
    }
  }
  if (upgraded !== null) return { ...stamped(mutation, registered.version), state: { ...mutation.state, variables: upgraded } };

  void quarantineFailedSync({
    mutationId: mutationIdOf(variables) ?? `queued:${JSON.stringify(mutation.mutationKey)}:${mutation.state.submittedAt}`,
    mutationKey: mutation.mutationKey,
    // Never sent: no server answered it.
    status: 0,
    variables,
    error: { reason: 'variables_version', storedVersion: stored, currentVersion: registered.version },
  });
  console.warn(
    `[MutationVariables] Quarantined a queued ${String(mutation.mutationKey)} stored at variables version ${stored}: version ${registered.version} cannot read it`,
  );
  return null;
}
