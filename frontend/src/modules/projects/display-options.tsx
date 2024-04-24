import { cn } from '~/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { SquareKanban, Rows4, Grid2X2 } from 'lucide-react';

interface Props {
  className?: string;
}

const DisplayOptions = ({ className = '' }: Props) => {

  return (
    <ToggleGroup type="single" variant="merged" className={cn('gap-0', className)}>
      <ToggleGroupItem value="a"><SquareKanban size={16} /></ToggleGroupItem>
      <ToggleGroupItem value="b"><Rows4 size={16} /></ToggleGroupItem>
      <ToggleGroupItem value="c"><Grid2X2 size={16} /></ToggleGroupItem>
    </ToggleGroup>
  );
};

export default DisplayOptions;
