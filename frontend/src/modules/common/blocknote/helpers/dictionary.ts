import * as blocknoteLocales from '@blocknote/core/locales';
import { useUserStore } from '~/store/user';

export const getDictionary = () => {
  const user = useUserStore.getState().user;

  const locale = user.language in blocknoteLocales ? blocknoteLocales[user.language] : blocknoteLocales.en;

  return { ...locale };
};
