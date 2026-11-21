/**
 * The header an embedded page sends with every request: its value is the embedded session's token, empty while the page
 * holds none. Its presence alone makes the API read the embedded session and no other.
 */
export const embeddedSessionHeader = 'X-Embedded-Session';

/** The same token as a query parameter, for a transport that sets no header of its own: the event stream. */
export const embeddedSessionParam = 'embeddedSession';

/** The key in the embedded page's address fragment that holds the one-use code a finished LTI launch hands the frame. */
export const embeddedHandoffKey = 'handoff';
