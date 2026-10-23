import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Next/previous over a view's matching ids in view order; the ids come from data, so unrendered virtualized items count.
 * Pass `currentId` when the view tracks its current item (a focused card); otherwise the hook does. An id that leaves the list resets the position.
 */
export function useMatchSteps<Id>(ids: readonly Id[], onStep: (id: Id) => void, currentId?: Id | null) {
  const { t } = useTranslation();
  const [steppedId, setSteppedId] = useState<Id | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const activeId = currentId === undefined ? steppedId : currentId;
  const index = activeId === null ? -1 : ids.indexOf(activeId);
  const total = ids.length;

  const step = (direction: 1 | -1) => {
    if (!total) return;
    const next = index === -1 ? (direction === 1 ? 0 : total - 1) : (index + direction + total) % total;
    setSteppedId(ids[next]);
    setAnnouncement(t('c:match_position', { current: next + 1, total }));
    onStep(ids[next]);
  };

  return {
    currentId: index === -1 ? null : activeId,
    /** 0-based; -1 before the first step. */
    index,
    total,
    /** For a polite live region */
    announcement,
    next: () => step(1),
    previous: () => step(-1),
  };
}
