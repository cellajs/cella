import { PaperclipIcon } from 'lucide-react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { BlockNoteContentApi } from '~/modules/common/blocknote/blocknote-editor';
import { Button } from '~/modules/ui/button';

interface AddFilesButtonProps {
  /** The `contentApiRef` of the editor the files go into. */
  apiRef: RefObject<BlockNoteContentApi | null>;
  className?: string;
}

/** A form's own control for adding files to its editor: it opens the editor's upload dialog. */
export function AddFilesButton({ apiRef, className }: AddFilesButtonProps) {
  const { t } = useTranslation();
  return (
    <Button type="button" variant="ghost" className={className} onClick={() => apiRef.current?.addFiles()}>
      <PaperclipIcon />
      {t('c:add_files')}
    </Button>
  );
}
