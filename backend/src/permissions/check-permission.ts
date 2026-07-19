import type {
  BatchPermissionResult as SharedBatchPermissionResult,
  PermissionResult as SharedPermissionResult,
} from 'shared';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

// Re-export the shared engine entry point so backend and yjs call the identical function.
export { checkAccess, checkAccessBatch, checkAccessFanout } from 'shared';

/** Permission result containing membership and whether the action is allowed. */
export type PermissionResult = SharedPermissionResult<MembershipBaseModel>;

/** Batch permission result containing results for multiple entities. */
export type BatchPermissionResult = SharedBatchPermissionResult<MembershipBaseModel>;
