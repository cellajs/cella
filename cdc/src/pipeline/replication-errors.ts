/**
 * The "publication does not exist" decode error Postgres raises for a slot created before its
 * publication: the slot decodes a WAL window without the publication, so every stream fails even once
 * the publication exists. The subscribe loop repositions such a slot past the publication.
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
