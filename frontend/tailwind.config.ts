import typographyPlugin from '@tailwindcss/typography';
import { appConfig } from 'shared';
import type { Config } from 'tailwindcss';
import animatePlugin from 'tailwindcss-animate';

type PluginApi = { addVariant: (name: string, variant: unknown) => void; addComponents: (components: unknown, options?: unknown) => void };

// Typography guards every prose rule with `[class~="not-prose"] *`. An attribute selector in ancestor position makes any
// class change on an ancestor (a body class, the theme class) restyle all prose; `.not-prose` matches the same elements.
const rewriteNotProse = (value: unknown): unknown => {
  if (typeof value === 'string') return value.replaceAll('[class~="not-prose"]', '.not-prose');
  if (Array.isArray(value)) return value.map(rewriteNotProse);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [rewriteNotProse(k), rewriteNotProse(v)]));
  return value;
};

const typography = typographyPlugin();
const classSelectorTypographyPlugin = {
  config: typography.config,
  handler: (api: PluginApi) =>
    typography.handler({
      ...api,
      addVariant: (name: string, variant: unknown) => api.addVariant(name, rewriteNotProse(variant)),
      addComponents: (components: unknown, options?: unknown) => api.addComponents(rewriteNotProse(components), options),
    } as never),
};

export default {
  theme: {
    screens: appConfig.theme.screenSizes,
    container: {
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontSize: {
        md: '0.888rem',
      },
      fontFamily: {
        sans: ['Open Sans', 'ui-sans-serif', 'sans-serif'],
      },
      transitionProperty: {
        spacing: 'margin, padding',
      },
      colors: {
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        success: {
          DEFAULT: 'var(--success)',
          foreground: 'var(--success-foreground)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          foreground: 'var(--warning-foreground)',
        },
        brand: {
          DEFAULT: 'var(--brand)',
          foreground: 'var(--brand-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
        },
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          foreground: 'var(--sidebar-foreground)',
          accent: 'var(--sidebar-accent)',
          'accent-foreground': 'var(--sidebar-accent-foreground)',
          border: 'var(--sidebar-border)',
          ring: 'var(--sidebar-ring)',
        },
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--accordion-panel-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--accordion-panel-height)' },
          to: { height: '0' },
        },
        'collapsible-down': {
          from: { height: '0' },
          to: { height: 'var(--collapsible-panel-height)' },
        },
        'collapsible-up': {
          from: { height: 'var(--collapsible-panel-height)' },
          to: { height: '0' },
        },
        'status-pulse': {
          '0%, 100%': {
            transform: 'scale(1)',
            boxShadow: '0 0 2px 1px var(--status-pulse-color, currentColor)',
          },
          '50%': {
            transform: 'scale(1.12)',
            boxShadow: '0 0 4px 2px var(--status-pulse-color, currentColor)',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'collapsible-down': 'collapsible-down 0.2s ease-out',
        'collapsible-up': 'collapsible-up 0.2s ease-out',
        'status-pulse': 'status-pulse 3.5s ease-in-out infinite',
      },
    },
  },
  plugins: [animatePlugin, classSelectorTypographyPlugin],
} satisfies Config;
