import type { ConfigMode } from 'shared';

/**
 * Show badge on favicon indicating current mode of application.
 * Example: "D" for development, "S" for staging.
 */
export const initFaviconBadge = (mode: ConfigMode) => {
  if (mode === 'production') return;

  try {
    const sourceFavicon =
      (document.querySelector("link[rel='icon'][sizes='64x64']") as HTMLLinkElement | null) ??
      (document.querySelector("link[rel='icon'][sizes='32x32']") as HTMLLinkElement | null) ??
      (document.querySelector("link[rel='icon'][type='image/png']") as HTMLLinkElement | null) ??
      (document.querySelector("link[rel='icon']") as HTMLLinkElement | null);
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
        const favicon32 = document.createElement('link');
        favicon32.rel = 'icon';
        favicon32.type = 'image/png';
        favicon32.sizes = '32x32';
        favicon32.href = icon32;
        document.head.appendChild(favicon32);

        const fallbackFavicon = document.createElement('link');
        fallbackFavicon.rel = 'icon';
        fallbackFavicon.type = 'image/png';
        fallbackFavicon.href = icon32;
        document.head.appendChild(fallbackFavicon);
      }

      if (icon16) {
        const favicon16 = document.createElement('link');
        favicon16.rel = 'icon';
        favicon16.type = 'image/png';
        favicon16.sizes = '16x16';
        favicon16.href = icon16;
        document.head.appendChild(favicon16);
      }
    };
  } catch (error) {
    console.error('Error adding badge to favicon:', error);
  }
};
