import { Link } from '@tanstack/react-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { getDocPage } from '~/modules/page/content';
import { Button } from '~/modules/ui/button';
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '~/modules/ui/sidebar';

interface LinksSectionProps {
  label: string;
  onClose: () => void;
}

const rowClass = 'w-full justify-start px-3 font-medium lowercase';

/**
 * Sidebar section with plain link/action rows: status page, contact dialog, sign in,
 * the OpenAPI spec viewer and the llms.txt page (mirrors the menu-sheet info section).
 */
export function LinksSection({ label, onClose }: LinksSectionProps) {
  const { t } = useTranslation();
  const contactRef = useRef<HTMLButtonElement | null>(null);
  const hasStatusPage = !!appConfig.statusUrl?.trim();
  // Fork-safe: only link the llms page when the content file exists
  const hasLlmsPage = !!getDocPage('llms');

  return (
    <SidebarGroup>
      <div className="flex items-center gap-3 px-4 pr-1 pb-1">
        <SidebarGroupLabel className="p-0 lowercase opacity-75">{label}</SidebarGroupLabel>
      </div>
      <SidebarGroupContent>
        {/* Inner SidebarGroup mirrors the other sections' wrappers for alignment */}
        <SidebarGroup className="flex flex-col gap-1 p-1 pt-0">
          {hasStatusPage && (
            <Button
              variant="ghost"
              className={rowClass}
              onClick={() => window.open(appConfig.statusUrl, '_blank', 'noopener,noreferrer')}
            >
              {t('c:status')}
            </Button>
          )}

          <Button ref={contactRef} variant="ghost" className={rowClass} onClick={() => contactFormHandler(contactRef)}>
            {t('c:contact_us')}
          </Button>

          <Button
            variant="ghost"
            className={rowClass}
            render={<Link to="/auth/authenticate" preload={false} draggable={false} onClick={onClose} />}
          >
            {t('c:sign_in')}
          </Button>

          <Button
            variant="ghost"
            className={rowClass}
            render={<Link to="/docs/overview" draggable={false} onClick={onClose} />}
          >
            openapi.json
          </Button>

          {hasLlmsPage && (
            <Button
              variant="ghost"
              className="w-full justify-start px-3 font-medium"
              render={<Link to="/docs/page/$" params={{ _splat: 'llms' }} draggable={false} onClick={onClose} />}
            >
              llms.txt
            </Button>
          )}
        </SidebarGroup>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
