/**
 * Field-level conflict detection utilities for sync engine.
 * Uses fieldVersions to track per-field versions and detect conflicts.
 */

import type { EntityType } from 'shared';
import type { TxBase } from '#/db/utils/tx-columns';
import { AppError } from '#/lib/error';

interface FieldConflict {
  field: string;
  clientVersion: number;
  serverVersion: number;
}

interface ConflictCheckResult {
  /** Fields that have conflicts (server version > client baseVersion) */
  conflicts: FieldConflict[];
  /** Fields that are safe to update */
  safeFields: string[];
}

/**
 * Check for field-level conflicts between client and server versions.
 * Returns conflicts for fields where server version is newer than client's baseVersion.
 *
 * @param changedFields - Array of field names being updated
 * @param entityTx - Current entity's tx metadata (from DB)
 * @param baseVersion - Client's version when entity was last read
 */
export function checkFieldConflicts(
  changedFields: string[],
  entityTx: TxBase | null | undefined,
  baseVersion: number,
): ConflictCheckResult {
  const conflicts: ConflictCheckResult['conflicts'] = [];
  const safeFields: string[] = [];

  for (const field of changedFields) {
    const serverVersion = entityTx?.fieldVersions?.[field] ?? 0;
    if (serverVersion > baseVersion) {
      conflicts.push({ field, clientVersion: baseVersion, serverVersion });
    } else {
      safeFields.push(field);
    }
  }

  return { conflicts, safeFields };
}

/**
 * Throw a field conflict error if any conflicts exist.
 *
 * @param entityType - The entity type for error reporting
 * @param conflicts - Array of field conflicts from checkFieldConflicts
 * @throws AppError with 409 status if conflicts exist
 */
export function throwIfConflicts(entityType: EntityType, conflicts: ConflictCheckResult['conflicts']): void {
  if (conflicts.length === 0) return;

  // Report the first conflict with all conflicting field names
  const first = conflicts[0];
  throw new AppError(409, 'field_conflict', 'warn', {
    entityType,
    meta: {
      field: first.field,
      clientVersion: first.clientVersion,
      serverVersion: first.serverVersion,
      // Include all conflicting field names for multi-field case
      conflictingFields: conflicts.map((c) => c.field),
    },
  });
}

/**
 * Build updated fieldVersions map for changed fields.
 * Sets each changed field's version to the new entity version.
 *
 * @param existingFieldVersions - Current fieldVersions from entity tx
 * @param changedFields - Array of field names being updated
 * @param newVersion - New entity version
 */
export function buildFieldVersions(
  existingFieldVersions: Record<string, number> | undefined,
  changedFields: string[],
  newVersion: number,
): Record<string, number> {
  const updated: Record<string, number> = { ...existingFieldVersions };
  for (const field of changedFields) {
    updated[field] = newVersion;
  }
  return updated;
}

/**
 * Get tracked fields that are present in the update payload.
 *
 * @param payload - The update payload object
 * @param trackedFields - Array of field names to track for conflicts
 */
export function getChangedTrackedFields<T extends Record<string, unknown>>(
  payload: T,
  trackedFields: readonly string[],
): string[] {
  return trackedFields.filter((field) => field in payload);
}
