// biome-ignore-all lint/suspicious/noArrayIndexKey: message.parts is an append-only stream from the AI SDK; parts have no stable id, but the list never reorders within a message.
import type { UIMessage } from '@tanstack/ai-react';
import { ArrowDownIcon, BotIcon } from 'lucide-react';
import { useMemo, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStickToBottom } from 'use-stick-to-bottom';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { Button } from '~/modules/ui/button';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { cn } from '~/utils/cn';

interface ChatMessagesProps {
  messages: UIMessage[];
  isLoading: boolean;
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const { scrollRef, contentRef, isAtBottom, scrollToBottom } = useStickToBottom({
    resize: 'smooth',
    initial: 'instant',
  });

  // Bridge ScrollArea's RefObject viewportRef to the library's callback scrollRef.
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const bridgedViewportRef = useMemo(
    () => ({
      get current() {
        return viewportRef.current;
      },
      set current(node: HTMLDivElement | null) {
        viewportRef.current = node;
        scrollRef(node);
      },
    }),
    [scrollRef],
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1" viewportRef={bridgedViewportRef}>
        <div ref={contentRef} className="flex min-h-full flex-col space-y-4 px-3 py-4">
          {messages.length === 0 && !isLoading && <ContentPlaceholder icon={BotIcon} title="c:ai_empty_conversation" />}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {isLoading && messages.at(-1)?.role !== 'assistant' && (
            <div className="flex items-start gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <BotIcon size={14} className="text-primary" />
              </div>
              <div className="animate-pulse text-muted-foreground text-sm">Thinking…</div>
            </div>
          )}
        </div>
      </ScrollArea>

      {!isAtBottom && (
        <Button
          variant="secondary"
          size="icon"
          onClick={() => scrollToBottom()}
          className="absolute bottom-2 left-1/2 h-7 w-7 -translate-x-1/2 rounded-full shadow-md"
          aria-label="Scroll to bottom"
        >
          <ArrowDownIcon size={14} />
        </Button>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex items-start gap-2', isUser && 'flex-row-reverse')}>
      <div className={cn('min-w-0 max-w-[85%] select-text', isUser && 'text-right')}>
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return isUser ? (
              <div key={`text-${i}`} className="inline-block rounded-lg bg-accent px-3 py-2 text-sm">
                {part.content}
              </div>
            ) : (
              <div key={`text-${i}`} className="prose prose-sm dark:prose-invert max-w-none">
                <Markdown remarkPlugins={[remarkGfm]}>{part.content}</Markdown>
              </div>
            );
          }

          if (part.type === 'thinking') {
            return (
              <details key={`thinking-${i}`} className="mb-1 text-muted-foreground text-xs">
                <summary className="cursor-pointer">Thinking…</summary>
                <p className="mt-1 border-muted border-l-2 pl-2">{part.content}</p>
              </details>
            );
          }

          if (part.type === 'tool-call') {
            return (
              <div key={`tool-${i}`} className="my-1 rounded bg-muted/50 px-2 py-1 font-mono text-xs">
                <span className="text-muted-foreground">Tool: </span>
                <span>{part.name}</span>
                {part.state === 'input-complete' && <span className="ml-1 text-green-600">✓</span>}
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
