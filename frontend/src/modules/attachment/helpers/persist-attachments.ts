import type { Attachment } from 'sdk';
// biome-ignore lint/style/noRestrictedImports: colocated imperative attachment creation helper.
import { createAttachments } from 'sdk';
import { createStxForCreate } from '~/query/offline/stx-utils';

/**
 * Persist already-parsed attachments as real entities.
 *
 * Used by contexts that upload inline media as true attachments (BlockNote's
 * `public-attachment` / `private-attachment` modes). The attachments keep their
 * client-generated ids, so anything already referencing those ids (e.g. a
 * BlockNote block written on upload) stays valid after persistence.
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
