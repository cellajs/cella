import type { ReactElement, ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { cn } from '~/utils/cn';

interface AboutSectionHeaderProps {
  title?: TKey;
  text?: TKey;
  /** Elements `<Trans>` interpolates into `text`, such as links. */
  textComponents?: readonly ReactElement[] | Record<string, ReactElement>;
  className?: string;
}

interface AboutSectionProps extends Omit<AboutSectionHeaderProps, 'className'> {
  /** Sets the section's id to `spy-<sectionId>`, which the scroll spy observes. */
  sectionId?: string;
  children?: ReactNode;
  alternate?: boolean;
}

/** @public */
export function AboutSectionHeader({ title, text, textComponents, className }: AboutSectionHeaderProps) {
  const { t } = useTranslation();

  if (!title && !text) return null;

  return (
    <div className={cn('mx-auto flex max-w-3xl flex-col gap-4', className)}>
      {title && <h2 className="font-heading font-semibold text-2xl leading-[1.1] sm:text-center sm:text-3xl md:text-4xl">{t(title)}</h2>}
      {text && (
        <p className="text-muted-foreground sm:text-center sm:text-lg sm:leading-7">
          <Trans i18nKey={text as never} components={textComponents} />
        </p>
      )}
    </div>
  );
}

interface AboutStatementProps {
  text: TKey;
  className?: string;
}

/** Large centered statement: muted text whose `<strong>` parts carry the message in the foreground color. */
export function AboutStatement({ text, className }: AboutStatementProps) {
  return (
    <p
      className={cn(
        'mx-auto max-w-3xl text-balance text-center font-semibold text-2xl text-muted-foreground leading-tight md:text-3xl lg:text-4xl',
        className,
      )}
    >
      <Trans i18nKey={text as never} components={{ strong: <strong className="font-semibold text-foreground" /> }} />
    </p>
  );
}

export function AboutSection({ title, text, textComponents, sectionId, children, alternate }: AboutSectionProps) {
  return (
    <section
      id={sectionId ? `spy-${sectionId}` : undefined}
      className={cn('overflow-hidden px-4 py-8 md:py-12 lg:py-20', alternate && 'bg-accent/40 dark:bg-transparent')}
    >
      <AboutSectionHeader title={title} text={text} textComponents={textComponents} className="mb-12" />
      {children}
    </section>
  );
}
