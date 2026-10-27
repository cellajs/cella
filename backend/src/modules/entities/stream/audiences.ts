/** Who a signal goes to. The server decides, as it does for a change: a client subscribes to no signal. */
export type Audience = { kind: 'user'; userId: string };

/** A signal a module sends on the app stream, and the audiences it may go to; `sendSignal` refuses any other. */
export interface StreamSignalDeclaration {
  /** `<module>.<past tense>`, such as `membership.changed`. */
  type: string;
  audiences: Audience['kind'][];
}

/** Every open stream of one user, on all their devices. */
export const toUser = (userId: string): Audience => ({ kind: 'user', userId });
