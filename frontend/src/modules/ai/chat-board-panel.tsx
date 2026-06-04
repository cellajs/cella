import { BotIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOrganizationLayoutContext } from '~/hooks/use-route-context';
import { usePanelDragHandle } from '~/modules/common/board/board-drag';
import { BoardPanelContent } from '~/modules/common/board/board-layout';
import { useBoardStore } from '~/modules/common/board/board-store';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { ChatPanel } from './chat-panel';

/**
 * AI Chat board panel for board component.
 */
export const ChatBoardPanel = () => {
  const { t } = useTranslation();
  const { organization, tenantId } = useOrganizationLayoutContext();
  const isCollapsed = useBoardStore((state) => state.panelCollapseState['ai-chat']);
  const panelDrag = usePanelDragHandle();

  return (
    <BoardPanelContent
      isCollapsed={!!isCollapsed}
      collapsedContent={
        <Button
          type="button"
          variant="ghost"
          ref={panelDrag?.registerHandle}
          className={cn(
            'flex h-auto min-h-13 w-12.5 items-center justify-center p-0 hover:bg-transparent',
            panelDrag && 'cursor-grab active:cursor-grabbing',
          )}
          aria-roledescription={panelDrag ? t('c:sortable') : undefined}
          aria-label={
            panelDrag
              ? t('c:sortable_position', {
                  name: t('c:ai_assistant'),
                  position: panelDrag.index + 1,
                  total: panelDrag.total,
                })
              : t('c:ai_assistant')
          }
          onKeyDown={panelDrag?.onKeyDown}
          onClick={panelDrag?.onToggleCollapsed}
        >
          <BotIcon size={16} />
        </Button>
      }
    >
      <div className="relative flex max-w-full flex-1 shrink-0 snap-center flex-col rounded-md rounded-b-none bg-transparent opacity-100 sm:h-[calc(100vh-78px)] sm:border">
        <div className="flex min-h-13 items-center justify-between gap-2 truncate border-b bg-card px-2 font-semibold text-sm">
          <Button
            type="button"
            variant="ghost"
            ref={panelDrag?.registerHandle}
            className={cn(
              'flex h-8 items-center gap-2 truncate p-2 hover:bg-transparent',
              panelDrag && 'cursor-grab active:cursor-grabbing',
            )}
            aria-roledescription={panelDrag ? t('c:sortable') : undefined}
            aria-label={
              panelDrag
                ? t('c:sortable_position', {
                    name: t('c:ai_assistant'),
                    position: panelDrag.index + 1,
                    total: panelDrag.total,
                  })
                : t('c:ai_assistant')
            }
            onKeyDown={panelDrag?.onKeyDown}
            onClick={panelDrag?.onToggleCollapsed}
          >
            <BotIcon size={16} />
            <div className="truncate">{t('c:ai_assistant')}</div>
          </Button>
        </div>

        <ChatPanel tenantId={tenantId} organizationId={organization.id} />
      </div>
    </BoardPanelContent>
  );
};
