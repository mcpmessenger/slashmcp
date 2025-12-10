# CRITICAL: RLS Policy Fix Required

## Problem

The `processing_jobs` RLS policy is blocking queries and causing 20+ second timeouts.

**Current RLS Policy:**
```sql
USING (auth.uid() = user_id);
```

**Query being used:**
```typescript
.or(`user_id.eq.${userId},user_id.is.null`)
```

**Issue:** The RLS policy only allows `auth.uid() = user_id`, but the query tries to get rows where `user_id IS NULL`. When `user_id IS NULL`, the condition `auth.uid() = NULL` evaluates to FALSE, so those rows are blocked by RLS.

## Solution

**Update the RLS policy to allow NULL user_id:**

Run this in Supabase SQL Editor:

```sql
-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can select their own processing jobs" ON processing_jobs;

-- Recreate with NULL user_id support
CREATE POLICY "Users can select their own processing jobs"
  ON processing_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);
```

**Or apply the migration:**
```bash
# Run the migration file
supabase/migrations/20251207010000_fix_processing_jobs_rls_null_userid.sql
```

## Why This Matters

1. **Backward Compatibility:** Documents uploaded before `user_id` was set have `user_id = NULL`
2. **Query Performance:** The `.or()` query with NULL check is slow if RLS blocks it
3. **User Experience:** Without this fix, queries timeout and documents don't show

## Verification

After applying the fix, run this query in Supabase SQL Editor (as authenticated user):

```sql
SELECT COUNT(*) 
FROM processing_jobs
WHERE (user_id = auth.uid() OR user_id IS NULL)
  AND analysis_target = 'document-analysis';
```

**Expected:** Should return a count (not 0) and complete in < 1 second

## Security Note

This policy allows any authenticated user to see documents with `user_id IS NULL`. This is intentional for backward compatibility. If you want stricter security:

1. Update existing NULL `user_id` rows to assign them to specific users
2. Then change the policy back to only allow `auth.uid() = user_id`
