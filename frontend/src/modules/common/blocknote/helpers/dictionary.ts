import * as blocknoteLocales from '@blocknote/core/locales';
import { userStore } from '~/modules/user/user-store';

export const getDictionary = () => {
  const user = userStore.getState().user;
  if (!user) return { ...blocknoteLocales.en };

  const locale = user.languageCode in blocknoteLocales ? blocknoteLocales[user.languageCode] : blocknoteLocales.en;

  return { ...locale };
};
