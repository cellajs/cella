import { useThemeStore } from '~/store/theme';

export const hexToHsl = (hex: string): string => {
  // Validate hex format
  const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  if (!hexPattern.test(hex)) {
    useThemeStore.setState((state) => ({ ...state, ...{ theme: 'none' } }));
    throw new Error('Invalid theme color hex format.');
  }

  // Clean the hex string
  const cleanedHex = hex.replace(/^#/, '').toLowerCase();

  // Handle 3 digit hex codes
  if (cleanedHex.length === 4) {
    const r = cleanedHex[1];
    const g = cleanedHex[2];
    const b = cleanedHex[3];
    // Expand to 6 digit
    const expandedHex = `#${r}${r}${g}${g}${b}${b}`;
    return hexToHsl(expandedHex);
  }

  // Parse RGB  from hex
  const r = Number.parseInt(cleanedHex.substring(0, 2), 16) / 255;
  const g = Number.parseInt(cleanedHex.substring(2, 4), 16) / 255;
  const b = Number.parseInt(cleanedHex.substring(4, 6), 16) / 255;

  // min and max rgb
  const cmin = Math.min(r, g, b);
  const cmax = Math.max(r, g, b);
  const delta = cmax - cmin;

  let h = 0;
  let s = 0;
  const l = (cmax + cmin) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (cmax) {
      case r:
        h = (g - b) / delta + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      case b:
        h = (r - g) / delta + 4;
        break;
    }
    h /= 6;
  }

  // Convert values to percentages and return the HSL string
  return `${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
};
