import { nanoid } from 'nanoid';
import { hierarchy } from 'shared';
import { hashSourceId } from 'shared/utils/hash-source-id';
import { uuidv7 } from 'uuidv7';
import { ORG_PATH } from './bench-user';
import { TOTAL_ATTACHMENTS } from './seeds/attachment-constants';
import { benchAttachmentHome } from './seeds/attachment-home';
import { attachmentId } from './seeds/ids';

/** Rows per create and per delete request of a churn batch. */
export const CHURN_BATCH_SIZE = 10;
/** Past the seeded attachments and still inside the bench id band, so the next seed removes what a run leaves. */
const FIRST_CHURN_INDEX = 0x1000000;

const hlcTimestamp = (sourceId: string, counter = 0) => `${Date.now()}:${String(counter).padStart(4, '0')}:${hashSourceId(sourceId)}`;

/** A rename of the user's own seeded attachment, with the field timestamp a client sends. */
export function attachmentEdit(userIndex: number): { path: string; json: unknown } {
  const sourceId = uuidv7();
  const stx = { mutationId: uuidv7(), sourceId, fieldTimestamps: { name: hlcTimestamp(sourceId) } };
  return {
    path: `${ORG_PATH}/attachments/${attachmentId(userIndex % TOTAL_ATTACHMENTS)}`,
    json: { ops: { name: `bench-attachment-${nanoid(8)}` }, stx },
  };
}

/** The placement field of a create body: the deepest home id alone, since the server reads the chain above it off that channel. None for an attachment in the organization. */
function createHomeField(index: number): Record<string, string> {
  const [home] = hierarchy.resolveNonNullAncestors('attachment', benchAttachmentHome(index));
  return home ? { [home.idColumn]: home.id } : {};
}

/** One batch of new attachments and the body that deletes them again. The files never exist: an empty key names no stored object. */
export function churnBatch(): { create: unknown[]; remove: unknown } {
  const first = FIRST_CHURN_INDEX + Math.floor(Math.random() * 0xffffffff) * CHURN_BATCH_SIZE;
  const ids = Array.from({ length: CHURN_BATCH_SIZE }, (_, i) => attachmentId(first + i));
  const stx = { mutationId: uuidv7(), sourceId: uuidv7(), fieldTimestamps: {} };
  const create = ids.map((id, i) => ({
    id,
    name: `bench-churn-${first + i}`,
    filename: `bench-churn-${first + i}.pdf`,
    contentType: 'application/pdf',
    size: '1024',
    keys: { original: '' },
    ...createHomeField(first + i),
    stx,
  }));
  return { create, remove: { ids, stx: { mutationId: uuidv7(), sourceId: stx.sourceId } } };
}
