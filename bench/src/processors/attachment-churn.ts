import { uuidv7 } from 'uuidv7';
import { attachmentId } from '../seeds/ids';

export { authenticate } from './auth';

/** Rows per create and per delete request. */
const BATCH_SIZE = 10;
/** Past the seeded attachments and still inside the bench id band, so the next seed removes what a run leaves. */
const FIRST_CHURN_INDEX = 0x1000000;

interface ArtilleryEvents {
  emit(kind: 'counter', name: string, value: number): void;
}

interface BatchResponse {
  data?: unknown[];
  rejectedIds?: string[];
}

/** Builds one batch of new attachments and the request that deletes them again. The files themselves never exist: an empty key names no stored object. */
export function buildChurnBatch(context: { vars: Record<string, unknown> }, _events: unknown, done: () => void) {
  const first = FIRST_CHURN_INDEX + Math.floor(Math.random() * 0xffffffff) * BATCH_SIZE;
  const ids = Array.from({ length: BATCH_SIZE }, (_, i) => attachmentId(first + i));
  const stx = { mutationId: uuidv7(), sourceId: uuidv7(), fieldTimestamps: {} };

  context.vars.createPayload = ids.map((id, i) => ({
    id,
    name: `bench-churn-${first + i}`,
    filename: `bench-churn-${first + i}.pdf`,
    contentType: 'application/pdf',
    size: '1024',
    keys: { original: '' },
    stx,
  }));
  context.vars.deletePayload = { ids, stx: { mutationId: uuidv7(), sourceId: stx.sourceId } };
  done();
}

const parseBatch = (body: unknown): BatchResponse => {
  try {
    return JSON.parse(String(body)) as BatchResponse;
  } catch {
    return {};
  }
};

/** Counts the rows a create inserted, for the CLI's checks on recorded activities and on the entity count. */
export function countCreated(
  _request: unknown,
  response: { statusCode: number; body: unknown },
  _context: unknown,
  events: ArtilleryEvents,
  done: () => void,
) {
  const created = response.statusCode < 300 ? (parseBatch(response.body).data?.length ?? 0) : 0;
  if (created > 0) {
    events.emit('counter', 'bench.rows_written', created);
    events.emit('counter', 'bench.rows_created.attachment', created);
  }
  done();
}

/** Counts the rows a delete removed: the batch minus what the response rejected. */
export function countDeleted(
  _request: unknown,
  response: { statusCode: number; body: unknown },
  _context: unknown,
  events: ArtilleryEvents,
  done: () => void,
) {
  const deleted = response.statusCode < 300 ? BATCH_SIZE - (parseBatch(response.body).rejectedIds?.length ?? 0) : 0;
  if (deleted > 0) {
    events.emit('counter', 'bench.rows_written', deleted);
    events.emit('counter', 'bench.rows_deleted.attachment', deleted);
  }
  done();
}
