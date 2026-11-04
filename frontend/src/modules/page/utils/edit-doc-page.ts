import { toaster } from '~/modules/common/toaster/toaster';
import type { DocRenderMode } from '~/modules/page/content';

/** Whether the Vite development server can persist page edits to MDX source files. */
export const canEditDocs = import.meta.env.DEV;

/** Editable frontmatter fields, as the pages table sends them to the dev write-back endpoint (vite/docs-editor.ts). */
export interface DocEditOps {
  title?: string;
  renderMode?: DocRenderMode;
  draft?: boolean;
  displayOrder?: number;
  parentId?: string | null;
}

/** Persists a page edit through the dev-server endpoint: rewrites frontmatter and moves the file on a `parentId` change. No-op outside dev. */
export async function editDocPage(slug: string, ops: DocEditOps): Promise<void> {
  if (!canEditDocs) return;
  try {
    const response = await fetch('/__docs-edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, ops }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.error ?? `Request failed (${response.status})`);
    }
  } catch (error) {
    toaster.error(error instanceof Error ? error.message : 'Failed to save page');
    throw error;
  }
}
