import { Link } from '@tanstack/react-router';
import { ArrowRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { standardsItems } from '~/modules/marketing/marketing-config';
import { cn } from '~/utils/cn';

const half = Math.ceil(standardsItems.length / 2);
const columns = [standardsItems.slice(0, half), standardsItems.slice(half)];

export function Standards() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-8">
      <div className="grid w-full gap-x-8 md:grid-cols-2">
        {columns.map((column, index) => (
          <dl key={column[0].id} className={cn('border-t', index > 0 && 'max-md:border-t-0')}>
            {column.map(({ id, name, version }) => (
              <div key={id} className="flex items-baseline justify-between gap-4 border-b px-1 py-3">
                <dt className="font-medium whitespace-nowrap">
                  {name}
                  {version && <span className="text-muted-foreground ml-1.5 font-mono text-xs">{version}</span>}
                </dt>
                <dd className="text-muted-foreground text-right text-sm">{t(`about:standards.${id}` as TKey)}</dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
      <Link
        to="/docs/page/$"
        params={{ _splat: 'interoperability/standards' }}
        className="link-inline hover:text-primary inline-flex items-center gap-1.5 font-medium"
      >
        {t('about:standards.link')}
        <ArrowRightIcon className="size-4" />
      </Link>
    </div>
  );
}
