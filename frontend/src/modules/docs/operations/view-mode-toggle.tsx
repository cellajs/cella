import { Link, useRouterState } from '@tanstack/react-router';
import { ListIcon, TableIcon } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';

interface ViewModeToggleProps {
  size?: 'xs' | 'sm' | 'default' | 'lg';
}

/**
 * Toggle between list and table view modes.
 * Navigates between /docs/operations (list) and /docs/operations/table (table) routes.
 */
export const ViewModeToggle = ({ size = 'default' }: ViewModeToggleProps) => {
  const { location } = useRouterState();
  const isTableRoute = location.pathname === '/docs/operations/table';
  const viewMode = isTableRoute ? 'table' : 'list';

  return (
    <ToggleGroup type="single" size={size} variant="outline" value={viewMode}>
      <ToggleGroupItem value="list" size={size} asChild>
        <Link to="/docs/operations">
          <ListIcon className="size-4" />
        </Link>
      </ToggleGroupItem>
      <ToggleGroupItem value="table" size={size} asChild>
        <Link to="/docs/operations/table">
          <TableIcon className="size-4" />
        </Link>
      </ToggleGroupItem>
    </ToggleGroup>
  );
};
