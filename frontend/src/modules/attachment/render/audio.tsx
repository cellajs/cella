import MediaThemeSutroAudio from 'player.style/sutro-audio/react';
import type { MediaPlayerProps } from '~/modules/attachment/render/attachment-render';

export function RenderAudio({ src, className }: MediaPlayerProps) {
  return (
    <MediaThemeSutroAudio className={className}>
      {/* biome-ignore lint/a11y/useMediaCaption: an uploaded audio file comes without a caption track */}
      <audio slot="media" src={src} crossOrigin="anonymous" />
    </MediaThemeSutroAudio>
  );
}
