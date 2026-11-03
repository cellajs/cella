/**
 * What a ping of the app stream says while no CDC worker has been reading for a minute; any other ping is empty. The
 * API writes it and the client compares against it.
 */
export const workerAwayPing = 'worker_away';
