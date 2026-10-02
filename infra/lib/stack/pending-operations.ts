import { isRecord } from '../utils/guards';
import { readObjectText, type S3Like } from './control-store';

/** Pulumi's project name (`name` in infra/Pulumi.yaml), the middle segment of `organization/<project>/<stack>`. */
const PULUMI_PROJECT = 'infra';

/**
 * S3 key of a stack's checkpoint in the state bucket. The S3 backend stores project-scoped stacks at `.pulumi/stacks/<project>/<stack>.json`
 * (`.json.gz` only under PULUMI_DIY_BACKEND_GZIP, which no run here sets). Accepts `organization/<project>/<stack>` or a bare stack name.
 */
export function checkpointKey(stack: string): string {
  const parts = stack.split('/');
  const project = parts.length === 3 ? parts[1] : PULUMI_PROJECT;
  return `.pulumi/stacks/${project}/${parts.at(-1)}.json`;
}

/** One operation Pulumi recorded as started and never saw finish, because the run was interrupted. */
export interface PendingOperation {
  urn: string;
  /** Resource type token, e.g. `scaleway:iam/policy:Policy`. */
  type: string;
  /** Pulumi's operation type: `creating`, `updating`, `deleting`, `reading` or `importing`. */
  kind: string;
  /** True when the state also records a resource under this URN: a later run created it, so a `creating` entry is stale. */
  inState: boolean;
}

/** The deployment inside a checkpoint file (`checkpoint.latest`) or a `pulumi stack export` (`deployment`); undefined for any other shape. */
function deploymentOf(doc: unknown): Record<string, unknown> | undefined {
  if (!isRecord(doc)) return undefined;
  if (isRecord(doc.deployment)) return doc.deployment;
  if (isRecord(doc.checkpoint) && isRecord(doc.checkpoint.latest)) return doc.checkpoint.latest;
  return undefined;
}

/** The pending operations a checkpoint or export records. Throws on a document that is neither, so a misread never passes for a clean state. */
export function pendingOperationsOf(doc: unknown): PendingOperation[] {
  const deployment = deploymentOf(doc);
  if (!deployment) {
    // A stack that has never completed an update has a checkpoint without `latest`.
    if (isRecord(doc) && isRecord(doc.checkpoint)) return [];
    throw new Error('pending-operations: not a Pulumi checkpoint or stack export');
  }
  const recorded = new Set(
    (Array.isArray(deployment.resources) ? deployment.resources : []).flatMap((resource) =>
      isRecord(resource) && typeof resource.urn === 'string' ? [resource.urn] : [],
    ),
  );
  const pending = Array.isArray(deployment.pending_operations) ? deployment.pending_operations : [];
  return pending.flatMap((operation) => {
    if (!isRecord(operation) || !isRecord(operation.resource) || typeof operation.resource.urn !== 'string') return [];
    const { urn, type } = operation.resource;
    return [
      { urn, type: typeof type === 'string' ? type : '', kind: typeof operation.type === 'string' ? operation.type : '', inState: recorded.has(urn) },
    ];
  });
}

/**
 * The checkpoint's pending operations, read straight from the state bucket: no `pulumi login` and no passphrase, as URNs and types are plaintext.
 * Undefined when no checkpoint object exists at `checkpointKey`: a stack never brought up, or a state stored under another layout.
 */
export async function readPendingOperations(s3: S3Like, bucket: string, stack: string): Promise<PendingOperation[] | undefined> {
  const { body } = await readObjectText(s3, bucket, checkpointKey(stack));
  return body ? pendingOperationsOf(JSON.parse(body)) : undefined;
}

/**
 * What the Unlock action may do about the pending operations. Only pending creates are cleared, and only when nothing else is pending:
 * `pulumi stack import` drops every pending operation, and an interrupted update or delete must be resolved by a refresh that reads the resource.
 */
export function planPendingClear(operations: PendingOperation[]): { creates: PendingOperation[]; others: PendingOperation[]; clearable: boolean } {
  const creates = operations.filter((operation) => operation.kind === 'creating');
  const others = operations.filter((operation) => operation.kind !== 'creating');
  return { creates, others, clearable: creates.length > 0 && others.length === 0 };
}

/** A `pulumi stack export` document without its pending creates; every other field is kept as exported. */
export function withoutPendingCreates(exported: unknown): unknown {
  if (!isRecord(exported) || !isRecord(exported.deployment)) throw new Error('pending-operations: not a pulumi stack export');
  const pending = Array.isArray(exported.deployment.pending_operations) ? exported.deployment.pending_operations : [];
  const kept = pending.filter((operation) => !(isRecord(operation) && operation.type === 'creating'));
  const { pending_operations: _, ...deployment } = exported.deployment;
  return { ...exported, deployment: kept.length > 0 ? { ...deployment, pending_operations: kept } : deployment };
}

/** The live steps of clearing pending creates, injected so the order and every guard are testable without Pulumi. */
export interface PendingClearEffects {
  /** `pulumi stack export` output. */
  exportState(): string;
  /** Write the export as the rollback copy before anything changes; returns its path. */
  saveBackup(exported: string): string;
  /** `pulumi stack import` of the given document. */
  importState(document: unknown): void;
  /** The pending operations the state records after the import. */
  readPending(): Promise<PendingOperation[]>;
}

const operationKey = (operation: PendingOperation): string => `${operation.kind} ${operation.urn}`;

/**
 * Drop the pending creates the operator reviewed: export the state, refuse when its pending operations differ from the reviewed ones or include
 * anything but creates, save the export as a rollback, import it without the creates, and confirm they are gone. The caller holds the stack lease.
 */
export async function clearPendingCreates(reviewed: PendingOperation[], fx: PendingClearEffects): Promise<{ backupPath: string }> {
  const exportedText = fx.exportState();
  const exported: unknown = JSON.parse(exportedText);
  const current = pendingOperationsOf(exported);
  const same = (a: PendingOperation[], b: PendingOperation[]) => a.map(operationKey).sort().join('\n') === b.map(operationKey).sort().join('\n');
  if (!same(current, reviewed)) throw new Error('the pending operations changed since they were listed: nothing cleared, run Unlock again');
  if (!planPendingClear(current).clearable) throw new Error('only pending creates are cleared, and only when no other operation is pending');
  const backupPath = fx.saveBackup(exportedText);
  fx.importState(withoutPendingCreates(exported));
  const left = (await fx.readPending()).filter((operation) => operation.kind === 'creating');
  if (left.length > 0) throw new Error(`the import left ${left.length} pending create(s) in the state; the export is saved at ${backupPath}`);
  return { backupPath };
}
