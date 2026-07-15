import { toaster } from '~/modules/common/toaster/toaster';
import type { DocRenderMode } from '~/modules/page/content';

/**
 * Editing docs pages writes back to the md/mdx source files, which is only
 * possible while the Vite dev server is running. In a production build the content
 * is bundled and there is no filesystem to write, so the pages table stays
 * read-only. Callers gate their editing UI on this.
 *
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
 * Persist a page edit by rewriting its frontmatter (and, for a `parentId`
 * change, moving the file) via the dev-server endpoint. Resolves on success;
 * shows an error toast and rejects otherwise. No-op outside dev.
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
