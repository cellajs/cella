import { useMutation } from '@tanstack/react-query';
import { Check, Pencil, X } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { Button } from '~/modules/ui/button';

const BlockNote = lazy(() => import('~/modules/common/blocknote'));

interface DescriptionEditorProps {
  operationId: string;
  initialDescription: string;
  onUpdate?: (newDescription: string) => void;
}

/**
 * Convert plain text to BlockNote JSON format
 */
function textToBlockNoteContent(text: string): string {
  if (!text) return '';

  // Split by double newlines for paragraphs
  const paragraphs = text.split(/\n\n+/).filter(Boolean);

  const blocks = paragraphs.map((paragraph, index) => ({
    id: `block-${index}`,
    type: 'paragraph',
    props: {},
    content: [{ type: 'text', text: paragraph.replace(/\n/g, ' ').trim() }],
    children: [],
  }));

  return JSON.stringify(blocks);
}

/**
 * Convert BlockNote JSON back to plain text
 */
function blockNoteContentToText(content: string): string {
  if (!content) return '';

  try {
    const blocks = JSON.parse(content);
    return blocks
      .map((block: { content?: Array<{ text?: string }> }) => {
        if (!block.content) return '';
        return block.content.map((item: { text?: string }) => item.text || '').join('');
      })
      .filter(Boolean)
      .join('\n\n');
  } catch {
    return content;
  }
}

/**
 * Inline editor for OpenAPI descriptions using BlockNote.
 * Only available in development mode via Vite dev server.
 */
export function DescriptionEditor({ operationId, initialDescription, onUpdate }: DescriptionEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [blockContent, setBlockContent] = useState(() => textToBlockNoteContent(initialDescription));

  // Only show edit button in development mode
  const isDev = import.meta.env.DEV;

  const { mutate: updateDescription, isPending } = useMutation<
    { success: boolean; filePath?: string; error?: string },
    Error,
    { operationId: string; description: string }
  >({
    mutationFn: async ({ operationId, description }) => {
      // Call the Vite dev server endpoint
      const response = await fetch('/__openapi-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId, description }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update description');
      }

      return response.json();
    },
    onSuccess: (result, { description }) => {
      if (result.success) {
        toaster('Description updated in source code', 'success');
        onUpdate?.(description);
        setIsEditing(false);
      } else {
        toaster(result.error || 'Failed to update description', 'error');
      }
    },
    onError: (error) => {
      toaster(error.message || 'Failed to update description', 'error');
    },
  });

  const handleSave = () => {
    const plainText = blockNoteContentToText(blockContent);
    updateDescription({ operationId, description: plainText });
  };

  const handleCancel = () => {
    setBlockContent(textToBlockNoteContent(initialDescription));
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div className="group relative">
        <p className="text-muted-foreground whitespace-pre-wrap pr-8">{initialDescription || 'No description'}</p>
        {isDev && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
            onClick={() => setIsEditing(true)}
            title="Edit description"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Suspense fallback={<Spinner className="my-4 h-5 w-5 opacity-50" noDelay />}>
        <BlockNote
          id={`description-editor-${operationId}`}
          type="create"
          defaultValue={blockContent}
          updateData={setBlockContent}
          className="min-h-24 pl-10 pr-6 p-3 border-input ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border text-sm"
          trailingBlock={false}
          sideMenu={false}
          excludeBlockTypes={[
            'heading',
            'codeBlock',
            'table',
            'notify',
            'bulletListItem',
            'checkListItem',
            'numberedListItem',
          ]}
          excludeFileBlockTypes={['image', 'video', 'audio', 'file']}
        />
      </Suspense>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          <Check className="h-3 w-3 mr-1" />
          {isPending ? 'Saving...' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCancel} disabled={isPending}>
          <X className="h-3 w-3 mr-1" />
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">This will update the source code in your backend route file.</p>
    </div>
  );
}
