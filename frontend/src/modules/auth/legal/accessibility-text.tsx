import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, isStrategyEnabled } from 'shared';
import { accessibilityReview, legalConfig } from '~/modules/auth/legal/legal-config';
import { LegalContact } from '~/modules/auth/legal/legal-contact';
import { LegalSection } from '~/modules/auth/legal/legal-section';
import type { AccessibilityResults } from '~/modules/auth/legal/legal-types';
import { mapOAuthProviders } from '~/modules/auth/oauth-providers';

const sections = legalConfig.accessibility.sections;
const s = (id: string) => sections.find((sec) => sec.id === id)!;

/** Joins items as prose: "a, b or c". */
const orList = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} or ${items.at(-1)}` : (items[0] ?? ''));

/** `orList` for elements: each language name carries its own `lang`, so a screen reader pronounces it right. */
const orNodes = (items: ReactNode[]) => items.flatMap((item, index) => (index === 0 ? [item] : [index === items.length - 1 ? ' or ' : ', ', item]));

/** All success criteria of the standard: every criterion ended in exactly one outcome. */
const criteriaCount = ({ supports, partiallySupports, doesNotSupport, notApplicable, notEvaluated }: AccessibilityResults) =>
  supports + partiallySupports + doesNotSupport + notApplicable + notEvaluated.length;

/** A `YYYY-MM-DD` day as "October 3, 2026". */
const longDate = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { dateStyle: 'long' });

function AccessibilityText() {
  const { t } = useTranslation();
  const lastUpdated = 'October 4, 2026';

  const appName = appConfig.name;
  const frontendUrl = appConfig.frontendUrl;
  const supportEmail = appConfig.company.supportEmail;
  const { standard, reviewedAt, provisional, results, limitations, report } = accessibilityReview;
  const notEvaluated = results?.notEvaluated ?? [];
  const conforms = limitations.length === 0 && notEvaluated.length === 0;

  const languages = appConfig.languages.map((lang) => (
    <span key={lang} lang={lang}>
      {t(`c:${lang}`)}
    </span>
  ));
  const oauthNames = mapOAuthProviders
    .filter(({ id }) => (appConfig.enabledOAuthProviders as readonly string[]).includes(id))
    .map(({ name }) => name);
  const signInMethods = [
    isStrategyEnabled('passkey') && 'a passkey (your fingerprint, face or device PIN)',
    isStrategyEnabled('magic') && 'a link sent to your email',
    isStrategyEnabled('oauth') && oauthNames.length > 0 && `your ${orList(oauthNames)} account`,
  ].filter((method) => typeof method === 'string');

  const mailLink = <a href={`mailto:${supportEmail}`}>{supportEmail}</a>;

  return (
    <div id="accessibility-content">
      <LegalSection id={s('overview').id} label={s('overview').label}>
        <p className="mb-2 pt-8 italic">Last updated: {lastUpdated}</p>
        <p>
          Something in {appName} not working for you? <Link to="/contact">Contact us</Link>.
        </p>
        <LegalContact addressOnly className="mt-8" />
      </LegalSection>

      <LegalSection id={s('commitment').id} label={s('commitment').label}>
        <p>
          This statement covers {appName} at{' '}
          <a href={frontendUrl} target="_blank" rel="noreferrer">
            {frontendUrl}
          </a>
          : the website and the app you sign in to. We want everyone to be able to use it, including people who use only a keyboard, a screen reader,
          magnification or voice control. We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA.
        </p>
        {reviewedAt ? (
          <>
            <p>
              We last reviewed {appName} against this standard on {longDate(reviewedAt)}.{' '}
              {conforms
                ? `${appName} conforms to it.`
                : `${appName} partially conforms to it: some parts do not fully meet the standard yet. They are listed under Known limitations.`}
            </p>
            {provisional && (
              <p>These results are provisional. They come from automated checks and a review by an AI agent, and a person has yet to confirm them.</p>
            )}
          </>
        ) : (
          <p>Our first full review against this standard is in progress. This page grows as each part of {appName} is checked.</p>
        )}
      </LegalSection>

      <LegalSection id={s('what-you-can-do').id} label={s('what-you-can-do').label}>
        <p>In {appName} you can:</p>
        <ul className="my-2">
          <li>Use light or dark mode. It starts in the mode your device uses, and you can switch at any time.</li>
          <li>
            Turn on more contrast, under Preferences, to draw the edges of fields, buttons and panels more strongly. If your device already asks for
            more contrast, {appName} follows it without you setting anything.
          </li>
          {languages.length > 1 && <li>Choose your language: {orNodes(languages)}.</li>}
          {signInMethods.length > 0 && <li>Sign in without a password, using {orList(signInMethods)}.</li>}
        </ul>
        {!reviewedAt && <p>We will add to this list as the review confirms more, such as keyboard and screen reader use.</p>}
      </LegalSection>

      <LegalSection id={s('known-limitations').id} label={s('known-limitations').label}>
        {limitations.length > 0 ? (
          <>
            <p>These parts of {appName} do not fully meet the standard yet:</p>
            <ul className="my-2">
              {limitations.map(({ description, criteria, workaround }) => (
                <li key={description}>
                  {description} (WCAG {criteria.join(', ')}){workaround && <> {workaround}</>}
                </li>
              ))}
            </ul>
          </>
        ) : reviewedAt ? (
          <p>Our last review found no problems. If you run into one, please tell us.</p>
        ) : (
          <p>We will list known problems here once the review is done. If you run into one before then, please tell us so we can fix it sooner.</p>
        )}
        {notEvaluated.length > 0 && (
          <>
            <p>We have not evaluated these parts of the standard yet, so problems there are not in the list above:</p>
            <ul className="my-2">
              {notEvaluated.map((criterion) => (
                <li key={criterion}>WCAG {criterion}</li>
              ))}
            </ul>
          </>
        )}
      </LegalSection>

      <LegalSection id={s('third-party-content').id} label={s('third-party-content').label}>
        <p>
          Much of what you see in {appName} is added by its users, such as text, images and uploaded files. That content is only as accessible as its
          authors make it. Some parts, such as the text editor and the file uploader, are built on components made by others. Problems in those count
          as ours: tell us and we will follow up.
        </p>
      </LegalSection>

      <LegalSection id={s('how-we-test').id} label={s('how-we-test').label}>
        <p>
          The interface of {appName} is built from components designed for keyboard and screen reader use, and automated accessibility checks run on
          those components during development.
        </p>
        {!reviewedAt && (
          <p>
            The full review combines automated scans of every page with manual testing by keyboard and with screen readers. When it is done, this
            section lists the methods, the date and the assistive technologies we used.
          </p>
        )}
        {reviewedAt && results && (
          <p>
            Our review of {longDate(reviewedAt)} covered {results.pagesAndStates} pages and states of {appName}, such as open dialogs and menus, each
            in light and dark mode. Each one was scanned automatically and checked in the browser for zoom, text spacing, small screens and keyboard
            use. We reviewed the code for what a scan cannot see, such as time limits and motion. We measured with more contrast turned on, the
            setting named above.{' '}
            {provisional
              ? 'An AI agent judged the criteria that tools cannot decide. Testing by a person, including with screen readers, is not finished yet.'
              : 'A person confirmed each result. The conformance report lists the methods in full.'}
          </p>
        )}
      </LegalSection>

      <LegalSection id={s('conformance-report').id} label={s('conformance-report').label}>
        <p>
          A conformance report, often called a VPAT®, states for each WCAG success criterion whether {appName} meets it, and explains any gaps.
          Accessibility teams and buyers use it to assess a product.
        </p>
        {results && (
          <>
            <p>
              {standard} has {criteriaCount(results)} success criteria. In our last review:
            </p>
            <ul className="my-2">
              <li>
                <strong>{results.supports}</strong> are met
              </li>
              {results.partiallySupports > 0 && (
                <li>
                  <strong>{results.partiallySupports}</strong> are partly met
                </li>
              )}
              {results.doesNotSupport > 0 && (
                <li>
                  <strong>{results.doesNotSupport}</strong> are not met
                </li>
              )}
              {results.notApplicable > 0 && (
                <li>
                  <strong>{results.notApplicable}</strong> do not apply to {appName}
                </li>
              )}
              {notEvaluated.length > 0 && (
                <li>
                  <strong>{notEvaluated.length}</strong> are not evaluated yet
                </li>
              )}
            </ul>
          </>
        )}
        {report ? (
          <p>
            {provisional
              ? `Our report follows the ${report.edition} template. It is a draft, dated ${longDate(report.date)}: the rows a person has yet to confirm are marked in it.`
              : `Our report follows the ${report.edition} template and was last updated on ${longDate(report.date)}.`}{' '}
            <a href={report.pdfUrl} download>
              Download the {provisional && 'draft '}conformance report (PDF)
            </a>
          </p>
        ) : (
          <p>We are preparing ours against {standard}. Once it is ready you can download it here.</p>
        )}
      </LegalSection>

      <LegalSection id={s('feedback').id} label={s('feedback').label}>
        <p>
          If something in {appName} does not work for you, or you need information in another format, email {mailLink}. It helps to tell us:
        </p>
        <ul className="my-2">
          <li>the page or feature</li>
          <li>what you tried to do and what happened</li>
          <li>your browser, and any assistive technology you use such as a screen reader</li>
        </ul>
      </LegalSection>
    </div>
  );
}

export { AccessibilityText };
