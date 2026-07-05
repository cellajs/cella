/**
 * Message of a caught value without assuming it is an `Error` — a thrown
 * string/object would make `(err as Error).message` yield `undefined` in
 * operator-facing output.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
