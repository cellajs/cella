import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProductEntityType } from 'shared';
import type * as Y from 'yjs';
import { cachedEntityName, firstLineOf, firstLineOfUpdates, YDOC_FRAGMENT, yDocLabel } from '~/modules/common/blocknote/ydoc-label';
import { type UnstoredYDoc, watchUnstoredYDocs } from '~/modules/common/blocknote/yjs-connections';
import { loadYDoc, type UnsavedYDoc, watchUnsavedYDocs } from '~/modules/common/blocknote/yjs-store';
import { Button } from '~/modules/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { getLocalUserDb, type UnsaveableReason } from '~/query/local-user-db';

/** A document whose edits no server holds, as the sign-out confirm lists it. */
export interface UnsavedEdit {
  /** Stable per entry: one document can be listed stored and parked at once. */
  key: string;
  entityId: string;
  /** Unknown for edits held in memory only. */
  entityType?: ProductEntityType;
  /** Why the edits can never be saved, once parked; null while they can still save. */
  parked: UnsaveableReason | null;
  /** The live document, for edits held in memory only. */
  yDoc?: Y.Doc;
}

/** Stored documents with unsynced edits, parked ones, then in-memory edits no stored row lists already. */
function combine(stored: UnsavedYDoc[], unstored: UnstoredYDoc[]): UnsavedEdit[] {
  const seen = new Map<string, number>();
  const withKey = (edit: Omit<UnsavedEdit, 'key'>): UnsavedEdit => {
    const base = `${edit.parked ?? 'unsynced'}:${edit.entityType ?? ''}:${edit.entityId}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { ...edit, key: count > 1 ? `${base}#${count}` : base };
  };
  const listed = stored.map(({ entityType, entityId, parked }) => withKey({ entityType, entityId, parked }));
  const storedIds = new Set(stored.filter((doc) => !doc.parked).map((doc) => doc.entityId));
  const inMemory = unstored.filter((doc) => !storedIds.has(doc.entityId)).map(({ entityId, yDoc }) => withKey({ entityId, yDoc, parked: null }));
  return [...listed, ...inMemory];
}

/**
 * The edits sign-out would discard, live: the store's rows and the connections that keep saving on the sign-out page,
 * so the list shrinks as they save. Undefined until both sources answered, or while `enabled` is false.
 */
export function useUnsavedEdits(enabled: boolean): UnsavedEdit[] | undefined {
  const [stored, setStored] = useState<UnsavedYDoc[]>();
  const [unstored, setUnstored] = useState<UnstoredYDoc[]>();

  useEffect(() => (enabled ? watchUnsavedYDocs(setStored) : undefined), [enabled]);
  useEffect(() => (enabled ? watchUnstoredYDocs(setUnstored) : undefined), [enabled]);

  return useMemo(() => (enabled && stored && unstored ? combine(stored, unstored) : undefined), [enabled, stored, unstored]);
}

/** The first line of an unsaved document, from memory, its parked row or its stored rows. */
async function readFirstLine({ entityId, entityType, parked, yDoc }: Omit<UnsavedEdit, 'key'>): Promise<string | null> {
  if (yDoc) return firstLineOf(yDoc.getXmlFragment(YDOC_FRAGMENT));
  if (!entityType) return null;
  if (parked) {
    const row = await getLocalUserDb()?.unsaveableYDocs.where('[entityType+entityId]').equals([entityType, entityId]).last();
    return row ? firstLineOfUpdates([row.state]) : null;
  }
  const loaded = await loadYDoc({ entityType, entityId });
  return loaded ? firstLineOfUpdates(loaded.updates) : null;
}

function UnsavedEditItem({ edit }: { edit: UnsavedEdit }) {
  const { t } = useTranslation();
  const { entityId, entityType, parked, yDoc } = edit;
  const [firstLine, setFirstLine] = useState<string | null>(null);

  // The cache names most entities; a first line names the rest, read once per document.
  useEffect(() => {
    if (cachedEntityName(entityId, entityType)) return;
    let current = true;
    readFirstLine({ entityId, entityType, parked, yDoc }).then(
      (line) => current && setFirstLine(line),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [entityId, entityType, parked, yDoc]);

  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="truncate">{yDocLabel({ entityId, entityType, firstLine })}</span>
      <span className="shrink-0 text-muted-foreground text-xs">{parked ? t('c:cannot_save') : t('c:not_saved')}</span>
    </li>
  );
}

interface UnsavedEditsDialogProps {
  edits: UnsavedEdit[];
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks before sign-out discards edits no server holds, listing them; closing it keeps editing. */
export function UnsavedEditsDialog({ edits, onConfirm, onCancel }: UnsavedEditsDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('c:confirm.sign_out_unsaved')}</DialogTitle>
          <DialogDescription>{t('c:sign_out_unsaved.text')}</DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-60 flex-col gap-1.5 overflow-y-auto text-sm">
          {edits.map((edit) => (
            <UnsavedEditItem key={edit.key} edit={edit} />
          ))}
        </ul>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            {t('c:keep_editing')}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {t('c:sign_out_anyway')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
