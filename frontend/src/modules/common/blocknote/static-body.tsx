import { Suspense } from 'react';
import { splitTitleBlocks } from '~/modules/common/blocknote/helpers/forced-title';
import { BlockNoteFullHtml } from '~/modules/common/blocknote/lazy-full-html';

interface Props {
  id: string;
  /** A product's `description`: a stringified block document (composer output) or legacy HTML. */
  document: string;
  tenantId?: string;
  organizationId?: string;
  className?: string;
}

/**
 * A product description outside its card (panels, sheets): block documents render through the static
 * renderer with the title block dropped (the host prints the name itself); anything unparseable is
 * legacy HTML from seeds/ETL and renders as-is. Renders nothing for a title-only document.
 */
export function StaticDocumentBody({ id, document, tenantId, organizationId, className }: Props) {
  let body: string | null | undefined;
  try {
    const blocks = JSON.parse(document);
    if (Array.isArray(blocks)) {
      const rest = splitTitleBlocks(blocks).body;
      body = rest.length > 0 ? JSON.stringify(rest) : null;
    }
  } catch {
    body = undefined; // not JSON: legacy HTML
  }

  if (body === null) return null;
  if (body === undefined) {
    // biome-ignore lint/security/noDangerouslySetInnerHtml: legacy HTML descriptions (same trust as feed cards)
    return <div className={className} dangerouslySetInnerHTML={{ __html: document }} />;
  }
  return (
    <div className={className}>
      <Suspense fallback={null}>
        <BlockNoteFullHtml id={id} defaultValue={body} dense tenantId={tenantId} organizationId={organizationId} />
      </Suspense>
    </div>
  );
}
