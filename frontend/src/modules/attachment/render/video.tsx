import MediaThemeSutro from 'player.style/sutro/react';
import type { MediaPlayerProps } from '~/modules/attachment/render/attachment-render';

export function RenderVideo({ src, className }: MediaPlayerProps) {
  return (
    <MediaThemeSutro className={className}>
      {/* biome-ignore lint/a11y/useMediaCaption: an uploaded video comes without a caption track */}
      <video slot="media" src={src} playsInline crossOrigin="anonymous" className="max-h-[90vh]" />
    </MediaThemeSutro>
  );
}
