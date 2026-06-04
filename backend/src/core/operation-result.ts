import type { EntityType } from 'shared';
import { AppError, type ErrorKey } from '#/core/error';
import type { OperationErrorCode } from '#/schemas';

export type OperationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; status: OperationErrorCode };

/** Assert OperationResult is successful, narrowing the type. Throws AppError on failure. */
export function assertSuccess<T>(
  result: OperationResult<T>,
  entityType: EntityType,
): asserts result is { success: true; data: T } {
  if (!result.success) {
    throw new AppError(result.status, result.error as ErrorKey, 'warn', { entityType });
  }
}
