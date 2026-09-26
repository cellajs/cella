import type { SideEffectBlock, SideEffectProducer } from '../types';

/** Set on `unsubscribe_tokens.secret` once its rows hold hashes; its presence keeps a re-run from hashing a hash. */
export const unsubscribeTokenHashMarker = 'sha256 hex of the unsubscribe token';

/**
 * `unsubscribe_tokens.secret` holds the SHA-256 (lowercase hex, as `hashToken` writes it) of the token an unsubscribe
 * link carries, so a read of the table opens no link. Rows written before held the token itself: this block hashes
 * them once, and the links already sent keep working because a presented token is looked up by its hash. The column
 * comment records that the hashing ran.
 */
async function run(): Promise<SideEffectBlock> {
  const migrationSql = `-- Unsubscribe token hashes
-- Hashes the unsubscribe tokens stored as their own value, once; the column comment marks the column as hashed.

DO $$
BEGIN
  IF to_regclass('public.unsubscribe_tokens') IS NULL THEN
    RETURN;
  END IF;
  IF col_description('public.unsubscribe_tokens'::regclass, (
    SELECT attnum FROM pg_attribute
    WHERE attrelid = 'public.unsubscribe_tokens'::regclass AND attname = 'secret'
  )) IS DISTINCT FROM '${unsubscribeTokenHashMarker}' THEN
    UPDATE public.unsubscribe_tokens SET secret = encode(sha256(convert_to(secret, 'UTF8')), 'hex');
    COMMENT ON COLUMN public.unsubscribe_tokens.secret IS '${unsubscribeTokenHashMarker}';
    RAISE NOTICE 'unsubscribe_tokens: stored tokens replaced by their hash';
  END IF;
END $$;
`;

  return {
    tag: 'unsubscribe_token_hashes',
    title: 'Unsubscribe tokens stored as hashes',
    sql: migrationSql,
    notes: ['unsubscribe_tokens.secret: raw tokens hashed once (column comment marks it)'],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Unsubscribe token hashes',
  produce: run,
};
