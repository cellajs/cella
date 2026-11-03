import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { OUTPUT_PATH } from './synth';

// The Compose Specification's own schema, vendored at the commit its `$comment` names: what every Compose implementation reads.
const schema = JSON.parse(readFileSync(join(import.meta.dirname, 'compose-spec.json'), 'utf8')) as Record<string, unknown>;

describe('compose.gen.yml', () => {
  it('is a Compose file the Compose Specification accepts, the completion dependency and the pull policy included', () => {
    const validate = new Ajv2020({ strict: false, allErrors: true, validateFormats: false }).compile(schema);
    const file = parse(readFileSync(OUTPUT_PATH, 'utf8')) as Record<string, unknown>;
    expect(validate(file) ? [] : validate.errors).toEqual([]);
    // Positive control: the schema refuses a condition Compose does not know.
    const broken = structuredClone(file) as { services: Record<string, { depends_on?: Record<string, { condition: string }> }> };
    const withRelease = Object.values(broken.services).find((service) => service.depends_on);
    for (const dependency of Object.values(withRelease?.depends_on ?? {})) dependency.condition = 'service_exited';
    expect(validate(broken)).toBe(false);
  });
});
