import { rateLimiter } from '.';

// Sign in rate limiter
const maxWrongAttemptsByIPperDay = 100;
const maxConsecutiveFailsByUsernameAndIP = 5;

const limiterSlowBruteByIP = rateLimiter({
  keyPrefix: 'login_fail_ip_per_day',
  limit: maxWrongAttemptsByIPperDay,
  windowMs: 60 * 60 * 24 * 1000,
});

const limiterConsecutiveFailsByUsernameAndIP = rateLimiter({
  keyPrefix: 'login_fail_consecutive_username_and_ip',
  limit: maxConsecutiveFailsByUsernameAndIP,
  windowMs: 60 * 60 * 1000, // Store number for 1 hour since first fail
});

export const signInRateLimiter = [limiterConsecutiveFailsByUsernameAndIP, limiterSlowBruteByIP];
