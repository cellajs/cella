import { ChevronDownIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collapseMotion } from '~/modules/common/collapse-motion';
import { Button } from '~/modules/ui/button';

interface ExpandableListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  initialDisplayCount: number;
  alwaysShowAll?: boolean;
}

export function ExpandableList<T>({ items, renderItem, initialDisplayCount, alwaysShowAll = false }: ExpandableListProps<T>) {
  const { t } = useTranslation();
  // Show more's click; `alwaysShowAll` can change after mount (a breakpoint), so it is not stored
  const [expanded, setExpanded] = useState(false);
  const showAll = expanded || alwaysShowAll;

  return (
    <>
      {items.map((item, index) => {
        const isInitiallyVisible = index < initialDisplayCount;
        const shouldAnimate = expanded && !isInitiallyVisible;

        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: list is static and will not be reordered
          <AnimatePresence key={index}>
            {isInitiallyVisible || showAll ? (
              <motion.div {...collapseMotion} initial={shouldAnimate ? collapseMotion.initial : false}>
                {renderItem(item, index)}
              </motion.div>
            ) : null}
          </AnimatePresence>
        );
      })}

      {!showAll && items.length > initialDisplayCount && (
        <Button variant="ghost" className="group/expandable-list flex w-full" onClick={() => setExpanded(true)}>
          {t('c:show_more', { count: items.length - initialDisplayCount })}
          <ChevronDownIcon className="opacity-50 transition-opacity group-hover/expandable-list:opacity-100" />
        </Button>
      )}
    </>
  );
}
