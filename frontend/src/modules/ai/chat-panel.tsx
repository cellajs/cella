import { BotIcon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { ChatInput } from './chat-input';
import { ChatMessages } from './chat-messages';
import { useAiChat } from './use-ai-chat';

interface ChatPanelProps {
  tenantId: string;
  organizationId: string;
  onClose?: () => void;
}

export function ChatPanel({ tenantId, organizationId, onClose }: ChatPanelProps) {
  const { t } = useTranslation();

  const { messages, sendMessage, isLoading, error, stop } = useAiChat({ tenantId, organizationId });

  const handleSend = (content: string) => {
    sendMessage(content);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {/* Header — only shown when used standalone (not in a sheet) */}
      {onClose && (
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <BotIcon size={16} className="text-primary" />
            <h3 className="font-medium text-sm">{t('c:ai_assistant')}</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7" aria-label={t('c:close')}>
            <XIcon size={14} />
          </Button>
        </div>
      )}

      {/* Messages */}
      <ChatMessages messages={messages} isLoading={isLoading} />

      {/* Error */}
      {error && (
        <div className="mx-3 mb-1 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">{error.message}</div>
      )}

      {/* Input */}
      <ChatInput onSend={handleSend} onStop={stop} isLoading={isLoading} />
    </div>
  );
}
