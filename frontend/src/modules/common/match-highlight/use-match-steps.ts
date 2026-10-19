import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Next/previous over the matching items of a view, in the order the view shows them. The ids come
 * from data, so items a virtualized list has not rendered still count. A current id that leaves
 * the list (the query changed) resets the position. Render `announcement` in a polite live region.
 */
export function useMatchSteps<Id>(ids: readonly Id[], onStep: (id: Id) => void) {
  const { t } = useTranslation();
  const [currentId, setCurrentId] = useState<Id | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const index = currentId === null ? -1 : ids.indexOf(currentId);
  const total = ids.length;

  const step = (direction: 1 | -1) => {
    if (!total) return;
    const next = index === -1 ? (direction === 1 ? 0 : total - 1) : (index + direction + total) % total;
    setCurrentId(ids[next]);
    setAnnouncement(t('c:match_position', { current: next + 1, total }));
    onStep(ids[next]);
  };

  return {
    currentId: index === -1 ? null : currentId,
    /** 0-based; -1 before the first step. */
    index,
    total,
    announcement,
    next: () => step(1),
    previous: () => step(-1),
  };
}
