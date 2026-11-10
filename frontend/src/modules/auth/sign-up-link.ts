import { linkOptions } from '@tanstack/react-router';
import { appConfig } from 'shared';

/** Sign-up is closed and the waitlist open: a visitor without an account asks to join. */
export const joinsWaitlist = appConfig.has.waitlist && !appConfig.has.selfRegistration;

/** @public A sign-up button's label. */
export const signUpKey = joinsWaitlist ? 'c:waitlist_request' : 'c:sign_up';

/** @public A sign-up button's target: the authenticate page, on the waitlist form while sign-up is closed. */
export const signUpLink = linkOptions({ to: '/auth/authenticate', search: { waitlist: joinsWaitlist || undefined } });

/** @public `signUpLink` as a path, for a redirect outside the router such as the sign-out page's. */
export const signUpPath = joinsWaitlist ? '/auth/authenticate?waitlist=true' : '/auth/authenticate';
