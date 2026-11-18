/** Values the framed LTI tool put, by the origin that put them and then by key; it lives as long as the frame. */
export type PlatformStorage = Map<string, Map<string, string>>;

/** What a storage message is checked against: the frame the host rendered, and the values its pages put. */
interface StorageMessageScope {
  frame: MessageEventSource | null;
  storage: PlatformStorage;
}

/** A reply to post to the frame, at the origin that asked. */
export interface StorageReply {
  message: Record<string, unknown>;
  targetOrigin: string;
}

const supportedSubjects = ['lti.capabilities', 'lti.put_data', 'lti.get_data'];

/**
 * What one origin may keep, above the draft's minimum of 500 keys and 4096 bytes per LTI tool, measured as the sum of
 * each key's and value's length; a length here counts UTF-8 bytes.
 */
export const storageCapacity = { keys: 500, bytes: 64 * 1024, origins: 10 };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const encoder = new TextEncoder();
const byteLength = (text: string) => encoder.encode(text).length;
const storedBytes = (values: Map<string, string>) => [...values].reduce((sum, [key, value]) => sum + byteLength(key) + byteLength(value), 0);

/**
 * The frame host's answer to a message from the framed LTI tool, per the 1EdTech LTI Client Side postMessages and its
 * platform storage profile (drafts 0.1): `lti.capabilities`, `lti.put_data` and `lti.get_data`, each answered by its
 * `.response`. Only a message from the frame counts, from whatever origin its page has: each origin reads and writes
 * its own values alone. A message from any other window, without an `lti.` subject or from an opaque (`null`) origin,
 * which no reply can address, gets no reply.
 */
export function answerStorageMessage(event: Pick<MessageEvent, 'data' | 'origin' | 'source'>, scope: StorageMessageScope): StorageReply | null {
  const { data, origin, source } = event;
  if (!source || source !== scope.frame || origin === 'null' || !isRecord(data)) return null;
  const { subject, message_id: messageId } = data;
  if (typeof subject !== 'string' || !subject.startsWith('lti.') || subject.endsWith('.response')) return null;

  const reply = (fields: Record<string, unknown>): StorageReply => ({
    message: { subject: `${subject}.response`, message_id: messageId, ...fields },
    targetOrigin: origin,
  });
  const refuse = (code: string, message: string) => reply({ error: { code, message } });

  if (!supportedSubjects.includes(subject)) return refuse('unsupported_subject', `${subject} is not supported`);
  if (typeof messageId !== 'string' && typeof messageId !== 'number') return refuse('bad_request', 'message_id is required');
  if (subject === 'lti.capabilities') return reply({ supported_messages: supportedSubjects.map((supported) => ({ subject: supported })) });

  const { key, value } = data;
  if (typeof key !== 'string' || !key) return refuse('bad_request', 'key must be a non-empty string');
  const values = scope.storage.get(origin) ?? new Map<string, string>();

  if (subject === 'lti.get_data') {
    const stored = values.get(key);
    return stored === undefined ? refuse('key_not_found', 'There is no value stored for this key') : reply({ key, value: stored });
  }

  // An omitted or empty value clears the key.
  if (value === undefined || value === null || value === '') {
    values.delete(key);
    return reply({ key });
  }
  if (typeof value !== 'string') return refuse('bad_request', 'value must be a string');

  const next = new Map(values).set(key, value);
  const newOrigin = !scope.storage.has(origin);
  if (next.size > storageCapacity.keys || storedBytes(next) > storageCapacity.bytes || (newOrigin && scope.storage.size >= storageCapacity.origins)) {
    return refuse('storage_exhaustion', 'This origin holds the most platform storage it may');
  }
  scope.storage.set(origin, next);
  return reply({ key, value });
}
