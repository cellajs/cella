import { resolveBlockNoteFileRef } from '~/modules/attachment/helpers/resolve-url';
import type { CommonBlockNoteProps } from '~/modules/common/blocknote/types';

interface ResolveFileUrlContext {
  baseFilePanelProps: CommonBlockNoteProps['baseFilePanelProps'];
}

/** Supplies the editor's org context to `resolveBlockNoteFileRef` as a fallback for references whose attachment is not cached. */
export function createResolveFileUrl({ baseFilePanelProps }: ResolveFileUrlContext) {
  return (ref: string): Promise<string> =>
    resolveBlockNoteFileRef(ref, {
      tenantId: baseFilePanelProps?.tenantId,
      organizationId: baseFilePanelProps?.organizationId,
    });
}
