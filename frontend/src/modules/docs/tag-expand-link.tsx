import { Link, type LinkProps } from '@tanstack/react-router';
import { ChevronDownIcon, LoaderCircleIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

type TagExpandLinkProps = Pick<LinkProps, 'to' | 'search' | 'hash'> & {
  isOpen: boolean;
  /** The section the link expands; it joins the link's accessible name, since every section repeats the same text. */
  tagName: string;
  /** Show a spinner while details data is loading. */
  loading?: boolean;
  onMouseEnter?: () => void;
  onClick?: () => void;
};

/** The chevron stays mounted across toggles so its rotation animates smoothly. */
export function TagExpandLink({ isOpen, tagName, loading, to, search, hash, onMouseEnter, onClick }: TagExpandLinkProps) {
  const { t } = useTranslation();
  const text = isOpen ? t('c:docs.hide_details') : t('c:docs.show_details');

  return (
    <div className="flex w-full justify-center">
      <Link
        to={to}
        search={search}
        hash={hash}
        replace
        draggable={false}
        resetScroll={false}
        className={cn(buttonVariants({ variant: isOpen ? 'outlineGhost' : 'plain', size: 'lg' }), 'rounded-full')}
        aria-label={`${text}: ${tagName}`}
        onMouseEnter={onMouseEnter}
        onClick={onClick}
      >
        {text}
        {loading ? (
          <LoaderCircleIcon className="size-4 animate-spin opacity-50" />
        ) : (
          <ChevronDownIcon className={cn('size-4 opacity-50 transition-transform duration-200', isOpen && 'rotate-180')} />
        )}
      </Link>
    </div>
  );
}
