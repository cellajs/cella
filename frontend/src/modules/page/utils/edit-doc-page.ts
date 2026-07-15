import { toaster } from '~/modules/common/toaster/toaster';
import type { DocRenderMode } from '~/modules/page/content';

/**
 * Editing docs pages writes back to the md/mdx source files, only possible while the Vite dev
 * server runs; a production build bundles the content with no filesystem to write, so the pages
 * table stays read-only. Callers gate their editing UI on this.
 * @see vite/docs-editor.ts
 */
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
    toaster(err instanceof Error ? err.message : 'Failed to save page', 'error');
    throw err;
  }
}
