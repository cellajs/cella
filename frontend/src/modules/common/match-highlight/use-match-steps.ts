import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Next/previous over the matching items of a view, in the order the view shows them. The ids come
 * from data, so items a virtualized list has not rendered still count. A current id that leaves
 * the list (the query changed) resets the position. Pass `currentId` when the view already tracks
 * its current item (a focused card); without it the hook keeps the position. Render `announcement`
 * in a polite live region.
 */
export function useMatchSteps<Id>(ids: readonly Id[], onStep: (id: Id) => void, currentId?: Id | null) {
  const { t } = useTranslation();
  const [ownId, setOwnId] = useState<Id | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const activeId = currentId === undefined ? ownId : currentId;
  const index = activeId === null ? -1 : ids.indexOf(activeId);
  const total = ids.length;

  const step = (direction: 1 | -1) => {
    if (!total) return;
    const next = index === -1 ? (direction === 1 ? 0 : total - 1) : (index + direction + total) % total;
    setOwnId(ids[next]);
    setAnnouncement(t('c:match_position', { current: next + 1, total }));
    onStep(ids[next]);
  };

  return {
    currentId: index === -1 ? null : activeId,
    /** 0-based; -1 before the first step. */
    index,
    total,
    announcement,
    next: () => step(1),
    previous: () => step(-1),
  };
}
