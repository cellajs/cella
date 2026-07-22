import { toaster } from '~/modules/common/toaster/toaster';
import type { DocRenderMode } from '~/modules/page/content';

/** Whether the Vite development server can persist page edits to MDX source files. */
export const canEditDocs = import.meta.env.DEV;

/** Edit ops accepted by the dev write-back endpoint; mirror `DocEditOps` server-side. */
export interface DocEditOps {
  title?: string;
  renderMode?: DocRenderMode;
  draft?: boolean;
  displayOrder?: number;
  parentId?: string | null;
}

/**
 * Persist a page edit via the dev-server endpoint: rewrites frontmatter (and moves the file on a
 * `parentId` change). Resolves on success; on failure shows an error toast and rejects. No-op outside dev.
 */
export async function editDocPage(slug: string, ops: DocEditOps): Promise<void> {
  if (!canEditDocs) return;
  try {
    const res = await fetch('/__docs-edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, ops }),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new Error(detail?.error ?? `Request failed (${res.status})`);
    }
  } catch (err) {
    toaster.error(err instanceof Error ? err.message : 'Failed to save page');
    throw err;
  }
}
