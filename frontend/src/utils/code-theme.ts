import type { ThemeRegistration } from '@shikijs/core';

const type = 'var(--code-type)';

/**
 * The Shiki theme of every code view, also read at build time by vite.config.ts. Its colors are CSS variables, so a theme switch
 * needs no new highlighting and an app recolors code from its stylesheet. Each color matches its part in the JSON viewer's theme.
 */
export const codeTheme = {
  name: 'code' as const,
  type: 'light',
  fg: 'var(--muted-foreground)',
  bg: 'transparent',
  settings: [
    { settings: { foreground: 'var(--muted-foreground)', background: 'transparent' } },
    { scope: ['punctuation', 'keyword.operator'], settings: { foreground: 'var(--faint-foreground)' } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: 'var(--faint-foreground)' } },
    {
      scope: ['string', 'punctuation.definition.string', 'meta.definition.variable', 'markup.heading', 'markup.bold', 'markup.inline.raw'],
      settings: { foreground: 'var(--foreground)' },
    },
    { scope: ['constant.numeric'], settings: { foreground: 'var(--code-number)' } },
    { scope: ['constant.language'], settings: { foreground: 'var(--code-boolean)' } },
    { scope: ['constant.language.null', 'constant.language.undefined'], settings: { foreground: 'var(--muted-foreground)' } },
    {
      scope: [
        'meta.object-literal.key',
        'variable.object.property',
        'support.type.property-name',
        'punctuation.support.type.property-name',
        'entity.name.tag',
      ],
      settings: { foreground: 'var(--code-key)' },
    },
    { scope: ['entity.name.function', 'support.function', 'entity.name.command', 'entity.other.attribute-name'], settings: { foreground: type } },
    {
      scope: ['support.type.primitive', 'support.type.builtin', 'entity.name.type', 'entity.name.class'],
      settings: { foreground: type, fontStyle: 'italic' },
    },
  ],
} satisfies ThemeRegistration;
