/**
 * Offline sync utilities.
 *
 * Provides transaction metadata and conflict detection for synced entities:
 * - Transaction metadata creation with nanoid IDs
 * - Version-based conflict detection
 * - Mutation squashing and coalescing
 */

export { detectChangedFields } from './detect-changed-fields';
export { coalescePendingCreate, hasPendingDelete, squashPendingMutation } from './squash-utils';
export { createStxForCreate, createStxForDelete, createStxForUpdate, type StxMetadata, sourceId } from './stx-utils';
