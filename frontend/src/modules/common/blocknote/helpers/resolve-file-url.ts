import { resolveBlockNoteFileRef } from '~/modules/attachment/helpers/resolve-url';
import type { CommonBlockNoteProps } from '~/modules/common/blocknote/types';

interface ResolveFileUrlContext {
  baseFilePanelProps: CommonBlockNoteProps['baseFilePanelProps'];
}

/**
 * Build the `resolveFileUrl` callback for BlockNote. The resolution itself lives in the attachment
 * module (`resolveBlockNoteFileRef`). This only supplies the editor's org context as a fallback
 * for references whose attachment isn't in cache.
 */
export function createResolveFileUrl({ baseFilePanelProps }: ResolveFileUrlContext) {
  return (ref: string): Promise<string> =>
    resolveBlockNoteFileRef(ref, {
      tenantId: baseFilePanelProps?.tenantId,
      organizationId: baseFilePanelProps?.organizationId,
    });
}
