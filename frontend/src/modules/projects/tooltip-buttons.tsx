import { Button } from '~/modules/ui/button';
import { TooltipButton } from '../common/tooltip-button';
import { Footprints, Maximize2, Settings, EllipsisVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu';

const ToolTipButtons = ({ rolledUp }: { rolledUp: boolean }) => {
  const { t } = useTranslation();

  const tooltipButtons = [
    { content: t('Show velocity'), icon: <Footprints size={16} /> },
    { content: t('Project view'), icon: <Maximize2 size={16} /> },
    { content: t('Project settings'), icon: <Settings size={16} /> },
  ];

  const renderButtons = () => {
    return (
      <>
        {tooltipButtons.map(({ content, icon }) => (
          <TooltipButton key={content} side="bottom" sideOffset={13} toolTipContent={content}>
            <Button variant="ghost" size="sm" className="rounded text-sm p-2 h-8">
              {icon}
            </Button>
          </TooltipButton>
        ))}
      </>
    );
  };

  return (
    <>
      {rolledUp ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Tool buttons">
              <EllipsisVertical size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-14">
            <div className="flex flex-col">{renderButtons()}</div>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        renderButtons()
      )}
    </>
  );
};

export default ToolTipButtons;
