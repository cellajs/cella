import { ChevronDownIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { collapseMotion } from '~/modules/common/collapse-motion';
import { CountBadge } from '~/modules/common/count-badge';
import { Button } from '~/modules/ui/button';

interface ExpandableListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  initialDisplayCount: number;
  alwaysShowAll?: boolean;
  expandText: TKey;
}

export function ExpandableList<T>({ items, renderItem, initialDisplayCount, alwaysShowAll = false, expandText }: ExpandableListProps<T>) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(alwaysShowAll);
  const hasExpandedOnceRef = useRef(false);

  return (
    <>
      {items.map((item, index) => {
        const isInitiallyVisible = index < initialDisplayCount;
        const shouldAnimate = hasExpandedOnceRef.current && !isInitiallyVisible;

        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: list is static and will not be reordered
          <AnimatePresence key={index}>
            {isInitiallyVisible || expanded ? (
              <motion.div {...collapseMotion} initial={shouldAnimate ? collapseMotion.initial : false}>
                {renderItem(item, index)}
              </motion.div>
            ) : null}
          </AnimatePresence>
        );
      })}

      {!expanded && items.length > initialDisplayCount && (
        <Button
          variant="ghost"
          className="group/expandable-list flex w-full"
          onClick={() => {
            hasExpandedOnceRef.current = true;
            setExpanded(true);
          }}
        >
          <CountBadge count={items.length - initialDisplayCount} />
          {t(expandText)}
          <ChevronDownIcon className="opacity-50 transition-opacity group-hover/expandable-list:opacity-100" />
        </Button>
      )}
    </>
  );
}
