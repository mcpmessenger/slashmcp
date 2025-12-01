# Fix OAuth Token Storage Migration

The migration has been updated to fix the "column app_metadata does not exist" error.

## Apply the Updated Migration

1. Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/sql/new)
2. Copy the entire contents of `supabase/migrations/20250130000000_add_oauth_token_storage.sql`
3. Paste it into the SQL editor
4. Click "Run" to execute

The key changes:
- Added `SET search_path = public, auth, pg_temp` to ensure the function can access the `auth` schema
- Improved error handling to check if user exists
- Better handling of JSONB operations

## Verify the Fix

After applying, test the function:

```sql
-- Replace {your-user-id} with your actual UUID
SELECT store_oauth_token(
  '{your-user-id}'::uuid,
  'google',
  'test_token_123',
  'test_refresh_token_456',
  1234567890
);
```

If it runs without error, the migration is fixed.

