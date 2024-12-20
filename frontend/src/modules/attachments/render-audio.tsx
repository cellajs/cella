import MediaThemeSutroAudio from 'player.style/sutro-audio/react';

const RenderAudio = ({ src }: { src: string }) => (
  <MediaThemeSutroAudio className="w-[70%] p-2 max-h-10">
    {/* biome-ignore lint/a11y/useMediaCaption: by author */}
    <audio slot="media" src={src} playsInline crossOrigin="anonymous" />
  </MediaThemeSutroAudio>
);

export default RenderAudio;
