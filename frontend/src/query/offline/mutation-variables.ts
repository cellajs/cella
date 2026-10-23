import type { DehydratedState } from '@tanstack/react-query';
import type { StxBase } from 'sdk';
import { isRecord } from 'shared/utils/as-record';
import type { QueryOrgContext } from '~/query/types';
import { quarantineFailedSync } from './failed-sync';

// The variables of a product's three mutations. One shape per operation, so the offline helpers read a queued mutation
// of any product without knowing it: the rows a create holds, the ids a mutation touches.

/** A create of one or more rows, each under the id the client gave it. */
export type CreateVariables<TRow> = QueryOrgContext & { data: TRow[]; stx?: StxBase };

/** An update of one row: `ops` holds the changed fields, `stx` their stamps. */
export type UpdateVariables<TOps> = QueryOrgContext & { id: string; ops: TOps; stx?: StxBase };

/** A delete of rows, each as the cache held it, so a refusal can put it back. */
export type DeleteVariables<TRow> = QueryOrgContext & { rows: TRow[]; stx?: StxBase };

type Row = Record<string, unknown>;

const rowsIn = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRecord) : isRecord(value) ? [value] : []);

/**
 * The rows of a queued create, as the live objects of its variables: an edit folds into one of them. A create that
 * carries its one row under `data`, or at the top level with its `id`, reads as a list of one.
 */
export const createRowsOf = (variables: unknown): Row[] => {
  if (!isRecord(variables)) return [];
  return typeof variables.id === 'string' ? [variables] : rowsIn(variables.data);
};

/** What a queued update holds, or null for variables that are no update of one row. */
export const queuedUpdateOf = (variables: unknown): { id: string; ops: Row; fieldTimestamps: Record<string, string> } | null => {
  if (!isRecord(variables) || typeof variables.id !== 'string') return null;
  const stx = isRecord(variables.stx) ? variables.stx : {};
  // Cast: the stamps are the strings the stx helpers wrote; a queue restored from disk is this app's own.
  const fieldTimestamps = (isRecord(stx.fieldTimestamps) ? stx.fieldTimestamps : {}) as Record<string, string>;
  return { id: variables.id, ops: isRecord(variables.ops) ? variables.ops : {}, fieldTimestamps };
};

/** The ids of the rows a queued mutation creates, changes or deletes. */
export const entityIdsOf = (variables: unknown): string[] => {
  if (!isRecord(variables)) return [];
  return [variables, ...rowsIn(variables.data), ...rowsIn(variables.rows)].flatMap((row) => (typeof row.id === 'string' ? [row.id] : []));
};

/** Rewrites variables a bundle of an older version queued into the shape the mutation reads now; null when it cannot. */
type VariablesUpgrade = (variables: unknown, fromVersion: number) => unknown;

const versions = new Map<string, { version: number; upgrade: VariablesUpgrade }>();
const versionKey = (mutationKey: unknown) => JSON.stringify(mutationKey);

/**
 * Declares that the shape of a mutation's variables changed, and how a mutation queued in an older shape moves to the
 * current one. A create, update or delete queued offline outlives the reload that brings a new bundle: the persister
 * stores each queued mutation with the version of its variables and passes an older one through `upgrade` when it
 * restores the queue. Register next to the mutation defaults, in a module that loads with the entry: like the defaults,
 * a version registered after the queue is restored does not reach the mutations of that restore.
 * @param mutationKey - The key the mutation defaults are set under.
 * @param version - The current version; a key without a registration is at 1.
 * @param upgrade - Returns the variables in the current shape, or null for a shape it does not know.
 */
export function registerVariablesVersion(mutationKey: readonly unknown[], version: number, upgrade: VariablesUpgrade): void {
  versions.set(versionKey(mutationKey), { version, upgrade });
}

/** The version of the variables a mutation of this key is issued with now. */
export const variablesVersionOf = (mutationKey: unknown): number => versions.get(versionKey(mutationKey))?.version ?? 1;

/** A queued mutation as the persister stores it: `meta.variablesVersion` is the version of its variables. */
type StoredMutation = DehydratedState['mutations'][number];

const stamped = (mutation: StoredMutation, variablesVersion: number): StoredMutation => ({
  ...mutation,
  meta: { ...mutation.meta, variablesVersion },
});

/**
 * Stamps a queued mutation this bundle issued with the current version of its variables, for the persister's write.
 * A mutation that came from a restore keeps the stamp it left with: its variables are in that shape, whatever was
 * registered since.
 */
export const withVariablesVersion = (mutation: StoredMutation): StoredMutation =>
  mutation.meta?.variablesVersion === undefined ? stamped(mutation, variablesVersionOf(mutation.mutationKey)) : mutation;

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
 * Brings one mutation of a restored queue to the shape this bundle reads, before it is hydrated. A record without a
 * stamp was stored at version 1. One behind the version registered for its key goes through that key's upgrade. One
 * the upgrade does not know or throws on, and one a newer bundle stored (a rollback), moves to the failed-sync
 * quarantine: replayed as it is, its `mutationFn` would read a shape it does not know. A key without a registration
 * hands its mutation back as stored.
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
