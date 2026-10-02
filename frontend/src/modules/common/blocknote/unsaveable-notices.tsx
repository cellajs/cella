import i18n from 'i18next';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Y from 'yjs';
import type { TKey } from '~/lib/i18n-locales';
import { firstLineOf, YDOC_FRAGMENT, yDocLabel } from '~/modules/common/blocknote/ydoc-label';
import type { YjsConnection } from '~/modules/common/blocknote/yjs-connections';
import type { HttpLinkScope } from '~/modules/common/blocknote/yjs-http';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { getLocalUserDb, type UnsaveableReason, type UnsaveableYDocRecord } from '~/query/local-user-db';
import { queryClient } from '~/query/query-client';

const REASON_TEXTS: Record<UnsaveableReason, TKey> = {
  deleted: 'c:unsaveable_deleted.text',
  denied: 'c:unsaveable_denied.text',
  replaced: 'c:unsaveable_replaced.text',
  refused: 'c:unsaveable_refused.text',
};

/** What parking reads off a connection. */
type ParkSource = Pick<YjsConnection, 'yDoc' | 'writer' | 'unsynced' | 'generation'>;

/**
 * Takes a document out of sync for good: unsynced edits are parked through its writer and offered in a notice to copy,
 * and a clean document's stored copy goes silently. The document is read before this returns, so the caller may destroy
 * it right after. Without a writer, or when parking fails, the notice holds the state in memory.
 */
export function parkUnsaveable(conn: ParkSource, scope: HttpLinkScope, reason: UnsaveableReason): void {
  const { writer, yDoc } = conn;
  if (!conn.unsynced) {
    writer?.drop().catch((error) => console.error('[yjs] Deleting a stored document failed:', error));
    return;
  }
  const { entityType, entityId, tenantId, organizationId } = scope;
  const record: UnsaveableYDocRecord = {
    entityType,
    entityId,
    tenantId,
    organizationId,
    generation: conn.generation ?? '',
    reason,
    state: Y.encodeStateAsUpdate(yDoc),
    at: Date.now(),
  };
  noticeOnceParked(record, writer ? writer.park(reason, yDoc) : null).catch((error) =>
    console.error('[yjs] Showing the notice for unsaveable edits failed:', error),
  );
}

async function noticeOnceParked(record: UnsaveableYDocRecord, parked: Promise<void> | null) {
  let shown = record;
  if (parked) {
    try {
      await parked;
      // The writer just added the document's newest parked row; Discard deletes that one.
      const db = getLocalUserDb();
      shown = (await db?.unsaveableYDocs.where('[entityType+entityId]').equals([record.entityType, record.entityId]).last()) ?? record;
    } catch (error) {
      console.error('[yjs] Parking unsaveable edits failed, so the notice holds them:', error);
    }
  }
  await showUnsaveableNotice(shown);
}

/**
 * Shows a notice, without a timeout, for edits that can never be saved: "Copy text" puts them on the clipboard as
 * markdown and HTML, "Discard" deletes them. BlockNote loads with the first notice, so the boot check stays light.
 */
export async function showUnsaveableNotice(record: UnsaveableYDocRecord): Promise<void> {
  const [{ yDocToBlocks }, { copyBlocksToClipboard, getHeadlessEditor }] = await Promise.all([
    import('@blocknote/core/yjs'),
    import('~/modules/common/blocknote/helpers/blocknote-helpers'),
  ]);

  // The blocks are ready before the click, so the clipboard write runs inside it, as Safari requires.
  const doc = new Y.Doc();
  let blocks: string | null = null;
  let firstLine: string | null = null;
  try {
    Y.applyUpdate(doc, record.state);
    firstLine = firstLineOf(doc.getXmlFragment(YDOC_FRAGMENT));
    blocks = JSON.stringify(yDocToBlocks(getHeadlessEditor(), doc, YDOC_FRAGMENT));
  } catch (error) {
    console.error('[yjs] Reading parked edits failed:', error);
  } finally {
    doc.destroy();
  }

  const id = `unsaveable:${record.id ?? `${record.entityType}:${record.entityId}:${record.at}`}`;
  const name = yDocLabel({ entityId: record.entityId, entityType: record.entityType, firstLine });
  toaster.warning(i18n.t(REASON_TEXTS[record.reason], { name }), {
    id,
    timeout: 0,
    description: <NoticeActions copy={blocks ? () => copyBlocksToClipboard(blocks) : null} discard={() => discardUnsaveable(record, id)} />,
  });
}

/**
 * Deletes parked edits, and refetches the entity: a collaborative patch put the unsaved text in its cached detail and
 * list rows, and the stamp guard keeps it there against stream updates.
 */
async function discardUnsaveable(record: UnsaveableYDocRecord, toastId: string) {
  toaster.close(toastId);
  if (record.id !== undefined) {
    try {
      await getLocalUserDb()?.unsaveableYDocs.delete(record.id);
    } catch (error) {
      console.error('[yjs] Discarding parked edits failed:', error);
    }
  }
  if (!hasEntityQueryKeys(record.entityType)) return;
  const keys = getEntityQueryKeys(record.entityType);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.detail.byId(record.entityId) }),
    queryClient.invalidateQueries({ queryKey: keys.list.org(record.organizationId) }),
  ]);
}

function NoticeActions({ copy, discard }: { copy: (() => Promise<boolean>) | null; discard: () => Promise<void> }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<boolean | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <p>{t('c:unsaveable_edits.text')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="xs" className="text-foreground" disabled={!copy} onClick={() => copy?.().then(setCopied)}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? t('c:copied') : copied === false ? t('c:copy_failed') : t('c:copy_text')}
        </Button>
        <Button variant="ghost" size="xs" className="text-foreground" onClick={() => void discard()}>
          {t('c:discard')}
        </Button>
      </div>
    </div>
  );
}
