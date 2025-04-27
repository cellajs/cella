const avatar = {
  steps: {
    converted: {
      use: ':original',
      robot: '/image/resize',
      format: 'webp',
    },
    thumbnail: {
      use: 'converted',
      robot: '/image/resize',
      resize_strategy: 'fit',
      width: 200,
      height: 200,
    },
  },
  use: ['thumbnail'],
};

const cover = {
  steps: {
    converted: {
      use: ':original',
      robot: '/image/resize',
      format: 'webp',
    },
    cover: {
      use: 'converted',
      robot: '/image/resize',
      resize_strategy: 'fit',
      width: 2000,
      height: 700,
    },
  },
  use: ['cover'],
};

const attachment = {
  steps: {
    converted_image: {
      use: ':original',
      robot: '/image/resize',
      resize_strategy: 'fit',
      width: 800,
      height: 800,
      format: 'webp',
    },
    converted_audio: {
      use: ':original',
      robot: '/audio/encode',
      preset: 'mp3',
    },
    converted_document: {
      use: ':original',
      robot: '/document/convert',
      format: 'pdf',
      accepted: ['doc', 'docx', 'html', 'latex', 'md', 'odt', 'ppt', 'pptx', 'rtf', 'txt', 'xhtml', 'xls', 'xlsx'],
    },
    document_thumb: {
      use: ':original',
      robot: '/document/thumbs',
      count: 1,
      format: 'png',
      width: 640,
      height: 800,
    },
    video_thumb: {
      use: ':original',
      robot: '/video/thumbs',
      count: 1,
      format: 'png',
      width: 640,
      height: 360,
    },
  },
  use: [':original', 'document_thumb', 'video_thumb', 'converted_image', 'converted_audio', 'converted_document'],
};

export const uploadTemplates = {
  avatar,
  cover,
  attachment,
};
