import { CheckIcon, CopyIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import type { ApiError } from '~/lib/api';
import { Button } from '~/modules/ui/button';

interface ApiErrorDescriptionProps {
  /** One sentence on what happened. */
  message?: string;
  /** The server's own message for a 5xx, which names the cause; only a development server sends it. */
  cause?: string;
  /** Set for a failure worth reporting: its request id is shown, with a button that copies what support asks for. */
  report?: ApiError;
}

/**
 * The body of an API error toast, in a fixed order: what happened, the cause a development server names, and the
 * request id of a failure worth reporting. Toast text cannot be selected, so the id comes with a copy button.
 */
export function ApiErrorDescription({ message, cause, report }: ApiErrorDescriptionProps) {
  const { t } = useTranslation();
  const { copied, copyToClipboard } = useCopyToClipboard(2000);

  const copyReport = () => {
    if (!report) return;
    const lines = [
      [t('c:request_id'), report.requestId],
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
      {cause && <p className="line-clamp-3 break-words font-mono text-xs">{cause}</p>}
      {report?.requestId && (
        <p className="flex items-center gap-1 text-xs">
          <span className="min-w-0">
            {t('c:request_id')}: <span className="break-all font-mono">{report.requestId}</span>
          </span>
          <Button variant="ghost" size="micro" className="shrink-0" aria-label={copied ? t('c:copied') : t('c:copy')} onClick={copyReport}>
            {copied ? <CheckIcon className="size-3.5 text-success" /> : <CopyIcon className="size-3.5" />}
          </Button>
        </p>
      )}
    </div>
  );
}
