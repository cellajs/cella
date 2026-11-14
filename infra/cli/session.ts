import type { KeyPair } from '../lib/scaleway/operator-identity';

/**
 * What the operator typed in this run of the CLI, and what the run found out, so a menu session asks for each secret once. It lives in this
 * process's memory only: nothing is written to a file, the environment or the keychain, and it ends when the CLI exits.
 */
const session: {
  ownerKey?: KeyPair;
  operatorKey?: KeyPair;
  /** The operator key was minted by this run's setup, so IAM may refuse it until its policy holds. */
  operatorKeyMinted?: boolean;
} = {};

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

/** Keep the operator key once Scaleway took it, or once the setup minted it: it serves every action of the session. */
export function rememberOperatorKey(pair: KeyPair, opts: { minted?: boolean } = {}): void {
  session.operatorKey = { accessKey: pair.accessKey, secretKey: pair.secretKey };
  session.operatorKeyMinted = opts.minted === true;
}

/** True when the remembered operator key was minted in this run and Scaleway has not taken it yet. */
export function operatorKeyMintedThisRun(): boolean {
  return session.operatorKeyMinted === true;
}

/** The operator key typed earlier in this run. */
export function rememberedOperatorKey(): KeyPair | undefined {
  return session.operatorKey;
}

/** Drop the operator key, so the next action asks again: one that Scaleway refused must not be offered again. */
export function forgetOperatorKey(): void {
  session.operatorKey = undefined;
  session.operatorKeyMinted = undefined;
}

/** Drop everything the session holds. */
export function forgetSession(): void {
  session.ownerKey = undefined;
  session.operatorKey = undefined;
  session.operatorKeyMinted = undefined;
}
