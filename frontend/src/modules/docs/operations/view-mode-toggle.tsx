import { Link, useRouterState } from '@tanstack/react-router';
import { ListIcon, TableIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';

interface ViewModeToggleProps {
  size?: 'xs' | 'sm' | 'default' | 'lg';
}

export function ViewModeToggle({ size = 'default' }: ViewModeToggleProps) {
  const { t } = useTranslation();
  const isTableRoute = useRouterState({ select: (state) => state.location.pathname === '/docs/operations/table' });
  const viewMode = isTableRoute ? 'table' : 'list';

  return (
    <ToggleGroup type="single" size={size} variant="outline" value={viewMode}>
      <ToggleGroupItem value="list" size={size} aria-label={t('c:list_view')} render={<Link to="/docs/operations" />}>
        <ListIcon className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="table" size={size} aria-label={t('c:table_view')} render={<Link to="/docs/operations/table" />}>
        <TableIcon className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
