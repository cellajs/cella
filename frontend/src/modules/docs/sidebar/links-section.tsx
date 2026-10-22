import { Link } from '@tanstack/react-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { DocsSidebarSection } from '~/modules/docs/sidebar/docs-sidebar-section';
import { closeSidebarSheetAndNavigate } from '~/modules/docs/sidebar/docs-sidebar-sheet';
import { getDocPage } from '~/modules/page/content';
import { Button } from '~/modules/ui/button';
import { tw } from '~/utils/tw';

interface LinksSectionProps {
  label: string;
}

const rowClass = tw('w-full justify-start px-3 font-medium lowercase');

export function LinksSection({ label }: LinksSectionProps) {
  const { t } = useTranslation();
  const contactRef = useRef<HTMLButtonElement | null>(null);
  const hasStatusPage = !!appConfig.statusUrl?.trim();
  // Only link the llms page when the content file exists.
  const hasLlmsPage = !!getDocPage('llms');

  return (
    <DocsSidebarSection label={label}>
      {hasStatusPage && (
        <Button variant="ghost" className={rowClass} onClick={() => window.open(appConfig.statusUrl, '_blank', 'noopener,noreferrer')}>
          {t('c:status')}
        </Button>
      )}

      <Button ref={contactRef} variant="ghost" className={rowClass} onClick={() => contactFormHandler(contactRef)}>
        {t('c:contact_us')}
      </Button>

      <Button variant="ghost" className={rowClass} render={<Link to="/docs/overview" draggable={false} onClick={closeSidebarSheetAndNavigate} />}>
        openapi.json
      </Button>

      {hasLlmsPage && (
        <Button
          variant="ghost"
          className="w-full justify-start px-3 font-medium"
          render={<Link to="/docs/page/$" params={{ _splat: 'llms' }} draggable={false} onClick={closeSidebarSheetAndNavigate} />}
        >
          llms.txt
        </Button>
      )}
    </DocsSidebarSection>
  );
}
