import MediaThemeSutroAudio from 'player.style/sutro-audio/react';

function RenderAudio({ src, className }: { src: string; className?: string }) {
  return (
    <MediaThemeSutroAudio className={className}>
      {/* biome-ignore lint/a11y/useMediaCaption: by author */}
      <audio slot="media" src={src} playsInline crossOrigin="anonymous" />
    </MediaThemeSutroAudio>
  );
}

export default RenderAudio;
