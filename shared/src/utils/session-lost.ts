const types = ['unauthorized', 'no_session', 'session_expired', 'session_revoked'] as const;

/**
 * A 401 type the session readers answer with when the session is gone: the client signs out on one. Any other 401
 * refuses a proof (a wrong authenticator code on the MFA toggle, a failed passkey) on a request that is still signed in.
 */
export type SessionLostType = (typeof types)[number];

/** {@link SessionLostType} as a set, for a type read off the wire. */
export const sessionLostTypes: ReadonlySet<string> = new Set(types);
