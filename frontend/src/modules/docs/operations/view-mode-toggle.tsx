import { Link } from '@tanstack/react-router';
import { ListIcon, TableIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TooltipButton } from '~/modules/common/tooltip-button';
import type { OperationSearch } from '~/modules/docs/types';
import { SegmentedNav, segmentClassName } from '~/modules/ui/segmented-control';

/** The search goes along; the sort and the expanded tag belong to one view. */
const carrySearch = ({ q, filter }: OperationSearch) => ({ q, filter });

/** The path alone picks the active view: the current URL can hold search params the links do not carry. */
const activeOptions = { exact: true, includeSearch: false };

export function ViewModeToggle() {
  const { t } = useTranslation();

  return (
    <SegmentedNav aria-label={t('c:view_mode')}>
      <TooltipButton toolTipContent={t('c:list_view')}>
        <Link to="/docs/operations" search={carrySearch} activeOptions={activeOptions} draggable={false} className={segmentClassName}>
          <ListIcon />
        </Link>
      </TooltipButton>
      <TooltipButton toolTipContent={t('c:table_view')}>
        <Link to="/docs/operations/table" search={carrySearch} activeOptions={activeOptions} draggable={false} className={segmentClassName}>
          <TableIcon />
        </Link>
      </TooltipButton>
    </SegmentedNav>
  );
}
