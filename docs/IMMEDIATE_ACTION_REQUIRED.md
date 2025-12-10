# IMMEDIATE ACTION REQUIRED - Query Timeout Fix

## Current Status

✅ **RLS Policy Fixed** - Policy now allows `auth.uid() = user_id OR user_id IS NULL`  
❌ **Queries Still Timing Out** - Console shows "Query timeout after 20 seconds"  
❌ **New Code Not Loaded** - Still using old 20-second timeout instead of new 3-second timeout

## Immediate Steps

### Step 1: Hard Refresh Browser (CRITICAL)

The new code with optimized queries hasn't loaded yet. Do a hard refresh:

**Windows/Linux:**
- `Ctrl + Shift + R` or `Ctrl + F5`

**Mac:**
- `Cmd + Shift + R`

**Or:**
1. Open DevTools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

**Verify:** After refresh, console should show:
```
[DocumentsSidebar] Using separate queries (join was causing timeouts)
[DocumentsSidebar] Querying jobs for user_id: ...
```

NOT:
```
Query timeout after 20 seconds  ❌ (old code)
```

### Step 2: Verify Database Indexes

Run this in Supabase SQL Editor:

```sql
-- Check if indexes exist
SELECT 
  indexname, 
  indexdef
FROM pg_indexes 
WHERE tablename = 'processing_jobs'
ORDER BY indexname;
```

**Expected indexes:**
- `processing_jobs_user_id_analysis_target_idx`
- `processing_jobs_created_at_idx`
- `processing_jobs_user_analysis_created_idx`

**If missing:** Run migration:
```sql
-- From: supabase/migrations/20251203012910_add_processing_jobs_indexes.sql

CREATE INDEX IF NOT EXISTS processing_jobs_user_id_analysis_target_idx 
  ON processing_jobs(user_id, analysis_target);

CREATE INDEX IF NOT EXISTS processing_jobs_created_at_idx 
  ON processing_jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS processing_jobs_user_analysis_created_idx 
  ON processing_jobs(user_id, analysis_target, created_at DESC);
```

### Step 3: Verify RLS Policy

Run this in Supabase SQL Editor:

```sql
-- Check RLS policy allows NULL user_id
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'processing_jobs' 
  AND cmd = 'SELECT';
```

**Expected:** The `qual` column should contain:
```
(auth.uid() = user_id OR user_id IS NULL)
```

**If not:** Run migration:
```sql
-- From: supabase/migrations/20251203012909_fix_processing_jobs_rls.sql

DROP POLICY IF EXISTS "Users can select their own processing jobs" ON processing_jobs;

CREATE POLICY "Users can select their own processing jobs"
  ON processing_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);
```

### Step 4: Test Query Directly

Run this in Supabase SQL Editor (as authenticated user):

```sql
-- Test the exact query the app uses
SELECT 
  id,
  file_name,
  status,
  analysis_target,
  created_at
FROM processing_jobs
WHERE user_id = auth.uid()
  AND analysis_target = 'document-analysis'
ORDER BY created_at DESC
LIMIT 10;
```

**Expected:** Should return results in < 1 second

**If slow:** Check query plan:
```sql
EXPLAIN ANALYZE
SELECT id, file_name, status
FROM processing_jobs
WHERE user_id = auth.uid()
  AND analysis_target = 'document-analysis'
ORDER BY created_at DESC
LIMIT 10;
```

Look for "Index Scan" in the plan. If you see "Seq Scan" (sequential scan), indexes are missing.

### Step 5: Check for NULL user_id Documents

```sql
-- Check if there are documents with NULL user_id
SELECT COUNT(*) as null_user_docs
FROM processing_jobs
WHERE user_id IS NULL
  AND analysis_target = 'document-analysis';
```

If this returns > 0, those documents need the RLS policy to allow NULL.

## Expected Results After Fix

**Console logs should show:**
```
[DocumentsSidebar] Using separate queries (join was causing timeouts)
[DocumentsSidebar] Querying jobs for user_id: 39d6e8e4-fad4-4d31-b364-44b0ac864918
[DocumentsSidebar] ✅ Loaded X user jobs + Y NULL user_id jobs = Z total
[DocumentsSidebar] ✅ Loaded Z jobs
[DocumentsSidebar] Fetching analysis_results for Z jobs...
[DocumentsSidebar] ✅ Loaded X analysis results (Y jobs have summaries)
```

**NOT:**
```
Query timeout after 20 seconds  ❌
Query timeout after 20 seconds  ❌
```

## Troubleshooting

### If Still Timing Out After Hard Refresh

1. **Check build process:**
   - If using Vite: `npm run build` or `npm run dev`
   - Clear browser cache completely
   - Try incognito/private window

2. **Check Supabase connection:**
   - Verify `VITE_SUPABASE_URL` is correct
   - Check network tab for failed requests
   - Verify no CORS errors

3. **Check database performance:**
   - Go to Supabase Dashboard → Database → Query Performance
   - Look for slow queries on `processing_jobs`
   - Check database CPU/memory usage

4. **Test with simpler query:**
   ```sql
   -- Simplest possible query
   SELECT COUNT(*) FROM processing_jobs WHERE user_id = auth.uid();
   ```
   If this is slow, the issue is with RLS or indexes, not the query structure.

## Summary of All Fixes Applied

1. ✅ **Removed join query** - Using separate queries for `processing_jobs` and `analysis_results`
2. ✅ **Split OR query** - Two separate queries instead of `.or()` for better index usage
3. ✅ **Reduced timeout** - 3 seconds per query (should complete in < 1 second)
4. ✅ **Updated RLS policy** - Allows `user_id IS NULL` for backward compatibility
5. ✅ **Better error handling** - More specific diagnostics

## Next Steps

1. **Hard refresh browser** (most important!)
2. **Verify indexes exist** in database
3. **Check console logs** for new query structure
4. **Test queries directly** in Supabase SQL Editor

If queries still timeout after all these steps, the issue is likely:
- Database connection/network issue
- Supabase instance performance problem
- Missing indexes that can't be created
