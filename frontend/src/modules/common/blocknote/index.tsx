import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/app-specific-custom/styles.css';
import '~/modules/common/blocknote/styles.css';

import { BlockNote, type BlockNoteProps } from '~/modules/common/blocknote/editor';

// Separate styles to avoid importing them multiple times, this component is ready-to-use editor with all styles preloaded.
export const BlockNoteWithStyles = (props: BlockNoteProps) => <BlockNote {...props} />;
