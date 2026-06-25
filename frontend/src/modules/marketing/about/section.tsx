import { Trans, useTranslation } from 'react-i18next';

interface AboutSectionProps {
  /** When set, renders a `spy-<sectionId>` anchor for scroll-spy nav (used on the about page). */
  sectionId?: string;
  title?: string;
  text?: string;
  /** Optional components to interpolate into `text` (e.g. links) via <Trans>. */
  textComponents?: readonly React.ReactElement[] | Record<string, React.ReactElement>;
  children?: React.ReactNode;
  alternate?: boolean; // Optional prop for background styling
}

interface AboutSectionHeaderProps {
  title?: string;
  text?: string;
  textComponents?: readonly React.ReactElement[] | Record<string, React.ReactElement>;
  className?: string;
}

export const AboutSectionHeader = ({ title, text, textComponents, className = '' }: AboutSectionHeaderProps) => {
  const { t } = useTranslation();

  if (!title && !text) {
    return null;
  }

  return (
    <div className={`mx-auto flex max-w-3xl flex-col justify-center gap-4 ${className}`.trim()}>
      {title && (
        <h2 className="font-heading font-semibold text-3xl leading-[1.1] sm:text-center md:text-4xl">{t(title)}</h2>
      )}
      {text && (
        <p className="text-muted-foreground leading-normal sm:text-center sm:text-lg sm:leading-7">
          <Trans i18nKey={text} components={textComponents} />
        </p>
      )}
    </div>
  );
};

export const AboutSection = ({
  title,
  text,
  textComponents,
  sectionId,
  children,
  alternate = false,
}: AboutSectionProps) => {
  const backgroundClass = alternate ? 'bg-accent/40 dark:bg-transparent' : '';

  return (
    <section
      id={sectionId ? `spy-${sectionId}` : undefined}
      className={`container max-w-none overflow-hidden px-4 py-8 md:py-12 lg:py-24 ${backgroundClass}`}
    >
      <AboutSectionHeader title={title} text={text} textComponents={textComponents} className="mb-12" />
      {children}
    </section>
  );
};
