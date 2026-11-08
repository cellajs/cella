/**
 * The stream signal types, as keys: the API declares and sends only these, and the client keys its handlers by them. An
 * app adds its own with `declare module 'shared/stream-signal-types'`. The wire schema, the client's handler registry and
 * the stored signal versions stay string-keyed, since a tab older than the server must take a type it does not know.
 */
export interface StreamSignalTypes {
  'channel.archived': true;
  'channel.deleted': true;
  'membership.changed': true;
  'notification.created': true;
  'notification.read': true;
}

export type StreamSignalType = keyof StreamSignalTypes;
