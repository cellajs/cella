import MediaThemeSutro from 'player.style/sutro/react';

const RenderVideo = ({ src }: { src: string }) => (
  <MediaThemeSutro className="w-full p-4">
    {/* biome-ignore lint/a11y/useMediaCaption: by author */}
    <video slot="media" src={src} playsInline crossOrigin="anonymous" />
  </MediaThemeSutro>
);

export default RenderVideo;
