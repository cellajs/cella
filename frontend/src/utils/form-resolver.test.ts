import type { ResolverOptions } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { formResolver } from '~/utils/form-resolver';

const schema = z.object({
  name: z.string().min(2),
  shortName: z.string().min(2).nullish(),
  description: z.string().nullable(),
});

const options: ResolverOptions<z.input<typeof schema>> = { fields: {}, shouldUseNativeValidation: false };

describe('formResolver', () => {
  it('reads a blank text field as no value: a cleared optional one submits null, a required one is refused', async () => {
    const cleared = await formResolver(schema)({ name: 'Acme', shortName: '  ', description: '' }, undefined, options);
    expect(cleared.errors).toEqual({});
    expect(cleared.values).toEqual({ name: 'Acme', shortName: null, description: null });

    const blank = await formResolver(schema)({ name: '   ', shortName: null, description: null }, undefined, options);
    expect(Object.keys(blank.errors)).toEqual(['name']);
  });
});
