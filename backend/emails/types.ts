// Basic email template type
export type BasicTemplateType = {
  lng: string;
  subject: string;
  name?: string;
  testEmail?: boolean;
  senderThumbnailUrl?: string | null;
  senderName?: string;
  unsubscribeLink?: string;
};
