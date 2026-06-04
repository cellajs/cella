import type { Meta, StoryObj } from '@storybook/react-vite';
import { MediaThumbnail } from '~/modules/common/media-thumbnail';

const meta = {
  title: 'common/MediaThumbnail',
  component: MediaThumbnail,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof MediaThumbnail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithImage: Story = {
  args: {
    name: 'Sample image',
    url: 'https://picsum.photos/seed/cella/64',
    contentType: 'image/jpeg',
  },
};

export const BrokenImage: Story = {
  args: {
    name: 'Broken image',
    url: 'https://invalid.example.com/missing.jpg',
    contentType: 'image/jpeg',
  },
};

export const NoUrl: Story = {
  args: {
    name: 'No url',
    url: undefined,
    contentType: 'image/png',
  },
};

export const ContentTypeVariants: Story = {
  args: { name: 'variants', contentType: 'image/png' },
  render: () => (
    <div className="flex items-center gap-4">
      <MediaThumbnail name="png" contentType="image/png" />
      <MediaThumbnail name="pdf" contentType="application/pdf" />
      <MediaThumbnail name="video" contentType="video/mp4" />
      <MediaThumbnail name="audio" contentType="audio/mpeg" />
      <MediaThumbnail name="csv" contentType="text/csv" />
      <MediaThumbnail name="zip" contentType="application/zip" />
      <MediaThumbnail name="unknown" contentType="application/octet-stream" />
    </div>
  ),
};

export const MixedGallery: Story = {
  args: { name: 'gallery', contentType: 'image/jpeg' },
  render: () => (
    <div className="flex items-center gap-4">
      <MediaThumbnail name="ok-1" url="https://picsum.photos/seed/one/64" contentType="image/jpeg" />
      <MediaThumbnail name="ok-2" url="https://picsum.photos/seed/two/64" contentType="image/jpeg" />
      <MediaThumbnail name="broken" url="https://invalid.example.com/x.jpg" contentType="image/jpeg" />
      <MediaThumbnail name="report.pdf" contentType="application/pdf" />
      <MediaThumbnail name="clip.mp4" contentType="video/mp4" />
    </div>
  ),
};
