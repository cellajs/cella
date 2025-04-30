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
  use: ['thumbnail'] as const,
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
  use: ['cover'] as const,
};

// @link https://transloadit.com/docs/transcoding/file-filtering/file-filter/
const attachment = {
  steps: {
    filter_images: {
      use: ':original',
      robot: '/file/filter',
      accepts: [['${file.mime}', 'regex', '^image/']],
    },
    filter_documents: {
      use: ':original',
      robot: '/file/filter',
      accepts: [
        ['${file.mime}', 'regex', '^application/(msword|vnd\\.openxmlformats-officedocument.*|pdf)$'],
        ['${file.mime}', 'regex', '^text/'],
      ],
    },
    filter_audio: {
      use: ':original',
      robot: '/file/filter',
      accepts: [['${file.mime}', 'regex', '^audio/']],
    },
    converted_image: {
      use: 'filter_images',
      robot: '/image/resize',
      resize_strategy: 'fit',
      width: 1800,
      height: 1800,
      format: 'webp',
    },
    converted_audio: {
      use: 'filter_audio',
      robot: '/audio/encode',
      preset: 'mp3',
    },
    converted_document: {
      use: 'filter_documents',
      robot: '/document/convert',
      format: 'pdf',
      accepted: ['doc', 'docx', 'html', 'latex', 'md', 'odt', 'ppt', 'pptx', 'rtf', 'txt', 'xhtml', 'xls', 'xlsx'],
    },
    thumb_document: {
      use: 'filter_documents',
      robot: '/document/thumbs',
      count: 1,
      format: 'png',
      width: 640,
      height: 800,
    },
    thumb_video: {
      use: ':original',
      robot: '/video/thumbs',
      count: 1,
      format: 'png',
      width: 640,
      height: 360,
    },
    thumb_image: {
      use: 'filter_images',
      robot: '/image/resize',
      count: 1,
      format: 'png',
      width: 100,
      height: 100,
    },
  },
  use: [':original', 'thumb_image', 'thumb_video', 'thumb_document', 'converted_image', 'converted_audio', 'converted_document'] as const,
};

export const uploadTemplates = {
  avatar,
  cover,
  attachment,
};
