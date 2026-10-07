import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it.each([
    ['text-muted-foreground soft-text', 'soft-text'],
    ['soft-text text-foreground', 'text-foreground'],
    ['soft-text soft-text-strong', 'soft-text-strong'],
    ['soft-text-stronger text-xs', 'soft-text-stronger text-xs'],
    ['bg-muted soft-bg', 'soft-bg'],
    ['soft-bg-strong bg-transparent', 'bg-transparent'],
    ['soft-bg soft-bg-stronger', 'soft-bg-stronger'],
    ['soft-bg soft-gradient', 'soft-bg soft-gradient'],
    ['bg-linear-to-r soft-gradient', 'soft-gradient'],
    ['border-input soft-border', 'soft-border'],
    ['soft-border soft-border-strong', 'soft-border-strong'],
    ['border-2 soft-border-medium', 'border-2 soft-border-medium'],
    ['intent-primary intent-destructive', 'intent-destructive'],
    ['intent-brand soft-bg soft-text', 'intent-brand soft-bg soft-text'],
    ['link-inline no-underline', 'no-underline'],
    ['underline link-inline', 'link-inline'],
    ['link-decoration decoration-foreground/40', 'decoration-foreground/40'],
    ['link-decoration link-decoration-strong', 'link-decoration-strong'],
  ])('merges the custom utilities: %s', (input, merged) => {
    expect(cn(input)).toBe(merged);
  });

  it('merges per variant', () => {
    expect(cn('hover:bg-accent', 'hover:soft-bg-stronger')).toBe('hover:soft-bg-stronger');
    expect(cn('hover:soft-bg-stronger', 'bg-muted')).toBe('hover:soft-bg-stronger bg-muted');
    expect(cn('dark:soft-text', 'dark:text-white')).toBe('dark:text-white');
  });

  it('reads the theme font sizes text-2xs and text-md as font sizes', () => {
    expect(cn('text-sm', 'text-2xs')).toBe('text-2xs');
    expect(cn('text-2xs', 'text-md')).toBe('text-md');
    expect(cn('text-md', 'text-primary')).toBe('text-md text-primary');
  });

  it('keeps the default merges and clsx inputs', () => {
    expect(cn('px-2', 'py-1', 'p-3')).toBe('p-3');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    expect(cn('px-2', false, null, { 'py-1': true, block: false }, ['px-4'])).toBe('py-1 px-4');
  });
});
