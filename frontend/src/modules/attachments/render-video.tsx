import MediaThemeSutro from 'player.style/sutro/react';

const RenderVideo = ({ src, className }: { src: string; className?: string }) => (
  <MediaThemeSutro className={className}>
    {/* biome-ignore lint/a11y/useMediaCaption: by author */}
    <video slot="media" src={src} playsInline crossOrigin="anonymous" />
  </MediaThemeSutro>
);

export default RenderVideo;
