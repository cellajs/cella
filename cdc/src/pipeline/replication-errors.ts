/**
 * Detect the "publication does not exist" decode error Postgres raises when a
 * replication slot was created before its publication. Such a slot decodes a WAL
 * window in which the publication is absent, so every stream fails even though
 * the publication now exists. The subscribe loop uses this to self-heal by
 * repositioning the slot past the publication.
 *
 * Kept free of DB/env imports so the rule is unit-testable in isolation.
 */
export function isStalePublicationError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error ?? '');
  return /publication .* does not exist/i.test(message);
}
