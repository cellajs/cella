import type { EntityActionType, SubjectForPermission } from 'shared';

/** Who a signal goes to. The server decides, as it does for a change: a client subscribes to no signal. */
export type Audience = { kind: 'user'; userId: string } | { kind: 'readers'; subject: SubjectForPermission; action: EntityActionType };

/** A signal a module sends on the app stream, and the audiences it may go to; `sendSignal` refuses any other. */
export interface StreamSignalDeclaration {
  /** `<module>.<past tense>`, such as `membership.changed`. */
  type: string;
  audiences: Audience['kind'][];
}

/** Every open stream of one user, on all their devices. */
export const toUser = (userId: string): Audience => ({ kind: 'user', userId });

/** The open streams of the subject's organization whose user may take `action` on it, decided as a change is. */
export const toReaders = (subject: SubjectForPermission, action: EntityActionType = 'read'): Audience => ({ kind: 'readers', subject, action });
