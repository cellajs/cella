/**
 * Offline sync utilities.
 *
 * Provides transaction metadata and conflict detection for synced entities:
 * - Transaction metadata creation with nanoid IDs
 * - Version-based conflict detection
 * - Mutation squashing and coalescing
 */

export { squashPendingMutation } from './squash-utils';
export { createStxForCreate, createStxForDelete, createStxForUpdate, sourceId } from './stx-utils';
export { syncEntityToCache } from './update-success-utils';
