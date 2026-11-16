import { hashKey, type MutationFunctionContext } from '@tanstack/react-query';
import { batchUpdateMax } from 'shared/sync-pace';
import { isRecord } from 'shared/utils/as-record';
import { ApiError, gatewayStatuses } from '~/lib/api';
import { queuedUpdateOf, type UpdateVariables } from '~/query/offline/mutation-variables';
import { isNetworkError } from '~/query/offline/network-retry';
import type { QueryOrgContext } from '~/query/types';

type Row = Record<string, unknown>;

/** One update of a batch as its request carries it, read from the queued variables. */
export type QueuedUpdateItem = { id: string; ops: Row; stx: Row };

/** The answer a batch gave for an update that has not run yet, keyed on that update's variables. */
const handed = new WeakMap<object, { row: unknown } | { error: unknown }>();

/** Updates of a batch that failed for a reason no row names: each is sent on its own. */
const sendAlone = new WeakSet<object>();

interface UpdateSenders<TOps, TRow> {
  single: (variables: UpdateVariables<TOps>) => Promise<TRow>;
  many: (run: QueryOrgContext & { items: QueuedUpdateItem[] }) => Promise<{ results: TRow[]; rejectedIds: string[] }>;
  /** Whether ops may go in a batch, which takes no block field. */
  batchable: (ops: Row) => boolean;
}

/**
 * The updates of one key queued in the scope of `variables`, from `variables` on: of one organization, each of
 * another row, with batchable ops. The first pending mutation of the scope that does not fit ends the run: a run never
 * passes a queued create or delete.
 */
function collectRun<TOps>(variables: UpdateVariables<TOps>, { client, mutationKey }: MutationFunctionContext, batchable: (ops: Row) => boolean) {
  const run: { variables: object; item: QueuedUpdateItem }[] = [];
  const mutations = client.getMutationCache().getAll();
  const start = mutations.findIndex((mutation) => mutation.state.variables === variables);
  const scope = mutations[start]?.options.scope?.id;
  if (scope === undefined || !mutationKey) return run;

  const key = hashKey(mutationKey);
  const ids = new Set<string>();
  for (const mutation of mutations.slice(start)) {
    if (mutation.options.scope?.id !== scope || mutation.state.status !== 'pending') continue;
    const queued = mutation.state.variables;
    const update = queuedUpdateOf(queued);
    const sameKey = mutation.options.mutationKey !== undefined && hashKey(mutation.options.mutationKey) === key;
    if (!sameKey || !isRecord(queued) || !update || sendAlone.has(queued) || ids.has(update.id) || run.length === batchUpdateMax) break;
    if (update.tenantId !== variables.tenantId || update.organizationId !== variables.organizationId || !batchable(update.ops)) break;
    ids.add(update.id);
    run.push({ variables: queued, item: { id: update.id, ops: update.ops, stx: update.stx } });
  }
  return run;
}

const refusal = () => new ApiError({ status: 403, type: 'forbidden' });

/**
 * A product update's `mutationFn` body: sends the update with those queued behind it in its scope as one batch, and
 * answers each of those from that batch when its turn comes. Each update settles through its own callbacks with its
 * own row; one the server refused gets a 403.
 */
export async function sendQueuedUpdates<TOps, TRow extends { id: string }>(
  variables: UpdateVariables<TOps>,
  context: MutationFunctionContext,
  { single, many, batchable }: UpdateSenders<TOps, TRow>,
): Promise<TRow> {
  const answer = handed.get(variables);
  if (answer) {
    handed.delete(variables);
    if ('error' in answer) throw answer.error;
    // Cast: the batch that answered it was sent under this update's key, whose module answers its own rows.
    return answer.row as TRow;
  }

  const run = sendAlone.has(variables) ? [] : collectRun(variables, context, batchable);
  if (run.length < 2) return single(variables);

  const { tenantId, organizationId } = variables;
  const others = run.slice(1);
  let answered: { results: TRow[]; rejectedIds: string[] };
  try {
    answered = await many({ tenantId, organizationId, items: run.map(({ item }) => item) });
  } catch (error) {
    // No answer from the API: this update retries as its options say and collects its run again.
    if (isNetworkError(error) || (error instanceof ApiError && gatewayStatuses.has(error.status))) throw error;
    // The server refused every row.
    if (error instanceof ApiError && error.status === 403) {
      for (const other of others) handed.set(other.variables, { error });
      throw error;
    }
    // One invalid row must not roll back the others' edits.
    for (const other of others) sendAlone.add(other.variables);
    return single(variables);
  }

  const rows = new Map(answered.results.map((row) => [row.id, row]));
  const rejected = new Set(answered.rejectedIds);
  for (const { variables: queued, item } of others) {
    const row = rows.get(item.id);
    if (row) handed.set(queued, { row });
    else if (rejected.has(item.id)) handed.set(queued, { error: refusal() });
  }

  const row = rows.get(variables.id);
  if (row) return row;
  if (rejected.has(variables.id)) throw refusal();
  return single(variables);
}
