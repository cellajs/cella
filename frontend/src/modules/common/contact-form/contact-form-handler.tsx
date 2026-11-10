import { ContactForm, contactFormDialogId } from '~/modules/common/contact-form/contact-form';
import { dialoger, type TriggerRef } from '~/modules/common/dialoger/use-dialoger';

/** Opens the contact dialog, which renders its own header beside the map. */
export const contactFormHandler = (ref: TriggerRef) => {
  dialoger.getState().create(<ContactForm dialog />, {
    id: contactFormDialogId,
    triggerRef: ref,
    drawerOnMobile: false,
    outsideScroll: true,
    className: 'sm:max-w-5xl lg:p-0',
  });
};
