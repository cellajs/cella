import { appConfig } from 'shared';
import { LogoMark, LogoText } from '~/modules/common/logo-art';
import { cn } from '~/utils/cn';

// Mark and text take one height, so the app's viewBoxes alone set their proportion
const sizes = {
  sm: 'h-5 gap-2',
  md: 'h-7 gap-3',
  lg: 'h-8 gap-3',
  xl: 'h-9 gap-4',
} as const;

interface LogoProps {
  className?: string;
  size?: keyof typeof sizes;
  iconColor?: string;
  textColor?: string;
  /** Hover text and accessible name: the app name, or where the link around the logo goes; null when the link has a tooltip. */
  title?: string | null;
}

/** The app's mark and text side by side. For the mark alone, or to place the two on a layout's columns, use `LogoMark` and `LogoText`. */
export function Logo({ className, size = 'md', iconColor, textColor, title = appConfig.name }: LogoProps) {
  const labelProps = title ? { role: 'img', 'aria-label': title, title } : { 'aria-hidden': true };

  return (
    <span {...labelProps} className={cn('flex w-fit items-center', sizes[size], className)}>
      <LogoMark color={iconColor} className="aspect-square h-full shrink-0" />
      <LogoText color={textColor} className="h-full w-auto shrink-0" />
    </span>
  );
}
