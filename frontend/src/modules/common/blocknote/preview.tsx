import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { type MouseEventHandler, useEffect, useMemo, useRef } from 'react';

import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { compareIsContentSame, getParsedContent } from '~/modules/common/blocknote/helpers';
import { openAttachment } from '~/modules/common/blocknote/helpers/open-attachment';
import { shadCNComponents } from '~/modules/common/blocknote/helpers/shad-cn';
import type { BaseBlockNoteProps } from '~/modules/common/blocknote/types';
import { useUIStore } from '~/store/ui';

import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/app-specific-custom/styles.css';
import '~/modules/common/blocknote/styles.css';

export const BlockNotePreview = ({
  id,
  defaultValue = '',
  className = '',
  altClickOpensPreview = false,
  trailingBlock = true,
}: BaseBlockNoteProps) => {
  const mode = useUIStore((state) => state.mode);
  const blockNoteRef = useRef(null);

  const editor = useCreateBlockNote({ schema: customSchema, trailingBlock });

  const handleClick: MouseEventHandler = (event) => openAttachment(event, editor, altClickOpensPreview, blockNoteRef);

  const passedContent = useMemo(() => getParsedContent(defaultValue), [defaultValue]);

  useEffect(() => {
    const currentContent = JSON.stringify(editor.document);
    if (compareIsContentSame(currentContent, defaultValue)) return;

    // TODO(BLOCKING) (https://github.com/TypeCellOS/BlockNote/issues/1513)
    queueMicrotask(() => {
      if (passedContent === undefined) editor.removeBlocks(editor.document);
      else editor.replaceBlocks(editor.document, passedContent);
    });
  }, [passedContent]);

  return (
    <BlockNoteView
      id={id}
      ref={blockNoteRef}
      data-color-scheme={mode}
      shadCNComponents={shadCNComponents}
      theme={mode}
      editor={editor}
      editable={false}
      onClick={handleClick}
      className={className}
    />
  );
};
