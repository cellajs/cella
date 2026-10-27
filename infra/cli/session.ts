import type { KeyPair } from '../lib/scaleway/operator-identity';

/** What the CLI learned about the operator application through the observer key. */
export interface OperatorLock {
  /** `absent`: the stack has no operator application yet. `unknown`: this machine holds no key that can tell. */
  state: 'present' | 'absent' | 'unknown';
  /** The addresses the operator key works from, as its policy names them; empty when they could not be read. */
  cidrs: string[];
  /** True when a rule of the operator policy carries no address condition: the key then works from every address. */
  open: boolean;
}

/** How a run reads and writes the passphrase in Secret Manager. */
export interface PassphraseCustody {
  /** The stored passphrase, asking for the operator key when the session is still locked; undefined when there is none to read. */
  read(): Promise<string | undefined>;
  /** Store a passphrase the stack verified; false when the session holds no key that may write it. */
  store(passphrase: string): Promise<boolean>;
}

/**
 * What the operator typed in this run of the CLI, and what the run found out, so a menu session asks for each secret once. It lives in this
 * process's memory only: nothing is written to a file, the environment or the keychain, and it ends when the CLI exits.
 */
const session: {
  passphrase?: string;
  ownerKey?: KeyPair;
  operatorKey?: KeyPair;
  operatorLock?: OperatorLock;
  passphraseCustody?: PassphraseCustody;
} = {};

/** Keep a passphrase the stack verified. */
export function rememberPassphrase(passphrase: string): void {
  session.passphrase = passphrase;
}

/** The passphrase typed or fetched earlier in this run. The caller verifies it against the stack again: a rotation makes it stale. */
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

/** Keep the operator key once Scaleway took it: it serves every action of the session. */
export function rememberOperatorKey(pair: KeyPair): void {
  session.operatorKey = { accessKey: pair.accessKey, secretKey: pair.secretKey };
}

/** The operator key typed earlier in this run. */
export function rememberedOperatorKey(): KeyPair | undefined {
  return session.operatorKey;
}

/** Drop the operator key, so the next action asks again: one that Scaleway refused must not be offered again. */
export function forgetOperatorKey(): void {
  session.operatorKey = undefined;
}

/** Keep what the observer key showed about the operator application. */
export function rememberOperatorLock(lock: OperatorLock): void {
  session.operatorLock = lock;
}

/** What this run already knows about the operator application. */
export function rememberedOperatorLock(): OperatorLock | undefined {
  return session.operatorLock;
}

/** Drop it after an action that sets up the operator application or changes its addresses. */
export function forgetOperatorLock(): void {
  session.operatorLock = undefined;
}

/** Register how this run reads and writes the passphrase in Secret Manager; the CLI sets it once the stack context is loaded. */
export function setPassphraseCustody(custody: PassphraseCustody | undefined): void {
  session.passphraseCustody = custody;
}

/** The passphrase custody of this run, when the CLI registered one. */
export function passphraseCustody(): PassphraseCustody | undefined {
  return session.passphraseCustody;
}

/** Drop everything the session holds. */
export function forgetSession(): void {
  session.passphrase = undefined;
  session.ownerKey = undefined;
  session.operatorKey = undefined;
  session.operatorLock = undefined;
  session.passphraseCustody = undefined;
}
