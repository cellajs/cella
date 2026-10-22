import * as blocknoteLocales from '@blocknote/core/locales';
import { en } from '@blocknote/core/locales';
import { userStore } from '~/modules/user/user-store';

export const getDictionary = () => {
  const user = userStore.getState().user;
  if (!user) return { ...en };

  const locale = user.language in blocknoteLocales ? blocknoteLocales[user.language] : en;

  return { ...locale };
};
