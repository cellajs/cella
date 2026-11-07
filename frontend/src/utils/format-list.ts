import i18n from 'i18next';

/** Items as one phrase in the active language: "a, b and c", or with `type` 'disjunction' "a, b or c". */
export const formatList = (items: string[], type: Intl.ListFormatType = 'conjunction') =>
  new Intl.ListFormat(i18n.resolvedLanguage, { type }).format(items);
