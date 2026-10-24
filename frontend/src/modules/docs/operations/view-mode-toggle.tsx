import { Link, useRouterState } from '@tanstack/react-router';
import { ListIcon, TableIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';

export function ViewModeToggle() {
  const { t } = useTranslation();
  const isTableRoute = useRouterState({ select: (state) => state.location.pathname === '/docs/operations/table' });
  const viewMode = isTableRoute ? 'table' : 'list';

  return (
    <ToggleGroup type="single" variant="outline" value={viewMode}>
      <ToggleGroupItem value="list" aria-label={t('c:list_view')} render={<Link to="/docs/operations" draggable={false} />}>
        <ListIcon className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="table" aria-label={t('c:table_view')} render={<Link to="/docs/operations/table" draggable={false} />}>
        <TableIcon className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
