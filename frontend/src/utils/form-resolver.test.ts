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
  it('submits a cleared optional field as null', async () => {
    const result = await formResolver(schema)({ name: 'Acme', shortName: '  ', description: '' }, undefined, options);

    expect(result.errors).toEqual({});
    expect(result.values).toEqual({ name: 'Acme', shortName: null, description: null });
  });

  it('refuses a required field left blank, also one holding only spaces', async () => {
    const result = await formResolver(schema)({ name: '   ', shortName: null, description: null }, undefined, options);

    expect(Object.keys(result.errors)).toEqual(['name']);
  });
});
