import type { ConfigMode } from 'shared';

/** The favicon the badge is drawn on: the first of these the page has. */
const iconSelectors = [
  "link[rel='icon'][sizes='64x64']",
  "link[rel='icon'][sizes='32x32']",
  "link[rel='icon'][type='image/png']",
  "link[rel='icon']",
];

const appendIcon = (href: string, sizes?: string) => {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  if (sizes) link.sizes = sizes;
  link.href = href;
  document.head.appendChild(link);
};

/** Overlays the mode initial ("D" for development, "S" for staging) on the favicon. No-op in production. */
export const initFaviconBadge = (mode: ConfigMode) => {
  if (mode === 'production') return;

  try {
    const sourceFavicon = iconSelectors.map((selector) => document.querySelector<HTMLLinkElement>(selector)).find(Boolean);
    if (!sourceFavicon) return;

    const img = new Image();
    img.src = sourceFavicon.href;

    img.onload = () => {
      const letter = mode[0].toUpperCase();

      const renderBadgedIcon = (size: number) => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.drawImage(img, 0, 0, size, size);

        const badgeRadius = Math.max(3, Math.round(size * 0.25));
        const badgeX = size - badgeRadius - 2;
        const badgeY = badgeRadius + 2;

        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = 'black';
        ctx.font = `bold ${Math.max(7, Math.round(size * 0.44))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, badgeX, badgeY + 1);

        return canvas.toDataURL('image/png');
      };

      const icon32 = renderBadgedIcon(32);
      const icon16 = renderBadgedIcon(16);
      if (!icon32 && !icon16) return;

      for (const node of document.querySelectorAll("link[rel='icon']")) node.remove();

      if (icon32) {
        appendIcon(icon32, '32x32');
        appendIcon(icon32);
      }
      if (icon16) appendIcon(icon16, '16x16');
    };
  } catch (error) {
    console.error('Error adding badge to favicon:', error);
  }
};
