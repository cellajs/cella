import type { CustomBlockTypes, SlashItemKeys } from '~/modules/common/blocknote/types';

export const baseBlocknoteTypeToKeys = {
  table: ['table'],
  notify: ['notify'],
  paragraph: ['paragraph'],
  heading: ['heading', 'heading_2', 'heading_3', 'heading_4', 'heading_5', 'heading_6', 'toggle_heading', 'toggle_heading_2', 'toggle_heading_3'],
  quote: ['quote'],
  codeBlock: ['code_block'],
  bulletListItem: ['bullet_list'],
  numberedListItem: ['numbered_list'],
  checkListItem: ['check_list'],
  file: ['file'],
  image: ['image'],
  video: ['video'],
  audio: ['audio'],
  emoji: ['emoji'],
  toggleListItem: ['toggle_list'],
} satisfies Record<CustomBlockTypes, SlashItemKeys[]>;
