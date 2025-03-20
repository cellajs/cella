import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

interface ExpandableListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  initialDisplayCount: number;
  alwaysShowAll?: boolean;
  expandText: string;
}

/**
 * A list that can be expanded to show all items.
 */
export const ExpandableList = <T,>({ items, renderItem, initialDisplayCount, alwaysShowAll = false, expandText }: ExpandableListProps<T>) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(alwaysShowAll);

  return (
    <>
      {items.map((item, index) => {
        const isInitiallyVisible = index < initialDisplayCount;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
          <AnimatePresence key={index}>
            {isInitiallyVisible || expanded ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                {renderItem(item, index)}
              </motion.div>
            ) : null}
          </AnimatePresence>
        );
      })}

      {!expanded && items.length > initialDisplayCount && (
        <Button variant="ghost" className="w-full mt-4 group flex items-center" onClick={() => setExpanded(true)}>
          <Badge size="sm" className="mr-2 aspect-square py-0 px-1">
            {items.length - initialDisplayCount}
          </Badge>
          {t(expandText)}
          <ChevronDown className="opacity-50 group-hover:opacity-100 transition-opacity ml-2" size={16} />
        </Button>
      )}
    </>
  );
};
