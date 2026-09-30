import * as blocknoteLocales from '@blocknote/core/locales';
import { en } from '@blocknote/core/locales';
import type { CommonBlockNoteProps } from '~/modules/common/blocknote/types';
import { useUserStore } from '~/modules/user/user-store';

export const getDictionary = () => {
  const user = useUserStore.getState().user;
  if (!user) return { ...en };

  const locale = user.language in blocknoteLocales ? blocknoteLocales[user.language] : en;

  return { ...locale };
};

/**
 * Layers caller placeholders over the locale's, keyed by block type as BlockNote's own are. `title` is
 * positional, which BlockNote cannot express, so the editor renders it (styles.css) and it is left out here.
 */
export const withPlaceholders = (
  dictionary: ReturnType<typeof getDictionary>,
  placeholders: CommonBlockNoteProps['placeholders'],
) => {
  if (!placeholders) return dictionary;
  const { title, ...byType } = placeholders;
  return { ...dictionary, placeholders: { ...dictionary.placeholders, ...byType } };
};
