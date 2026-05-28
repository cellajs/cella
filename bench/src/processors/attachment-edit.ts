/**
 * Attachment Edit processor for Artillery.
 *
 * Builds attachment name-edit payloads and sets context variables.
 */
import { nanoid } from 'nanoid';
import { uuidv7 } from 'uuidv7';
import { TENANT_ID, ORG_ID, attachmentId } from '../config';
import { TOTAL_ATTACHMENTS } from '../generators/ids';

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

export function buildAttachmentEditPayload(
  context: { vars: Record<string, unknown> },
  _events: unknown,
  done: () => void,
) {
  const userIndex = (context.vars.userIndex as number) ?? 0;
  const aId = attachmentId(userIndex % TOTAL_ATTACHMENTS);
  const sourceId = uuidv7();

  const stx: StxPayload = {
    mutationId: uuidv7(),
    sourceId,
    fieldTimestamps: { name: hlcTimestamp(sourceId) },
  };

  context.vars.tenantId = TENANT_ID;
  context.vars.orgId = ORG_ID;
  context.vars.attachmentId = aId;
  context.vars.payload = { ops: { name: `bench-attachment-${nanoid(8)}` }, stx };
  done();
}
