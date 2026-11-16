/** The read budget of every GET route without a limiter of its own (`readLimiter`): `points` reads per `duration` seconds. */
export const readBudget = { points: 1000, duration: 300 };

/** The share of the read budget the client's warm-up and viewed scopes leave to what the user opens. */
export const userReadShare = 0.3;

/** How long after a change frame the client reads a scope on its background tier, in ms. */
export const backgroundTierMs = { min: 2_000, max: 30_000 };

/** The time between two pings of the stream, in ms. */
export const streamPingMs = 30_000;

/** The largest page a list returns and the size of a range fetch: a larger `maxPageSize` coerces down to it. */
export const pageSizeCap = 1000;
