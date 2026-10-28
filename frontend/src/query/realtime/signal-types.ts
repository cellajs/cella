/** The signal types this client handles, as keys; an app adds its own with `declare module '~/query/realtime/signal-types'`. */
export interface StreamSignalTypes {
  'membership.changed': true;
  'notification.created': true;
  'notification.read': true;
}

export type StreamSignalType = keyof StreamSignalTypes;
