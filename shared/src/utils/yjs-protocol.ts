/**
 * Message types on the relay socket: y-websocket's sync and awareness, and the relay's own. `Generation` is the
 * document's generation, sent before every handshake answer.
 */
export const yjsMessageTypes = {
  Sync: 0,
  Awareness: 1,
  Generation: 4,
  /**
   * Empty body, to the sender alone, after each of its Step2 or Update frames the relay logged, found empty or dropped
   * as covered by a pending reply.
   */
  Saved: 5,
} as const;

/** y-protocols' sync subtypes: the handshake's two steps and a live update. */
export const yjsSyncSubtypes = { Step1: 0, Step2: 1, Update: 2 } as const;

/** WebSocket close codes sent by the Yjs relay; the 4000-4999 range is reserved for application use. */
export const yjsCloseCodes = {
  TokenInvalid: 4001,
  AccessDenied: 4003,
  BadRequest: 4400,
  EntityDeleted: 4410,
  TooManyConnections: 4429,
  InternalError: 4500,
  Unavailable: 4503,
} as const;

/** The fragment a collaborative editor binds in its document, and the one the server converts descriptions through. */
export const yjsFragmentName = 'document-store';
