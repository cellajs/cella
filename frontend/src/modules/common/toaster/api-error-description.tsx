import { CopyIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import type { ApiError } from '~/lib/api';
import { CopiedIcon } from '~/modules/common/copied-icon';
import { Button } from '~/modules/ui/button';

interface ApiErrorDescriptionProps {
  /** One sentence on what happened. */
  message?: string;
  /** The server's message for a 5xx; only a development server sends it. */
  cause?: string;
  /** Set for a failure worth reporting. */
  report?: ApiError;
}

/** The body of an API error toast; a failure worth reporting shows its request id and copies what support asks for. */
export function ApiErrorDescription({ message, cause, report }: ApiErrorDescriptionProps) {
  const { t } = useTranslation();
  const { copied, copyToClipboard } = useCopyToClipboard(2000);

  const copyReport = () => {
    if (!report) return;
    const lines = [
      [t('c:request_id'), report.instance],
      [t('c:type'), report.type],
      [t('c:http_status'), report.status],
      [t('c:request'), [report.method, report.path].filter(Boolean).join(' ')],
      [t('c:timestamp'), report.timestamp],
    ];
    copyToClipboard(
      lines
        .filter(([, value]) => value)
        .map(([label, value]) => `${label}: ${value}`)
        .join('\n'),
    );
  };

  return (
    <div className="flex flex-col gap-1">
      {message && <p>{message}</p>}
      {cause && <p className="line-clamp-3 font-mono text-xs break-words">{cause}</p>}
      {report?.instance && (
        <p className="flex items-center gap-1 text-xs">
          <span className="min-w-0">
            {t('c:request_id')}: <span className="font-mono break-all">{report.instance}</span>
          </span>
          <Button variant="ghost" size="micro" className="shrink-0" aria-label={copied ? t('c:copied') : t('c:copy')} onClick={copyReport}>
            <CopiedIcon copied={copied} icon={CopyIcon} />
          </Button>
        </p>
      )}
    </div>
  );
}
