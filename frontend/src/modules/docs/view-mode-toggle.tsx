import { ListIcon, TableIcon } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';
import { type DocsViewMode, useDocsStore } from '~/store/docs';

interface ViewModeToggleProps {
  size?: 'xs' | 'sm' | 'default' | 'lg';
}

/**
 * Toggle between list and table view modes.
 * Updates the docs store `viewMode` when changed.
 */
export const ViewModeToggle = ({ size = 'sm' }: ViewModeToggleProps) => {
  const viewMode = useDocsStore((state) => state.viewMode);
  const setViewMode = useDocsStore((state) => state.setViewMode);

  return (
    <ToggleGroup
      type="single"
      size={size}
      variant="outline"
      value={viewMode}
      onValueChange={(newValue: DocsViewMode) => {
        if (newValue) setViewMode(newValue);
      }}
    >
      <ToggleGroupItem value="list" size={size}>
        <ListIcon className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="table" size={size}>
        <TableIcon className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
};
