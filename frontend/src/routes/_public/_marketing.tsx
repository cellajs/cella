import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';

/** Preloads lazy translation namespaces before paint so non-bundled languages don't flash untranslated text. */
export const Route = createFileRoute('/_public/_marketing')({
  staticData: { isAuth: false },
  loader: () => i18n.loadNamespaces(['about', 'c']),
});
