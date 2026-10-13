import type { KeyPair } from '../lib/scaleway/operator-identity';

/**
 * What the operator typed in this run of the CLI, so a menu session asks for the Pulumi passphrase and the Owner API key once. It lives in
 * this process's memory only: nothing is written to a file, the environment or the keychain, and it ends when the CLI exits.
 */
const session: { passphrase?: string; ownerKey?: KeyPair } = {};

/** Keep a passphrase the stack verified. */
export function rememberPassphrase(passphrase: string): void {
  session.passphrase = passphrase;
}

/** The passphrase typed earlier in this run. The caller verifies it against the stack again: a rotation makes it stale. */
export function rememberedPassphrase(): string | undefined {
  return session.passphrase;
}

/** Keep an Owner API key that passed its validation. */
export function rememberOwnerKey(pair: KeyPair): void {
  session.ownerKey = { accessKey: pair.accessKey, secretKey: pair.secretKey };
}

/** The Owner API key typed earlier in this run. The caller validates it again: it may have been revoked since. */
export function rememberedOwnerKey(): KeyPair | undefined {
  return session.ownerKey;
}

/** Drop the Owner API key, so the next privileged action asks for one: a key that failed its validation must not be offered again. */
export function forgetOwnerKey(): void {
  session.ownerKey = undefined;
}

/** Drop everything the session holds. */
export function forgetSession(): void {
  session.passphrase = undefined;
  session.ownerKey = undefined;
}
