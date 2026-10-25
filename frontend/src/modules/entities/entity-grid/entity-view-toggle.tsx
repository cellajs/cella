import { LayoutGridIcon, Rows4Icon } from 'lucide-react';
import { ViewToggle, type ViewToggleMode } from '~/modules/common/view-toggle';
import type { EntityViewMode } from '~/modules/entities/entity-grid/view-mode';

const modes: readonly ViewToggleMode<EntityViewMode>[] = [
  { value: 'grid', icon: LayoutGridIcon, label: 'c:grid_view' },
  { value: 'table', icon: Rows4Icon, label: 'c:table_view' },
];

/** Grid or table, for the grid bar's `viewToggle` and the table bar's `controls`; the route declares `view` with `entityViewSearchParam`. */
export function EntityViewToggle() {
  return <ViewToggle modes={modes} />;
}
