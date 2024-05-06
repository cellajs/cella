import { cn } from '~/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { SquareKanban, Rows4, Grid2X2 } from 'lucide-react';
import { Link, useParams } from '@tanstack/react-router';

interface Props {
  className?: string;
}

const DisplayOptions = ({ className = '' }: Props) => {
  const { idOrSlug }: { idOrSlug: string } = useParams({ strict: false });

  return (
    <ToggleGroup type="single" variant="merged" className={cn('gap-0', className)}>
      {['board', 'table', 'overview'].map((value) => (
        <ToggleGroupItem value={value} asChild key={value}>
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
      ))}
    </ToggleGroup>
  );
};

export default DisplayOptions;