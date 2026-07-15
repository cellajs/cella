import type { Attachment } from 'sdk';
// biome-ignore lint/style/noRestrictedImports: colocated imperative attachment creation helper.
import { createAttachments } from 'sdk';
import { createStxForCreate } from '~/query/offline/stx-utils';

/**
 * Persist already-parsed attachments as real entities (BlockNote's `public-attachment` /
 * `private-attachment` modes). They keep their client-generated ids, so a BlockNote block written
 * on upload that references those ids stays valid after persistence.
 */
export async function persistAttachments(
  attachments: Attachment[],
  { tenantId, organizationId }: { tenantId: string; organizationId: string },
): Promise<void> {
  if (!attachments.length) return;
  const stx = createStxForCreate();
  const body = attachments.map((att) => ({ ...att, stx }));
  await createAttachments({ path: { tenantId, organizationId }, body });
}
