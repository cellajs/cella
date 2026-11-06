import { ChevronRightIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthStep } from '~/modules/auth/types';
import type { IconComponent } from '~/modules/common/icons/types';
import { Button, glassClass } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

export interface AuthAlternative {
  id: string;
  icon: IconComponent;
  label: string;
  /** A row's label in a group; defaults to `label`. */
  shortLabel?: string;
  meta?: string;
  href?: string;
  onClick?: () => void;
  loading?: boolean;
}

interface AuthAlternativesProps {
  items: AuthAlternative[];
  /** Picks the caption's verb. */
  authStep: AuthStep;
}

/** One alternative as a glass button, two or more as a glass group of rows. */
export function AuthAlternatives({ items, authStep }: AuthAlternativesProps) {
  const { t } = useTranslation();
  const captionId = useId();

  if (!items.length) return null;

  const single = items.length === 1 ? items[0] : undefined;
  const caption = authStep === 'signIn' ? 'c:or_sign_in_with' : authStep === 'signUp' ? 'c:or_sign_up_with' : 'c:or_continue_with';

  return (
    <>
      <div id={captionId} className="text-muted-foreground flex items-center gap-3 text-xs">
        <span className="bg-foreground/15 h-px flex-1" />
        {single ? t('c:or') : t(caption)}
        <span className="bg-foreground/15 h-px flex-1" />
      </div>

      {single ? (
        <Button
          variant="glass"
          size="block"
          loading={single.loading}
          onClick={single.onClick}
          render={single.href ? (props) => <a {...props} href={single.href} /> : undefined}
        >
          <single.icon />
          <span className="truncate">{single.label}</span>
        </Button>
      ) : (
        <div role="group" aria-labelledby={captionId} className={cn(glassClass, 'flex flex-col overflow-hidden rounded-xl border')}>
          {items.map((item, index) => (
            <Button
              key={item.id}
              variant="ghost"
              press={false}
              loading={item.loading}
              onClick={item.onClick}
              render={item.href ? (props) => <a {...props} href={item.href} /> : undefined}
              className={cn('group/row h-13 justify-start gap-3 rounded-none border-0 px-4', index > 0 && 'border-foreground/10 border-t')}
            >
              <item.icon />
              <span className="flex-1 truncate text-left">{item.shortLabel ?? item.label}</span>
              {item.meta && <span className="text-muted-foreground text-xs font-normal">{item.meta}</span>}
              <ChevronRightIcon className="text-muted-foreground transition-transform group-hover/row:translate-x-0.5" />
            </Button>
          ))}
        </div>
      )}
    </>
  );
}
