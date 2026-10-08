import { nanoid } from 'nanoid';
import { uuidv7 } from 'uuidv7';
import { TOTAL_ATTACHMENTS } from '../seeds/attachment-constants';
import { attachmentId } from '../seeds/ids';

export { authenticate } from './auth';

interface StxPayload {
  mutationId: string;
  sourceId: string;
  fieldTimestamps: Record<string, string>;
}

function hashSourceId(sourceId: string): string {
  let hash = 0;
  for (let i = 0; i < sourceId.length; i++) {
    hash = ((hash << 5) - hash + sourceId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(5, '0').slice(0, 5);
}

function hlcTimestamp(sourceId: string, counter = 0): string {
  return `${Date.now()}:${String(counter).padStart(4, '0')}:${hashSourceId(sourceId)}`;
}

/** Builds attachment name-edit payloads and sets Artillery context variables. */
export function buildAttachmentEditPayload(context: { vars: Record<string, unknown> }, _events: unknown, done: () => void) {
  const userIndex = (context.vars.userIndex as number) ?? 0;
  const aId = attachmentId(userIndex % TOTAL_ATTACHMENTS);
  const sourceId = uuidv7();

  const stx: StxPayload = { mutationId: uuidv7(), sourceId, fieldTimestamps: { name: hlcTimestamp(sourceId) } };

  context.vars.attachmentId = aId;
  context.vars.payload = { ops: { name: `bench-attachment-${nanoid(8)}` }, stx };
  done();
}

interface ArtilleryEvents {
  emit(kind: 'counter', name: string, value: number): void;
}

/** Counts an accepted edit as a written row: the CLI checks that the CDC worker recorded as many. */
export function countEdit(_request: unknown, response: { statusCode: number }, _context: unknown, events: ArtilleryEvents, done: () => void) {
  if (response.statusCode === 200) events.emit('counter', 'bench.rows_written', 1);
  done();
}
