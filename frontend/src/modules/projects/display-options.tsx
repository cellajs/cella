import { cn } from '~/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { SquareKanban, Rows4, Grid2X2 } from 'lucide-react';
import { Link, useParams } from '@tanstack/react-router';
import { TooltipButton } from '../common/tooltip-button';
import { useTranslation } from 'react-i18next';

interface Props {
  className?: string;
}

const DisplayOptions = ({ className = '' }: Props) => {
  const { t } = useTranslation();
  const { idOrSlug }: { idOrSlug: string } = useParams({ strict: false });
  return (
    <ToggleGroup type="single" variant="merged" className={cn('gap-0', className)}>
      {['board', 'table', 'overview'].map((value) => (
        <TooltipButton key={value} portal={true} toolTipContent={t(`common:${value}_view`)}>
          <ToggleGroupItem key={value} value={value} asChild>
            <Link
              to={`/workspace/${idOrSlug}/${value}`}
              params={{ idOrSlug }}
              activeOptions={{ exact: true, includeSearch: false }}
              activeProps={{ className: '!bg-accent' }}
            >
              {value === 'board' && <SquareKanban size={16} />}
              {value === 'table' && <Rows4 size={16} />}
              {value === 'overview' && <Grid2X2 size={16} />}
            </Link>
          </ToggleGroupItem>
        </TooltipButton>
      ))}
    </ToggleGroup>
  );
};

export default DisplayOptions;
