import { EllipsisVertical, Minimize2, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { TooltipButton } from '../../common/tooltip-button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../ui/dropdown-menu';

const ToolTipButtons = ({
  rolledUp,
  onSettingsClick,
  onMinimizeClick,
}: { rolledUp: boolean; onSettingsClick?: () => void; onMinimizeClick?: () => void }) => {
  const { t } = useTranslation();

  const tooltipButtons = [
    // { content: t('Comments'), icon: <MessagesSquare size={16} /> },
    { onClick: onSettingsClick, content: t('common:project_settings'), icon: <Settings size={16} /> },
    { onClick: onMinimizeClick, content: t('common:minimize'), icon: <Minimize2 size={16} /> },
  ];

  const renderButtons = () => {
    return (
      <>
        {tooltipButtons.map(({ content, icon, onClick }) => (
          <TooltipButton key={content} side="bottom" sideOffset={13} toolTipContent={content}>
            <Button variant="ghost" size="sm" className="text-sm p-2 h-8" onClick={onClick}>
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
            <Button variant="ghost" size="xs" aria-label="Tool buttons">
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
