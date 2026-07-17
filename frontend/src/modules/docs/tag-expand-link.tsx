import { Link, type LinkProps } from '@tanstack/react-router';
import { ChevronDownIcon, LoaderCircleIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

type TagExpandLinkProps = Pick<LinkProps, 'to' | 'search' | 'hash'> & {
  isOpen: boolean;
  /** Show a spinner while details data is loading. */
  loading?: boolean;
  onMouseEnter?: () => void;
  onClick?: () => void;
};

/**
 * Centered "Show / Hide details" Link styled as a rounded-full button.
 * Chevron stays mounted across toggles so its rotation animates smoothly.
 */
export const TagExpandLink = ({ isOpen, loading, to, search, hash, onMouseEnter, onClick }: TagExpandLinkProps) => {
  const { t } = useTranslation();

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
        onMouseEnter={onMouseEnter}
        onClick={onClick}
      >
        {isOpen ? t('c:docs.hide_details') : t('c:docs.show_details')}
        {loading ? (
          <LoaderCircleIcon className="ml-2 h-4 w-4 animate-spin opacity-50" />
        ) : (
          <ChevronDownIcon
            className={cn('ml-2 h-4 w-4 opacity-50 transition-transform duration-200', isOpen && 'rotate-180')}
          />
        )}
      </Link>
    </div>
  );
};
