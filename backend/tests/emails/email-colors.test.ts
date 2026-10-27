import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import { darkPalette } from '../../emails/styles';

/** WCAG relative luminance of a `#rrggbb` color. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

/** The white panel, and the dark panels a client that recolors a mail on its own puts behind it. */
const panels = ['#ffffff', '#121212', '#1e1e1e', '#2d2d2d'];

/**
 * An app sets its own mail colors (`appConfig.theme.email`): a label must stay readable on its button (4.5:1), and the
 * button visible as a shape (3:1, WCAG 1.4.11) wherever a client puts it, through its fill or its edge. A black button
 * vanishes on a recolored dark panel; this fails before such a color ships.
 */
describe('mail button colors', () => {
  const { button, buttonEdge, buttonLabel, darkButton, darkButtonLabel } = appConfig.theme.email;

  it('keep the button readable and visible in light mode, in a recoloring client and under the mail’s own dark styles', () => {
    expect(contrast(buttonLabel, button), 'label on button').toBeGreaterThanOrEqual(4.5);
    for (const panel of panels) {
      expect(Math.max(contrast(button, panel), contrast(buttonEdge, panel)), `button on ${panel}`).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(darkButtonLabel, darkButton), 'label on dark button').toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkButton, darkPalette.panel), 'dark button on dark panel').toBeGreaterThanOrEqual(3);
  });
});
