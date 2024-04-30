import { cn } from '~/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { SquareKanban, Rows4, Grid2X2 } from 'lucide-react';
import { useContext } from 'react';
import { ProjectsContext } from '.';

interface Props {
  className?: string;
}

const DisplayOptions = ({ className = '' }: Props) => {
  const { setDisplayMode } = useContext(ProjectsContext);

  return (
    <ToggleGroup type="single" variant="merged" className={cn('gap-0', className)} onValueChange={setDisplayMode}>
      <ToggleGroupItem value="board">
        <SquareKanban size={16} />
      </ToggleGroupItem>
      <ToggleGroupItem value="list">
        <Rows4 size={16} />
      </ToggleGroupItem>
      <ToggleGroupItem value="board">
        <Grid2X2 size={16} />
      </ToggleGroupItem>
    </ToggleGroup>
  );
};

export default DisplayOptions;
