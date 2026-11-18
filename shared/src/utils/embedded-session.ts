/** The header an embedded page sends with every request that uses its embedded session; its value is `1`. */
export const embeddedSessionHeader = 'X-Embedded-Session';

/** The same marker as a query parameter, for a transport that sets no header of its own: the event stream. */
export const embeddedSessionParam = 'embeddedSession';
