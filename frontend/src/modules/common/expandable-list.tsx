import { ChevronDown } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

interface ExpandableListProps {
  items: unknown[];
  // biome-ignore lint/suspicious/noExplicitAny: the component doesn't do anything with items
  renderItem: (item: any, index: number) => React.ReactNode;
  initialDisplayCount: number;
  alwaysShowAll?: boolean;
  expandText: string;
}

export const ExpandableList = ({ items, renderItem, initialDisplayCount, alwaysShowAll, expandText }: ExpandableListProps) => {
  const { t } = useTranslation();
  const [displayCount, setDisplayCount] = useState(alwaysShowAll ? items.length : initialDisplayCount);

  const handleLoadMore = () => {
    setDisplayCount(items.length);
  };

  const visibleItems = items.slice(0, displayCount);
  return (
    <>
      {visibleItems.map(renderItem)}
      {displayCount < items.length && (
        <Button variant="ghost" className="w-full mt-4 group" onClick={handleLoadMore}>
          <Badge className="mr-2 aspect-square py-0 px-1">{items.length - initialDisplayCount}</Badge>
          {t(expandText)}
          <ChevronDown className="opacity-50 group-hover:opacity-100 transition-opacity ml-2" size={16} />
        </Button>
      )}
    </>
  );
};
