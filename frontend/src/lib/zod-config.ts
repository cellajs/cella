import { z } from 'zod';

// The CSP forbids eval. zod probes `new Function` when it builds its first object schema to pick a compiled parser, and the
// browser reports the caught throw as a CSP violation, so the probe is skipped and every object schema parses in plain code.
z.config({ jitless: true });
