# Apply OAuth Token Storage Migration

If you're getting "Stored 0 OAuth token(s)" or RPC function errors, the database migration may not have been applied.

## Check if Migration is Applied

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/database/functions)
2. Look for the function `store_oauth_token` in the list
3. If it doesn't exist, you need to apply the migration

## Apply the Migration

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to [Supabase Dashboard SQL Editor](https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/sql/new)
2. Copy the contents of `supabase/migrations/20250130000000_add_oauth_token_storage.sql`
3. Paste it into the SQL editor
4. Click "Run" to execute

### Option 2: Via Supabase CLI

```bash
# Link your project (if not already linked)
npx supabase link --project-ref akxdroedpsvmckvqvggr

# Push the migration
npx supabase db push
```

### Option 3: Manual SQL Execution

1. Connect to your Supabase database via any PostgreSQL client
2. Run the SQL from `supabase/migrations/20250130000000_add_oauth_token_storage.sql`

## Verify Migration

After applying, verify the function exists:

```sql
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'store_oauth_token';
```

You should see the function listed.

## Test the Function

You can test the function directly:

```sql
-- Replace {user_id} with your actual user UUID
SELECT store_oauth_token(
  '{user_id}'::uuid,
  'google',
  'test_token',
  'test_refresh_token',
  1234567890
);
```

If it runs without error, the migration is applied correctly.

