/** Values the framed LTI tool put, by its origin and then by key; it lives as long as the frame. */
export type PlatformStorage = Map<string, Map<string, string>>;

/** What a storage message is checked against: the frame the host rendered and the origins of the LTI tool's pages. */
interface StorageMessageScope {
  frame: MessageEventSource | null;
  ltiToolOrigins: readonly string[];
  storage: PlatformStorage;
}

/** A reply to post to the frame, at the origin that asked. */
export interface StorageReply {
  message: Record<string, unknown>;
  targetOrigin: string;
}

const supportedSubjects = ['lti.capabilities', 'lti.put_data', 'lti.get_data'];

/** Bounds on what one origin may keep in memory. */
const maxKeyLength = 1024;
const maxValueLength = 4096;
const maxEntriesPerOrigin = 50;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * The frame host's answer to a message from the framed LTI tool, per the 1EdTech LTI Client Side postMessages and its
 * platform storage profile (drafts 0.1): `lti.capabilities`, `lti.put_data` and `lti.get_data`, each answered by its
 * `.response`. A message from any window but the frame, or with no `lti.` subject, gets no reply. Capabilities answer
 * any origin, as the drafts require; data answers only the LTI tool's origins, each reading its own values alone.
 */
export function answerStorageMessage(event: Pick<MessageEvent, 'data' | 'origin' | 'source'>, scope: StorageMessageScope): StorageReply | null {
  const { data, origin, source } = event;
  if (!source || source !== scope.frame || !isRecord(data)) return null;
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

  if (!scope.ltiToolOrigins.includes(origin)) return refuse('wrong_origin', 'this origin may not use platform storage');
  const { key, value } = data;
  if (typeof key !== 'string' || !key || key.length > maxKeyLength) return refuse('bad_request', 'key must be a string');
  const values = scope.storage.get(origin) ?? new Map<string, string>();

  if (subject === 'lti.get_data') {
    const stored = values.get(key);
    return stored === undefined ? refuse('key_not_found', 'There is no value stored for this key') : reply({ key, value: stored });
  }

  if (typeof value !== 'string' || value.length > maxValueLength) return refuse('bad_request', 'value must be a string');
  // The oldest value goes first once an origin holds the most it may.
  if (!values.has(key) && values.size >= maxEntriesPerOrigin) {
    const [oldest] = values.keys();
    values.delete(oldest);
  }
  values.set(key, value);
  scope.storage.set(origin, values);
  return reply({ key, value });
}
