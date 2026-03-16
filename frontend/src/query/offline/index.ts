/**
 * Offline sync utilities.
 *
 * Provides transaction metadata and AWSet/HLC-based conflict resolution for synced entities:
 * - Transaction metadata creation with nanoid IDs and HLC timestamps
 * - AWSet delta operations for set-type fields
 * - Mutation squashing and coalescing
 */

export { applyArrayDelta, computeArrayDelta, isArrayDelta, mergeArrayDeltas } from './array-delta';
export { createFieldTimestamps, createHLC } from './hlc';
export { coalescePendingCreate, squashPendingMutation } from './squash-utils';
export { createStxForCreate, createStxForDelete, createStxForUpdate, sourceId } from './stx-utils';
export { syncEntityToCache } from './update-success-utils';
