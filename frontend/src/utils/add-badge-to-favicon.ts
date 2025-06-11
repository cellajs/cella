import type { ConfigMode } from 'config';

/**
 * Show badge on favicon indicating current mode of application.
 * @param mode ConfigMode
 * @returns
 */
export const addBadgeToFavicon = (mode: ConfigMode) => {
  if (mode === 'production') return;

  try {
    const favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement;
    if (!favicon) return;

    const img = new Image();
    img.src = favicon.href;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 32;
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw original favicon
      ctx.drawImage(img, 0, 0, size, size);

      // Badge settings
      const badgeRadius = 8;
      const badgeX = size - badgeRadius - 2;
      const badgeY = badgeRadius + 2;

      // Draw circle
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
      ctx.fill();

      const letter = mode[0].toUpperCase();

      // Draw letter
      ctx.fillStyle = 'black';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, badgeX, badgeY + 1);

      // Replace favicon
      const newFavicon = document.createElement('link');
      newFavicon.rel = 'icon';
      newFavicon.href = canvas.toDataURL('image/png');

      document.head.removeChild(favicon);
      document.head.appendChild(newFavicon);
    };
  } catch (error) {
    console.error('Error adding badge to favicon:', error);
  }
};
