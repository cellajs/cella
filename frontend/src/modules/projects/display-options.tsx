import { cn } from '~/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { SquareKanban, Rows4, Grid2X2 } from 'lucide-react';
import { useWorkspaceStore } from '~/store/workspace';
import { useContext } from 'react';
import { WorkspaceContext } from '../workspaces';

interface Props {
  className?: string;
}

const DisplayOptions = ({ className = '' }: Props) => {
  const { workspaces, changeDisplayOption } = useWorkspaceStore();
  const { workspace } = useContext(WorkspaceContext);

  const handleChangeDisplayOption = (value: string | undefined) => {
    const newValue = (value ? value : 'table') as 'table' | 'board' | 'list';

    changeDisplayOption(workspace.id, newValue);
  };

  return (
    <ToggleGroup
      type="single"
      variant="merged"
      value={workspaces[workspace.id].displayOption}
      className={cn('gap-0', className)}
      onValueChange={handleChangeDisplayOption}
    >
      <ToggleGroupItem value="board">
        <SquareKanban size={16} />
      </ToggleGroupItem>
      <ToggleGroupItem value="list">
        <Rows4 size={16} />
      </ToggleGroupItem>
      <ToggleGroupItem value="table">
        <Grid2X2 size={16} />
      </ToggleGroupItem>
    </ToggleGroup>
  );
};
export default DisplayOptions;
