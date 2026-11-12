import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InputGroupButton } from '~/modules/ui/input-group';

/**
 * Next/previous over a view's matching ids in view order, for a find that keeps the content around its matches; the ids
 * come from data, so unrendered virtualized items count. An id that leaves the list resets the position.
 */
export function useMatchSteps<Id>(ids: readonly Id[], onStep: (id: Id) => void) {
  const { t } = useTranslation();
  const [steppedId, setSteppedId] = useState<Id | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const index = steppedId === null ? -1 : ids.indexOf(steppedId);
  const total = ids.length;

  const step = (direction: 1 | -1) => {
    if (!total) return;
    const next = index === -1 ? (direction === 1 ? 0 : total - 1) : (index + direction + total) % total;
    setSteppedId(ids[next]);
    setAnnouncement(t('c:match_position', { current: next + 1, total }));
    onStep(ids[next]);
  };

  return {
    currentId: index === -1 ? null : steppedId,
    /** 0-based; -1 before the first step. */
    index,
    total,
    /** For a polite live region */
    announcement,
    next: () => step(1),
    previous: () => step(-1),
  };
}

type MatchSteps = Pick<ReturnType<typeof useMatchSteps<unknown>>, 'index' | 'total' | 'announcement' | 'next' | 'previous'>;

/** Enter and Shift+Enter in the find field step through the matches. */
export const stepOnEnter = (steps: MatchSteps) => (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key !== 'Enter' || !steps.total) return;
  event.preventDefault();
  if (event.shiftKey) steps.previous();
  else steps.next();
};

/** Where the current match is, with buttons to the next and previous; goes inside the find field. */
export function FindSteps({ steps }: { steps: MatchSteps }) {
  const { t } = useTranslation();

  return (
    <>
      <span className="text-muted-foreground mr-1 text-sm whitespace-nowrap tabular-nums">
        {steps.total === 0 && t('c:no_results')}
        {steps.total > 0 && (steps.index >= 0 ? t('c:match_position', { current: steps.index + 1, total: steps.total }) : steps.total)}
      </span>
      {/* Mouse down keeps focus in the field, so typing goes on after a step */}
      <InputGroupButton
        size="icon-sm"
        aria-label={t('c:previous')}
        disabled={!steps.total}
        onMouseDown={(event) => event.preventDefault()}
        onClick={steps.previous}
      >
        <ChevronUpIcon className="size-4" />
      </InputGroupButton>
      <InputGroupButton
        size="icon-sm"
        aria-label={t('c:next')}
        disabled={!steps.total}
        onMouseDown={(event) => event.preventDefault()}
        onClick={steps.next}
      >
        <ChevronDownIcon className="size-4" />
      </InputGroupButton>
      <span className="sr-only" aria-live="polite">
        {steps.announcement}
      </span>
    </>
  );
}
