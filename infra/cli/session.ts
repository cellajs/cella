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
  /** The run shows the menu, so an action that fails or is stopped returns to it. */
  menu?: boolean;
  /** The answers the running action gave, by prompt id: a step back or a retry offers each as its default. */
  answers: Map<string, string | boolean>;
} = { answers: new Map() };

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

/** Mark this run as a menu session: a failed or stopped action returns to the menu with the keys kept. */
export function startMenuSession(): void {
  session.menu = true;
}

/** True once the run shows the menu; false for `pnpm infra <action>`, `--once` and a first setup. */
export function inMenuSession(): boolean {
  return session.menu === true;
}

/** Keep the answer to the prompt `id` until the running action ends. */
export function rememberAnswer(id: string, value: string | boolean): void {
  session.answers.set(id, value);
}

/** The answer given to the prompt `id` earlier in the running action, for its default. */
export function recalledAnswer(id: string): string | boolean | undefined {
  return session.answers.get(id);
}

/** Drop the running action's answers once it ends, so the next action asks with the prompts' own defaults. */
export function forgetAnswers(): void {
  session.answers.clear();
}

/** Drop everything the session holds. */
export function forgetSession(): void {
  session.ownerKey = undefined;
  session.operatorKey = undefined;
  session.operatorKeyMinted = undefined;
  session.menu = undefined;
  session.answers.clear();
}
