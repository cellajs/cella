import typographyPlugin from '@tailwindcss/typography';
import { appConfig } from 'shared';
import plugin from 'tailwindcss/plugin';

type PluginApi = Parameters<Parameters<typeof plugin>[0]>[0];

// Typography guards every prose rule with `[class~="not-prose"] *`. An attribute selector in ancestor position makes any
// class change on an ancestor (a body class, the theme class) restyle all prose; `.not-prose` matches the same elements.
const rewriteNotProse = (value: unknown): unknown => {
  if (typeof value === 'string') return value.replaceAll('[class~="not-prose"]', '.not-prose');
  if (Array.isArray(value)) return value.map(rewriteNotProse);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [rewriteNotProse(k), rewriteNotProse(v)]));
  return value;
};

const typography = typographyPlugin() as unknown as { handler: (api: PluginApi) => void; config: { theme: Record<string, unknown> } };

/**
 * The parts of the Tailwind setup that CSS can't express, loaded by `@plugin` in tailwind.css: breakpoints from
 * `appConfig.theme.screenSizes` (use-breakpoints reads the same object at runtime), the container's 1400px cap, and the
 * typography plugin with class selectors for not-prose.
 */
export default plugin(
  (api) =>
    typography.handler({
      ...api,
      addVariant: (name, variant) => api.addVariant(name, rewriteNotProse(variant) as never),
      addComponents: (components, options) => api.addComponents(rewriteNotProse(components) as never, options),
    }),
  {
    theme: {
      ...typography.config.theme,
      screens: appConfig.theme.screenSizes,
      container: { screens: { '2xl': '1400px' } },
    },
  },
);
