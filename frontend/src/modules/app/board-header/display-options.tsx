import { useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { Grid2X2, Rows4, SquareKanban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';
import { cn } from '~/utils/cn';

interface Props {
  className?: string;
}

const DisplayOptions = ({ className = '' }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { idOrSlug }: { idOrSlug: string } = useParams({ strict: false });

  const handleItemChange = (value: string) => {
    navigate({
      to: `/$orgIdOrSlug/workspaces/$idOrSlug/${value}`,
      params: { idOrSlug },
    });
  };

  return (
    <ToggleGroup type="single" variant="merged" className={cn('gap-0', className)} onValueChange={handleItemChange}>
      {['board', 'table'].map((value) => (
        <TooltipButton key={value} toolTipContent={t(`common:${value}_view`)}>
          <ToggleGroupItem
            key={value}
            value={value}
            data-current-option={pathname.includes(value)}
            className="hover:bg-accent/50 text-accent-foreground/70 data-[current-option=true]:bg-accent "
          >
            {value === 'board' && <SquareKanban size={16} />}
            {value === 'table' && <Rows4 size={16} />}
            {value === 'overview' && <Grid2X2 size={16} />}
          </ToggleGroupItem>
        </TooltipButton>
      ))}
    </ToggleGroup>
  );
};

export default DisplayOptions;
