import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { LtiResourceLink } from 'sdk';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { Spinner } from '~/modules/common/spinner';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import { answerStorageMessage, type PlatformStorage } from '~/modules/lti-platform/platform-storage';
import { type ResourceLinkChannel, useStartLtiLaunchMutation } from '~/modules/lti-platform/query';
import { Button } from '~/modules/ui/button';
import { getErrorInfo } from '~/utils/get-error-info';

interface LtiLaunchFrameProps {
  channel: ResourceLinkChannel;
  resourceLink: Pick<LtiResourceLink, 'id' | 'title'>;
}

/**
 * Launches a resource link's LTI tool in a frame, and as the frame's direct parent answers its platform storage messages
 * for as long as it is mounted. The frame may not navigate the page around it.
 */
export function LtiLaunchFrame({ channel, resourceLink }: LtiLaunchFrameProps) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { mutate, data: launch, error } = useStartLtiLaunchMutation();
  // The resource link the last launch started for: StrictMode's simulated remount keeps it and starts no second launch
  const startedForRef = useRef<string | null>(null);

  const start = () =>
    mutate({ path: { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel), ltiResourceLinkId: resourceLink.id } });

  // A launch record is spent once: every mount starts its own launch.
  useEffect(() => {
    if (startedForRef.current === resourceLink.id) return;
    startedForRef.current = resourceLink.id;
    start();
  }, [resourceLink.id]);

  useEffect(() => {
    if (!launch) return;
    const storage: PlatformStorage = new Map();
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current?.contentWindow ?? null;
      const reply = answerStorageMessage(event, { frame, storage });
      if (reply) frame?.postMessage(reply.message, reply.targetOrigin);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [launch]);

  if (error) {
    return (
      <ContentPlaceholder title="c:lti_launch_failed" titleOptions={{ name: resourceLink.title }}>
        {/* Why the platform refused, such as an LTI tool an admin disabled */}
        <p className="text-muted-foreground mb-4 max-w-md text-sm">{getErrorInfo({ error }).message}</p>
        <Button variant="outline" onClick={start}>
          {t('c:try_again')}
        </Button>
      </ContentPlaceholder>
    );
  }

  if (!launch) {
    return (
      <div role="status" className="flex flex-col items-center gap-4 p-8">
        <Spinner />
        <p className="text-muted-foreground text-sm">{t('c:lti_launch_loading', { name: resourceLink.title })}</p>
      </div>
    );
  }

  return (
    <iframe
      ref={frameRef}
      key={launch.url}
      src={launch.url}
      title={resourceLink.title}
      sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads"
      allow="fullscreen; clipboard-write"
      className="h-[calc(100dvh-12rem)] min-h-96 w-full border-0"
    />
  );
}
