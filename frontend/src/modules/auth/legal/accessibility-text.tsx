import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, isStrategyEnabled } from 'shared';
import { accessibilityReview } from '~/modules/auth/legal/legal-config';
import { SupportEmailLink } from '~/modules/auth/legal/legal-contact';
import { LegalSection } from '~/modules/auth/legal/legal-section';
import type { AccessibilityResults } from '~/modules/auth/legal/legal-types';
import { enabledOAuthProviders } from '~/modules/auth/oauth-providers';

/** Joins items as prose: "a, b and c" or "a, b or c". */
const listed = (items: string[], conjunction: 'and' | 'or') =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1)}` : (items[0] ?? '');

/** `listed` for elements: each language name carries its own `lang`, so a screen reader pronounces it right. */
const orNodes = (items: ReactNode[]) => items.flatMap((item, index) => (index === 0 ? [item] : [index === items.length - 1 ? ' or ' : ', ', item]));

/** The outcome counts as one clause, "43 are met, 3 partly and 6 do not apply", out of all criteria of the standard. */
const outcomes = ({ supports, partiallySupports, doesNotSupport, notApplicable, notEvaluated }: AccessibilityResults) => {
  const total = supports + partiallySupports + doesNotSupport + notApplicable + notEvaluated.length;
  const parts = [
    `${supports} are met`,
    partiallySupports > 0 && `${partiallySupports} partly`,
    doesNotSupport > 0 && `${doesNotSupport} not`,
    notApplicable > 0 && `${notApplicable} do not apply`,
    notEvaluated.length > 0 && `${notEvaluated.length} are not evaluated yet`,
  ].filter((part) => typeof part === 'string');
  return `Of the ${total} criteria, ${listed(parts, 'and')}.`;
};

/** A `YYYY-MM-DD` day as "October 3, 2026". */
const longDate = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { dateStyle: 'long' });

export function AccessibilityText() {
  const { t } = useTranslation();

  const appName = appConfig.name;
  const frontendUrl = appConfig.frontendUrl;
  const { standard, reviewedAt, provisional, results, limitations, report } = accessibilityReview;
  const notEvaluated = results?.notEvaluated ?? [];
  const conforms = limitations.length === 0 && notEvaluated.length === 0;

  const languages = appConfig.languages.map((lang) => (
    <span key={lang} lang={lang}>
      {t(`c:${lang}`)}
    </span>
  ));
  const oauthNames = enabledOAuthProviders.map(({ name }) => name);
  const signInMethods = [
    isStrategyEnabled('passkey') && 'a passkey',
    isStrategyEnabled('magic') && 'a link sent to your email',
    isStrategyEnabled('oauth') && oauthNames.length > 0 && `your ${listed(oauthNames, 'or')} account`,
  ].filter((method) => typeof method === 'string');

  return (
    <div id="accessibility-content">
      <LegalSection subject="accessibility" id="overview" lastUpdated="October 15, 2026">
        <p>
          This statement covers the {appName} website and app at{' '}
          <a href={frontendUrl} target="_blank" rel="noreferrer">
            {frontendUrl}
          </a>
          . We want everyone to be able to use them, also with only a keyboard, a screen reader, magnification or voice control, and aim to meet{' '}
          {standard}.{' '}
          {reviewedAt
            ? `Our review of ${longDate(reviewedAt)} found that ${appName} ${conforms ? 'meets it' : 'partly meets it; the gaps are listed under Known limitations'}.`
            : 'Our first full review against it is in progress.'}
          {provisional &&
            ' These results are provisional: an AI agent judged what tools cannot decide, and testing by a person, including with screen readers, is not finished yet.'}
        </p>
        <p>
          Something not working for you, or need information in another format? Email <SupportEmailLink /> with the page, what happened, and your
          browser and any assistive technology.
        </p>
      </LegalSection>

      <LegalSection subject="accessibility" id="what-you-can-do">
        <ul>
          <li>Use light or dark mode. It starts in the mode your device uses.</li>
          <li>
            Turn on more contrast under Preferences, in the menu: fields, buttons and panels get stronger edges, messages stay until you close them,
            and a click on a drag handle opens a menu that moves its item, so nothing needs dragging. When your device asks for more contrast,{' '}
            {appName} follows it, also before you sign in.
          </li>
          <li>Move an item in a list without dragging: focus its drag handle and press the arrow keys, then Tab or Escape to go on.</li>
          <li>
            Open the menu with Alt + M, search with Ctrl + K and your account with Alt + A (Option and ⌘ on a Mac). Every shortcut needs one of these
            keys, so typing and voice control do not set one off by accident.
          </li>
          {languages.length > 1 && <li>Choose your language: {orNodes(languages)}.</li>}
          {signInMethods.length > 0 && <li>Sign in without a password, using {listed(signInMethods, 'or')}.</li>}
        </ul>
      </LegalSection>

      <LegalSection subject="accessibility" id="known-limitations">
        {limitations.length > 0 ? (
          <ul>
            {limitations.map(({ description, criteria, workaround }) => (
              <li key={description}>
                {description} (WCAG {criteria.join(', ')}){workaround && <> {workaround}</>}
              </li>
            ))}
          </ul>
        ) : (
          <p>{reviewedAt ? 'Our last review found none.' : 'We list them here once the review is done.'} If you run into one, please tell us.</p>
        )}
        {notEvaluated.length > 0 && <p>Not evaluated yet: WCAG {notEvaluated.join('; ')}.</p>}
        <p>
          Text, images and files that users add are as accessible as their authors make them. Problems in parts built by others, such as the text
          editor, count as ours.
        </p>
      </LegalSection>

      <LegalSection subject="accessibility" id="how-we-test">
        {reviewedAt && results ? (
          <p>
            We checked {results.pagesAndStates} pages and states, such as open dialogs and menus, in light and dark mode and with more contrast turned
            on. Each was scanned automatically and tested in the browser for zoom, text spacing, small screens and keyboard use; the code was reviewed
            for what a scan cannot see, such as time limits and motion. {outcomes(results)}
          </p>
        ) : (
          <p>The full review, with scans of every page and testing by keyboard and screen reader, is in progress.</p>
        )}
        {report && (
          <p>
            <a href={report.pdfUrl} download>
              Download the {provisional && 'draft '}conformance report
            </a>{' '}
            ({report.edition}, PDF).
          </p>
        )}
      </LegalSection>
    </div>
  );
}
